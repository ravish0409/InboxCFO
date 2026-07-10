"""Ingest-time extraction: one LLM call per source, results written as typed rows.

The chat agent never sees raw emails — it queries these tables. Extracting once at
ingest time is what makes spend questions return correct SQL sums, not LLM guesses.
"""

import calendar
from datetime import date, datetime, timedelta
from email.utils import parsedate_to_datetime

from sqlmodel import Session, select

from ..categories import (
    BILL_CATEGORIES,
    DOCUMENT_TYPES,
    SUBSCRIPTION_CATEGORIES,
    TRANSACTION_CATEGORIES,
    coerce,
)
from ..models import Bill, DocumentRecord, Source, Subscription, Transaction
from .llm import chat_json
from .normalize import content_hash, norm_key

EXTRACTION_SYSTEM = """You are a precise financial document parser. You receive the text of ONE email or document.
Extract structured records. Output ONLY a JSON object with this exact shape (all arrays may be empty):

{
  "subscriptions": [{"name": str, "category": "music|video|food|cloud|news|fitness|other",
                     "amount": number|null, "currency": str, "billing_cycle": "monthly|yearly|weekly",
                     "next_renewal": "YYYY-MM-DD"|null, "is_trial": bool, "trial_end_date": "YYYY-MM-DD"|null,
                     "auto_renews": bool, "cancel_url": str}],
  "bills": [{"name": str, "category": "utility|insurance|rent|telecom|other", "amount": number|null,
             "currency": str, "due_date": "YYYY-MM-DD"|null, "status": "due|paid"}],
  "transactions": [{"merchant": str, "category": "food|shopping|transport|entertainment|bills|other",
                    "amount": number, "currency": str, "txn_date": "YYYY-MM-DD"|null, "description": str}],
  "documents": [{"doc_type": "insurance_policy|warranty|statement|receipt|other", "title": str,
                 "provider": str, "expiry_date": "YYYY-MM-DD"|null, "amount": number|null,
                 "currency": str, "summary": str}]
}

Rules:
- A recurring service receipt/renewal (Netflix, Spotify, etc.) -> one "subscriptions" entry AND one "transactions" entry if a charge occurred.
- A "your free trial ends" / "trial ending" email -> subscription with is_trial=true and trial_end_date set (the date the trial converts to paid). No transaction yet.
- If the email says the plan auto-renews (or is silent) set auto_renews=true; if it says it will NOT renew, set auto_renews=false.
- If the email contains a cancellation/manage-subscription link, put the full URL in cancel_url; else "".
- A bank debit/credit alert -> "transactions" only.
- A utility/insurance bill or renewal notice -> "bills" (and "documents" if it is a policy with an expiry date).
- Insurance policies, warranties -> "documents" with expiry_date. Set summary to one useful sentence.
- Amounts: numbers only, no symbols. Currency as 3-letter code (default INR if ₹ or Rs).
- Dates in ISO format. Resolve relative dates using the email date given. Use null when unknown — NEVER invent amounts or dates.
- Marketing/spam with no financial data -> all arrays empty."""


_DATE_FORMATS = (
    "%d %b %Y", "%d %B %Y", "%d/%m/%Y", "%d-%m-%Y",
    "%b %d, %Y", "%B %d, %Y", "%m/%d/%Y",
)


def _parse_date(value) -> date | None:
    """Tolerant date parse (§3A.5): ISO first, then common day/month orders, then a
    RFC-2822 email `Date` header. Never throws — returns None on anything unrecognised."""
    if not value or not isinstance(value, str):
        return None
    s = value.strip()
    # ISO first (handles "2026-03-14" and "2026-03-14T09:00:00").
    try:
        return datetime.strptime(s[:10], "%Y-%m-%d").date()
    except ValueError:
        pass
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    # RFC-2822 email Date header, e.g. "Wed, 14 Mar 2026 09:00:00 +0530".
    try:
        dt = parsedate_to_datetime(s)
        if dt is not None:
            return dt.date()
    except (TypeError, ValueError):
        pass
    return None


def _num(value) -> float | None:
    """Tolerant amount parse (§3A.5): strips currency symbols/codes and thousands
    commas so "₹1,286.00", "Rs.499", "INR 8,450" all become floats. None on failure."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).strip().lower()
    # Order matters: "rs." before "rs" so "rs.499" doesn't leave a leading dot.
    for token in ("inr", "rs.", "rs", "usd", "$", "₹", ",", " "):
        s = s.replace(token, "")
    if not s:
        return None
    try:
        return float(s)
    except (TypeError, ValueError):
        return None


def _add_months(d: date, months: int) -> date:
    """Add whole months to a date, clamping the day to the target month's length
    (Jan 31 + 1 month -> Feb 28/29)."""
    m = d.month - 1 + months
    year, month = d.year + m // 12, m % 12 + 1
    last = calendar.monthrange(year, month)[1]
    return date(year, month, min(d.day, last))


def _advance_renewal(d: date | None, cycle: str, today: date) -> date | None:
    """Roll a past renewal date forward by whole billing cycles until it is >= today,
    so a lapsed date doesn't silently drop out of renewal alerts. A future/null date is
    returned unchanged. Guarded against runaway loops on absurd inputs."""
    if d is None or d >= today:
        return d
    for _ in range(1200):
        if cycle == "weekly":
            d = d + timedelta(days=7)
        elif cycle == "yearly":
            d = _add_months(d, 12)
        else:  # monthly (default)
            d = _add_months(d, 1)
        if d >= today:
            break
    return d


def _charge_date(next_renewal: date | None, cycle: str, fallback: date) -> date:
    """Best estimate of the date THIS invoice's charge occurred: one billing cycle before
    the next renewal (the current period's start). Uploads stamp `received_at` with the
    upload date, so the invoice's own renewal date — not `received_at` — is the reliable
    anchor. Falls back to `fallback` when no renewal date is known."""
    if next_renewal is None:
        return fallback
    if cycle == "weekly":
        return next_renewal - timedelta(days=7)
    if cycle == "yearly":
        return _add_months(next_renewal, -12)
    return _add_months(next_renewal, -1)


def _txn_dedup_key(merchant: str, txn_date: date | None, amount: float, currency: str) -> str:
    """merchant|date|amount|currency fingerprint so the same charge isn't counted twice."""
    d = txn_date.isoformat() if txn_date else ""
    return f"{norm_key(merchant)}|{d}|{amount:.2f}|{(currency or 'INR').upper()}"


def _add_transaction(session: Session, source: Source, *, merchant: str, amount: float,
                     currency: str, category, description: str, txn_date: date | None,
                     counts: dict) -> None:
    """Insert a transaction unless an identical one (by dedup_key) already exists. This is
    the single path for BOTH LLM-emitted charges and subscription-derived payments, so a
    re-ingest or a charge seen twice never double-counts."""
    if amount is None or not merchant:
        return
    key = _txn_dedup_key(merchant, txn_date, amount, currency)
    session.flush()  # make prior inserts in this batch visible to the dedup query
    if session.exec(select(Transaction).where(Transaction.dedup_key == key)).first():
        return
    session.add(Transaction(
        source_id=source.id,
        merchant=str(merchant).strip(),
        category=coerce(category, TRANSACTION_CATEGORIES),
        amount=amount,
        currency=currency or "INR",
        txn_date=txn_date,
        description=description or "",
        dedup_key=key,
    ))
    counts["transactions"] += 1


def _bill_period(due: date | None):
    """Coarse billing period for recurring-bill rollup — (year, month), or None."""
    return (due.year, due.month) if due else None


def _upsert_subscription(session: Session, source: Source, s: dict, counts: dict) -> None:
    """A recurring service (monthly Netflix email) updates its existing row rather
    than inserting a new one each cycle — otherwise duplicate-detection and the
    total-monthly-cost sum are meaningless."""
    key = norm_key(s.get("name"))
    name = str(s["name"]).strip()
    existing = None
    if key:
        existing = session.exec(
            select(Subscription).where(
                Subscription.norm_key == key, Subscription.status == "active"
            )
        ).first()
    amount = _num(s.get("amount"))
    currency = s.get("currency") or "INR"
    next_renewal = _parse_date(s.get("next_renewal"))
    is_trial = bool(s.get("is_trial"))
    trial_end = _parse_date(s.get("trial_end_date"))
    cancel_url = (s.get("cancel_url") or "").strip()
    auto_renews = s.get("auto_renews")
    billing_cycle = s.get("billing_cycle") or (existing.billing_cycle if existing else "monthly")
    today = date.today()
    incoming_at = source.received_at or today

    if existing:
        # An invoice OLDER than the one that last advanced this row must not regress the
        # renewal date or fake a price change — record its charge as history only. Prefer
        # the invoice's own renewal date (reliable for uploads, whose received_at is just
        # the upload day); fall back to received_at for documents with no renewal date.
        if next_renewal is not None and existing.next_renewal is not None:
            is_stale = next_renewal < existing.next_renewal
        else:
            is_stale = existing.last_invoice_at is not None and incoming_at < existing.last_invoice_at
        if is_stale:
            counts["stale_invoices"] += 1
            counts["notes"].append(
                f"{existing.name}: looks like an older invoice — recorded as historical, renewal unchanged"
            )
        else:
            # Keep the freshest signal from the newer source; don't overwrite good data with null.
            if amount is not None:
                same_currency = (existing.currency or "INR").upper() == currency.upper()
                # Only a real INCREASE in the SAME currency is a price hike. A currency switch
                # updates the amount but is never flagged as a change (comparison is meaningless).
                if existing.amount is not None and same_currency and amount > existing.amount:
                    existing.previous_amount = existing.amount
                    existing.price_change_at = incoming_at
                existing.amount = amount
                existing.currency = currency
            # Roll forward only — never regress the renewal to an earlier date.
            if next_renewal is not None and (
                existing.next_renewal is None or next_renewal >= existing.next_renewal
            ):
                existing.next_renewal = _advance_renewal(next_renewal, billing_cycle, today)
            if trial_end is not None:
                existing.trial_end_date = trial_end
            if is_trial:
                existing.is_trial = True
            if cancel_url:
                existing.cancel_url = cancel_url
            if auto_renews is not None:
                existing.auto_renews = bool(auto_renews)
            existing.category = coerce(s.get("category"), SUBSCRIPTION_CATEGORIES)
            existing.billing_cycle = billing_cycle
            existing.last_invoice_at = incoming_at
            existing.source_id = source.id
            session.add(existing)
            counts["subscriptions_updated"] += 1
    else:
        session.add(Subscription(
            source_id=source.id,
            name=name,
            norm_key=key,
            category=coerce(s.get("category"), SUBSCRIPTION_CATEGORIES),
            amount=amount,
            currency=currency,
            billing_cycle=billing_cycle,
            next_renewal=_advance_renewal(next_renewal, billing_cycle, today),
            is_trial=is_trial,
            trial_end_date=trial_end,
            cancel_url=cancel_url,
            auto_renews=bool(auto_renews) if auto_renews is not None else True,
            last_invoice_at=incoming_at,
        ))
        counts["subscriptions"] += 1

    # Derive the payment as an idempotent transaction so an invoice contributes to spend
    # even when the LLM didn't emit one. Skip trials (no charge yet). If the LLM already
    # recorded a same-amount charge for THIS source (usually under a different merchant
    # string / date), don't derive a duplicate. The charge is dated to the invoice's own
    # period — NOT the upload day — so it lands in the right month and doesn't collide with
    # a sibling invoice's derived charge.
    if amount is not None and not is_trial:
        session.flush()
        same_source = session.exec(
            select(Transaction).where(
                Transaction.source_id == source.id,
                Transaction.currency == currency,
            )
        ).all()
        if not any(abs((t.amount or 0) - amount) < 0.01 for t in same_source):
            _add_transaction(
                session, source,
                merchant=name,
                amount=amount,
                currency=currency,
                category="bills",
                description=f"{name} {billing_cycle} charge",
                txn_date=_charge_date(next_renewal, billing_cycle, incoming_at),
                counts=counts,
            )


def extract_source(session: Session, source: Source) -> dict:
    """Run LLM extraction for one stored Source and persist the typed rows."""
    user = (
        f"Email/document date: {source.received_at or 'unknown'}\n"
        f"From: {source.sender or 'unknown'}\n"
        f"Subject/title: {source.title}\n"
        f"Today's date: {date.today().isoformat()}\n\n"
        f"--- CONTENT ---\n{source.raw_text[:12000]}"
    )
    data = chat_json(
        EXTRACTION_SYSTEM, user,
        require_keys=["subscriptions", "bills", "transactions", "documents"],
    )
    counts = {
        "subscriptions": 0, "subscriptions_updated": 0,
        "bills": 0, "transactions": 0, "documents": 0,
        "stale_invoices": 0, "notes": [],
    }

    # Transactions first: subscription-derived payments (below) dedup against these, so an
    # invoice that the LLM already recorded as a charge isn't counted twice.
    for t in data.get("transactions") or []:
        amount = _num(t.get("amount"))
        if not t.get("merchant") or amount is None:
            continue
        _add_transaction(
            session, source,
            merchant=str(t["merchant"]).strip(),
            amount=amount,
            currency=t.get("currency") or "INR",
            category=t.get("category"),
            description=t.get("description") or "",
            txn_date=_parse_date(t.get("txn_date")) or source.received_at,
            counts=counts,
        )

    for s in data.get("subscriptions") or []:
        if not s.get("name"):
            continue
        _upsert_subscription(session, source, s, counts)

    for b in data.get("bills") or []:
        if not b.get("name"):
            continue
        name = str(b["name"]).strip()
        key = norm_key(b.get("name"))
        due = _parse_date(b.get("due_date"))
        amount = _num(b.get("amount"))
        currency = b.get("currency") or "INR"
        category = coerce(b.get("category"), BILL_CATEGORIES, default="utility")
        status = b.get("status") or "due"
        period = _bill_period(due)

        # Recurring-bill rollup: find the current outstanding (due) bill for this provider.
        # Consecutive invoices supersede the prior period rather than piling up duplicates.
        existing = session.exec(
            select(Bill).where(Bill.norm_key == key, Bill.status == "due")
        ).first() if key else None
        if existing:
            ex_period = _bill_period(existing.due_date)
            if period is not None and ex_period == period:
                # Same period restated -> update in place.
                if amount is not None:
                    existing.amount = amount
                existing.status = status
                existing.currency = currency
                existing.source_id = source.id
                session.add(existing)
                continue
            if period is not None and ex_period is not None and period < ex_period:
                # Older than the outstanding bill -> historical only; never resurrect a due.
                counts["stale_invoices"] += 1
                counts["notes"].append(f"{name}: older bill — recorded as paid history")
                session.add(Bill(
                    source_id=source.id, name=name, norm_key=key, category=category,
                    amount=amount, currency=currency, due_date=due, status="paid",
                ))
                counts["bills"] += 1
                continue
            # Newer period supersedes: settle the prior obligation, then insert the new one.
            existing.status = "paid"
            session.add(existing)

        session.add(Bill(
            source_id=source.id,
            name=name,
            norm_key=key,
            category=category,
            amount=amount,
            currency=currency,
            due_date=due,
            status=status,
        ))
        counts["bills"] += 1

    for d in data.get("documents") or []:
        if not d.get("title"):
            continue
        title = str(d["title"]).strip()
        provider = d.get("provider") or ""
        # Same policy/warranty re-notified -> update expiry/amount, don't duplicate.
        existing = session.exec(
            select(DocumentRecord).where(
                DocumentRecord.title == title, DocumentRecord.provider == provider
            )
        ).first()
        expiry = _parse_date(d.get("expiry_date"))
        if existing:
            if expiry is not None:
                existing.expiry_date = expiry
            if _num(d.get("amount")) is not None:
                existing.amount = _num(d.get("amount"))
            existing.summary = d.get("summary") or existing.summary
            existing.source_id = source.id
            session.add(existing)
            continue
        session.add(DocumentRecord(
            source_id=source.id,
            doc_type=coerce(d.get("doc_type"), DOCUMENT_TYPES),
            title=title,
            provider=provider,
            expiry_date=expiry,
            amount=_num(d.get("amount")),
            currency=d.get("currency") or "INR",
            summary=d.get("summary") or "",
        ))
        counts["documents"] += 1

    session.commit()
    return counts


_COUNT_LABELS = (
    ("subscriptions", "subscription", "subscriptions"),
    ("bills", "bill", "bills"),
    ("transactions", "transaction", "transactions"),
    ("documents", "document", "documents"),
)


def summarize_counts(counts: dict) -> str:
    """Human line for one processed source, e.g. "1 subscription · 2 transactions".
    Includes updated (not just new) subscriptions so a renewal email doesn't read
    as "no new records"."""
    parts = [
        f"{counts[key]} {one if counts[key] == 1 else many}"
        for key, one, many in _COUNT_LABELS
        if counts.get(key)
    ]
    updated = counts.get("subscriptions_updated", 0)
    if updated:
        parts.append(f"{updated} updated")
    summary = " · ".join(parts) or "no new records"
    notes = counts.get("notes") or []
    if notes:
        summary += " — " + "; ".join(notes)
    return summary


def find_source_by_hash(session: Session, digest: str) -> Source | None:
    """Return an already-ingested source with this content fingerprint, if any."""
    if not digest:
        return None
    return session.exec(select(Source).where(Source.content_hash == digest)).first()


def store_source(
    session: Session,
    *,
    source_type: str,
    title: str,
    sender: str = "",
    received_at: date | None = None,
    raw_text: str = "",
    external_id: str | None = None,
) -> Source:
    source = Source(
        source_type=source_type,
        title=title,
        sender=sender,
        received_at=received_at,
        snippet=raw_text.strip().replace("\n", " ")[:300],
        raw_text=raw_text,
        external_id=external_id,
        # Hash body + sender only (NOT title/filename) so the same PDF re-uploaded under
        # a different filename still dedups.
        content_hash=content_hash(sender, raw_text),
    )
    session.add(source)
    session.commit()
    session.refresh(source)
    return source
