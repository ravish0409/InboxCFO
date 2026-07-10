from datetime import date, datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class Source(SQLModel, table=True):
    """A raw ingested item (email or uploaded document) that extractions point back to."""

    id: Optional[int] = Field(default=None, primary_key=True)
    source_type: str = "email"  # email | pdf | text
    title: str = ""  # email subject or filename
    sender: str = ""
    received_at: Optional[date] = None
    snippet: str = ""
    raw_text: str = ""
    external_id: Optional[str] = Field(default=None, index=True)  # gmail message id, for dedup
    content_hash: Optional[str] = Field(default=None, index=True)  # sha256 of content, for idempotent upload
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Subscription(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    source_id: Optional[int] = Field(default=None, foreign_key="source.id")
    name: str  # e.g. "Netflix"
    norm_key: str = Field(default="", index=True)  # normalized name, for cross-source upsert
    category: str = "other"  # music | video | food | cloud | news | fitness | other
    amount: Optional[float] = None
    currency: str = "INR"
    billing_cycle: str = "monthly"  # monthly | yearly | weekly
    next_renewal: Optional[date] = None
    status: str = "active"
    # Email-only interception signals — things a bank feed can't see until after the charge.
    is_trial: bool = False
    trial_end_date: Optional[date] = None
    cancel_url: str = ""  # cancellation link, when the email includes one
    auto_renews: bool = True
    previous_amount: Optional[float] = None  # set on upsert when the price changes
    price_change_at: Optional[date] = None
    # received_at of the source that last advanced this row — the recency anchor used to
    # reject stale (older) invoices and to roll `next_renewal` forward, never backward.
    last_invoice_at: Optional[date] = None


class Bill(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    source_id: Optional[int] = Field(default=None, foreign_key="source.id")
    name: str  # e.g. "BESCOM Electricity"
    norm_key: str = Field(default="", index=True)  # normalized name, for recurring-bill rollup
    category: str = "utility"  # utility | insurance | rent | telecom | other
    amount: Optional[float] = None
    currency: str = "INR"
    due_date: Optional[date] = None
    status: str = "due"  # due | paid


class Transaction(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    source_id: Optional[int] = Field(default=None, foreign_key="source.id")
    merchant: str
    category: str = "other"  # food | shopping | transport | entertainment | bills | other
    amount: float
    currency: str = "INR"
    txn_date: Optional[date] = None
    description: str = ""
    # merchant|date|amount|currency fingerprint, so the same charge from two sources
    # (or a re-derived subscription payment) is only counted once.
    dedup_key: str = Field(default="", index=True)


class DocumentRecord(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    source_id: Optional[int] = Field(default=None, foreign_key="source.id")
    doc_type: str = "other"  # insurance_policy | warranty | statement | receipt | other
    title: str
    provider: str = ""
    expiry_date: Optional[date] = None
    amount: Optional[float] = None
    currency: str = "INR"
    summary: str = ""


class InsightsCache(SQLModel, table=True):
    """Cached LLM savings suggestions. Single row (id=1). Regenerated on ingest so
    that GET /api/insights never blocks on a live LLM call. The rule-based parts of
    insights (duplicates, renewals, totals) are recomputed fresh each request."""

    id: Optional[int] = Field(default=None, primary_key=True)
    suggestions_json: str = "[]"  # JSON-encoded list[dict]
    llm_used: bool = False
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class Conversation(SQLModel, table=True):
    """A saved assistant chat thread. Messages hang off it via conversation_id."""

    id: Optional[int] = Field(default=None, primary_key=True)
    title: str = "New chat"  # derived from the first user turn
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class ChatMessage(SQLModel, table=True):
    """One turn in a conversation. trace (tool steps) and sources (cited emails) are
    stored as JSON strings since they're opaque display payloads, not queried columns."""

    id: Optional[int] = Field(default=None, primary_key=True)
    conversation_id: int = Field(foreign_key="conversation.id", index=True)
    position: int = 0  # 0-based order within the conversation
    role: str = "user"  # user | assistant
    content: str = ""
    trace_json: str = "[]"  # JSON-encoded list[{"tool": str}]
    sources_json: str = "[]"  # JSON-encoded list[dict]
    error: bool = False


class ActionItem(SQLModel, table=True):
    """A surfaced 'thing to review' — the draft-and-approve unit. Regenerated
    idempotently from current signals (keyed by dedup_key) while preserving the
    user's status (dismissed/approved) and any generated draft."""

    id: Optional[int] = Field(default=None, primary_key=True)
    kind: str  # trial_ending | renewal_upcoming | price_increase | duplicate
    title: str = ""
    detail: str = ""
    severity: str = "medium"  # high | medium | low
    estimated_saving: Optional[float] = None
    currency: str = "INR"
    subscription_id: Optional[int] = Field(default=None, foreign_key="subscription.id")
    source_id: Optional[int] = Field(default=None, foreign_key="source.id")
    status: str = "open"  # open | drafted | approved | dismissed
    draft_text: str = ""  # generated cancellation email
    dedup_key: str = Field(default="", index=True)  # e.g. "trial_ending:12"
    created_at: datetime = Field(default_factory=datetime.utcnow)
