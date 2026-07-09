"""Canonical category taxonomies — the single source of truth shared by the
extraction prompt, the query/insight tools, and validation.

Keeping these here (instead of hard-coded in prompts and tool descriptions that
drift apart) is what lets duplicate-detection and spend-by-category actually line up.
"""

# Subscriptions: recurring services.
SUBSCRIPTION_CATEGORIES = ["music", "video", "food", "cloud", "news", "fitness", "other"]

# Bills: one-off / periodic obligations.
BILL_CATEGORIES = ["utility", "insurance", "rent", "telecom", "other"]

# Transactions: individual charges (drives spend-by-category).
TRANSACTION_CATEGORIES = ["food", "shopping", "transport", "entertainment", "bills", "other"]

# Documents.
DOCUMENT_TYPES = ["insurance_policy", "warranty", "statement", "receipt", "other"]


def coerce(value: str | None, allowed: list[str], default: str = "other") -> str:
    """Snap an LLM-supplied category onto the allowed set; fall back to `default`."""
    v = (value or "").strip().lower()
    return v if v in allowed else default
