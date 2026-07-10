"""Hardcoded FX rates → INR for aggregate totals (hackathon stopgap — no live rates yet).

Per-item amounts are ALWAYS shown in their own currency; these rates are used only when we
sum across currencies (monthly recurring total, spend-this-month, spend-by-month, savings).
Keep this table in sync with the frontend copy in `frontend/src/api.js` (RATES_TO_INR)."""

# Approximate mid-market rates to INR, mid-2026. Adjust as needed — this is deliberately
# a static table so aggregation never depends on a network call.
RATES_TO_INR: dict[str, float] = {
    "INR": 1.0,
    "USD": 83.0,
    "EUR": 90.0,
    "GBP": 105.0,
    "JPY": 0.55,
    "CNY": 11.5,
    "AUD": 55.0,
    "CAD": 61.0,
    "SGD": 62.0,
    "AED": 22.6,
    "CHF": 94.0,
}


def to_inr(amount: float | None, currency: str | None = "INR") -> float:
    """Convert `amount` in `currency` to INR using the static table. `None` amounts become
    0.0, and an unknown currency is treated as already-INR (rate 1.0) so a total is never
    silently dropped."""
    if amount is None:
        return 0.0
    rate = RATES_TO_INR.get((currency or "INR").upper(), 1.0)
    return amount * rate
