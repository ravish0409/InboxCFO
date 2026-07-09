"""Entity normalization + content hashing.

Two jobs, both about making the data trustworthy enough for an agent to act on:
- `norm_key`  : collapse "SWIGGY", "Swiggy Ltd", "swiggy.in" -> one key so spend
                sums and subscription upserts don't split/double-count.
- `content_hash`: stable fingerprint of an ingested source so the same email/file
                uploaded twice doesn't get extracted (and counted) twice.
"""

import hashlib
import re

# Corporate/legal suffixes and noise words that don't distinguish an entity.
_SUFFIXES = {
    "ltd", "limited", "pvt", "private", "inc", "incorporated", "llc", "llp",
    "corp", "corporation", "co", "company", "plc", "gmbh", "technologies",
    "tech", "services", "solutions", "india", "in", "com",
}

_PUNCT = re.compile(r"[^a-z0-9\s]+")
_WS = re.compile(r"\s+")


def norm_key(name: str | None) -> str:
    """Canonical lookup key for a merchant/service name.

    Lowercases, strips domains, punctuation and corporate suffixes, and collapses
    whitespace. "Swiggy Ltd." / "SWIGGY" / "swiggy.in" all -> "swiggy".
    Returns "" for empty input (callers should treat that as "no key").
    """
    if not name:
        return ""
    s = name.strip().lower()
    # drop a trailing domain like "swiggy.in" -> "swiggy"
    s = re.sub(r"\b([a-z0-9-]+)\.(com|in|co|io|net|org)\b", r"\1", s)
    s = _PUNCT.sub(" ", s)
    tokens = [t for t in _WS.sub(" ", s).split(" ") if t and t not in _SUFFIXES]
    return " ".join(tokens).strip()


def content_hash(*parts: str) -> str:
    """SHA-256 over the meaningful content of a source, for idempotent ingest.

    Pass the pieces that define identity (e.g. sender + subject + body). Whitespace
    is normalized so trivial reformatting doesn't defeat the dedup.
    """
    joined = "\n".join(_WS.sub(" ", (p or "").strip()) for p in parts)
    return hashlib.sha256(joined.encode("utf-8", errors="replace")).hexdigest()
