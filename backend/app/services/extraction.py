"""Ingest-time extraction: one LLM call per source, results written as typed rows.

The chat agent never sees raw emails — it queries these tables. Extracting once at
ingest time is what makes spend questions return correct SQL sums, not LLM guesses.
"""

from datetime import date, datetime
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


def _upsert_subscription(session: Session, source: Source, s: dict, counts: dict) -> None:
    """A recurring service (monthly Netflix email) updates its existing row rather
    than inserting a new one each cycle — otherwise duplicate-detection and the
    total-monthly-cost sum are meaningless."""
    key = norm_key(s.get("name"))
    existing = None
    if key:
        existing = session.exec(
            select(Subscription).where(
                Subscription.norm_key == key, Subscription.status == "active"
            )
        ).first()
    amount = _num(s.get("amount"))
    next_renewal = _parse_date(s.get("next_renewal"))
    is_trial = bool(s.get("is_trial"))
    trial_end = _parse_date(s.get("trial_end_date"))
    cancel_url = (s.get("cancel_url") or "").strip()
    auto_renews = s.get("auto_renews")
    if existing:
        # Keep the freshest signal from the newer source; don't overwrite good data with null.
        if amount is not None:
            # A price change is exactly the signal a bank feed can't see until after the charge.
            if existing.amount is not None and amount != existing.amount:
                existing.previous_amount = existing.amount
                existing.price_change_at = source.received_at or date.today()
            existing.amount = amount
        if next_renewal is not None:
            existing.next_renewal = next_renewal
        if trial_end is not None:
            existing.trial_end_date = trial_end
        if is_trial:
            existing.is_trial = True
        if cancel_url:
            existing.cancel_url = cancel_url
        if auto_renews is not None:
            existing.auto_renews = bool(auto_renews)
        existing.category = coerce(s.get("category"), SUBSCRIPTION_CATEGORIES)
        existing.billing_cycle = s.get("billing_cycle") or existing.billing_cycle
        existing.source_id = source.id
        session.add(existing)
        counts["subscriptions_updated"] += 1
    else:
        session.add(Subscription(
            source_id=source.id,
            name=str(s["name"]).strip(),
            norm_key=key,
            category=coerce(s.get("category"), SUBSCRIPTION_CATEGORIES),
            amount=amount,
            currency=s.get("currency") or "INR",
            billing_cycle=s.get("billing_cycle") or "monthly",
            next_renewal=next_renewal,
            is_trial=is_trial,
            trial_end_date=trial_end,
            cancel_url=cancel_url,
            auto_renews=bool(auto_renews) if auto_renews is not None else True,
        ))
        counts["subscriptions"] += 1


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
    }

    for s in data.get("subscriptions") or []:
        if not s.get("name"):
            continue
        _upsert_subscription(session, source, s, counts)

    for b in data.get("bills") or []:
        if not b.get("name"):
            continue
        due = _parse_date(b.get("due_date"))
        key = norm_key(b.get("name"))
        # A bill for the same provider + same due date is the same obligation.
        existing = session.exec(
            select(Bill).where(Bill.name == str(b["name"]).strip(), Bill.due_date == due)
        ).first() if key else None
        if existing:
            if _num(b.get("amount")) is not None:
                existing.amount = _num(b.get("amount"))
            existing.status = b.get("status") or existing.status
            existing.source_id = source.id
            session.add(existing)
            continue
        session.add(Bill(
            source_id=source.id,
            name=str(b["name"]).strip(),
            category=coerce(b.get("category"), BILL_CATEGORIES, default="utility"),
            amount=_num(b.get("amount")),
            currency=b.get("currency") or "INR",
            due_date=due,
            status=b.get("status") or "due",
        ))
        counts["bills"] += 1

    for t in data.get("transactions") or []:
        amount = _num(t.get("amount"))
        if not t.get("merchant") or amount is None:
            continue
        # Individual charges are never deduped by name — each is a real event.
        # Re-ingesting the same source is prevented upstream by the content hash.
        session.add(Transaction(
            source_id=source.id,
            merchant=str(t["merchant"]).strip(),
            category=coerce(t.get("category"), TRANSACTION_CATEGORIES),
            amount=amount,
            currency=t.get("currency") or "INR",
            txn_date=_parse_date(t.get("txn_date")) or source.received_at,
            description=t.get("description") or "",
        ))
        counts["transactions"] += 1

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
    return " · ".join(parts) or "no new records"


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
        content_hash=content_hash(sender, title, raw_text),
    )
    session.add(source)
    session.commit()
    session.refresh(source)
    return source
