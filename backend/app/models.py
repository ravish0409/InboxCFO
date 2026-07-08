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
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Subscription(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    source_id: Optional[int] = Field(default=None, foreign_key="source.id")
    name: str  # e.g. "Netflix"
    category: str = "other"  # music | video | food | cloud | news | fitness | other
    amount: Optional[float] = None
    currency: str = "INR"
    billing_cycle: str = "monthly"  # monthly | yearly | weekly
    next_renewal: Optional[date] = None
    status: str = "active"


class Bill(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    source_id: Optional[int] = Field(default=None, foreign_key="source.id")
    name: str  # e.g. "BESCOM Electricity"
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
