"""Ingest-time extraction: one LLM call per source, results written as typed rows.

The chat agent never sees raw emails — it queries these tables. Extracting once at
ingest time is what makes spend questions return correct SQL sums, not LLM guesses.
"""

from datetime import date, datetime

from sqlmodel import Session

from ..models import Bill, DocumentRecord, Source, Subscription, Transaction
from .llm import chat_json

EXTRACTION_SYSTEM = """You are a precise financial document parser. You receive the text of ONE email or document.
Extract structured records. Output ONLY a JSON object with this exact shape (all arrays may be empty):

{
  "subscriptions": [{"name": str, "category": "music|video|food|cloud|news|fitness|other",
                     "amount": number|null, "currency": str, "billing_cycle": "monthly|yearly|weekly",
                     "next_renewal": "YYYY-MM-DD"|null}],
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
- A bank debit/credit alert -> "transactions" only.
- A utility/insurance bill or renewal notice -> "bills" (and "documents" if it is a policy with an expiry date).
- Insurance policies, warranties -> "documents" with expiry_date. Set summary to one useful sentence.
- Amounts: numbers only, no symbols. Currency as 3-letter code (default INR if ₹ or Rs).
- Dates in ISO format. Resolve relative dates using the email date given. Use null when unknown — NEVER invent amounts or dates.
- Marketing/spam with no financial data -> all arrays empty."""


def _parse_date(value) -> date | None:
    if not value or not isinstance(value, str):
        return None
    try:
        return datetime.strptime(value[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def _num(value) -> float | None:
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def extract_source(session: Session, source: Source) -> dict:
    """Run LLM extraction for one stored Source and persist the typed rows."""
    user = (
        f"Email/document date: {source.received_at or 'unknown'}\n"
        f"From: {source.sender or 'unknown'}\n"
        f"Subject/title: {source.title}\n"
        f"Today's date: {date.today().isoformat()}\n\n"
        f"--- CONTENT ---\n{source.raw_text[:12000]}"
    )
    data = chat_json(EXTRACTION_SYSTEM, user)
    counts = {"subscriptions": 0, "bills": 0, "transactions": 0, "documents": 0}

    for s in data.get("subscriptions") or []:
        if not s.get("name"):
            continue
        session.add(Subscription(
            source_id=source.id,
            name=str(s["name"]).strip(),
            category=s.get("category") or "other",
            amount=_num(s.get("amount")),
            currency=s.get("currency") or "INR",
            billing_cycle=s.get("billing_cycle") or "monthly",
            next_renewal=_parse_date(s.get("next_renewal")),
        ))
        counts["subscriptions"] += 1

    for b in data.get("bills") or []:
        if not b.get("name"):
            continue
        session.add(Bill(
            source_id=source.id,
            name=str(b["name"]).strip(),
            category=b.get("category") or "utility",
            amount=_num(b.get("amount")),
            currency=b.get("currency") or "INR",
            due_date=_parse_date(b.get("due_date")),
            status=b.get("status") or "due",
        ))
        counts["bills"] += 1

    for t in data.get("transactions") or []:
        amount = _num(t.get("amount"))
        if not t.get("merchant") or amount is None:
            continue
        session.add(Transaction(
            source_id=source.id,
            merchant=str(t["merchant"]).strip(),
            category=t.get("category") or "other",
            amount=amount,
            currency=t.get("currency") or "INR",
            txn_date=_parse_date(t.get("txn_date")) or source.received_at,
            description=t.get("description") or "",
        ))
        counts["transactions"] += 1

    for d in data.get("documents") or []:
        if not d.get("title"):
            continue
        session.add(DocumentRecord(
            source_id=source.id,
            doc_type=d.get("doc_type") or "other",
            title=str(d["title"]).strip(),
            provider=d.get("provider") or "",
            expiry_date=_parse_date(d.get("expiry_date")),
            amount=_num(d.get("amount")),
            currency=d.get("currency") or "INR",
            summary=d.get("summary") or "",
        ))
        counts["documents"] += 1

    session.commit()
    return counts


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
    )
    session.add(source)
    session.commit()
    session.refresh(source)
    return source
