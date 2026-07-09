"""Insights: rule-based duplicate detection (always works) + LLM savings suggestions (optional)."""

from datetime import date

from sqlmodel import Session, select

from ..models import Bill, Subscription
from .agent import find_duplicate_subscriptions, upcoming_renewals
from .llm import LLMNotConfigured, chat_json

SAVINGS_SYSTEM = """You are a pragmatic personal-finance advisor. Given a JSON summary of the user's
subscriptions, duplicate groups, and upcoming bills, suggest concrete ways to save money.
Output ONLY JSON: {"suggestions": [{"title": str, "detail": str, "estimated_monthly_saving": number|null, "currency": str}]}
Max 5 suggestions, most impactful first. Be specific (name the services). Never invent services not in the data."""


def _monthly_cost(s: Subscription) -> float:
    if s.amount is None:
        return 0.0
    return s.amount / 12 if s.billing_cycle == "yearly" else s.amount * (4.33 if s.billing_cycle == "weekly" else 1)


def build_insights(session: Session) -> dict:
    subs = session.exec(select(Subscription).where(Subscription.status == "active")).all()
    dupes = find_duplicate_subscriptions(session)["duplicate_groups"]
    renewals = upcoming_renewals(session, days=45)["items"]
    total_monthly = round(sum(_monthly_cost(s) for s in subs), 2)

    summary = {
        "total_monthly_subscription_cost": total_monthly,
        "subscriptions": [
            {"name": s.name, "category": s.category, "amount": s.amount,
             "billing_cycle": s.billing_cycle, "currency": s.currency} for s in subs
        ],
        "duplicate_groups": dupes,
        "upcoming_45_days": renewals,
    }

    suggestions: list[dict]
    llm_used = False
    try:
        data = chat_json(SAVINGS_SYSTEM, str(summary))
        suggestions = data.get("suggestions") or []
        llm_used = True
    except LLMNotConfigured:
        suggestions = _rule_based_suggestions(dupes, subs)
    except Exception:
        suggestions = _rule_based_suggestions(dupes, subs)

    return {
        "as_of": date.today().isoformat(),
        "total_monthly_subscription_cost": total_monthly,
        "duplicate_groups": dupes,
        "upcoming_renewals": renewals,
        "suggestions": suggestions,
        "llm_used": llm_used,
    }


def _rule_based_suggestions(dupes: list[dict], subs: list[Subscription]) -> list[dict]:
    out = []
    for g in dupes:
        cheapest = min(g["services"], key=lambda s: s.get("amount") or 0)
        others = [s["name"] for s in g["services"] if s["name"] != cheapest["name"]]
        saving = round(g["combined_monthly_cost"] - (cheapest.get("amount") or 0), 2)
        out.append({
            "title": f"You pay for {len(g['services'])} {g['category']} services",
            "detail": f"Keep {cheapest['name']} and consider cancelling {', '.join(others)}.",
            "estimated_monthly_saving": saving,
            "currency": cheapest.get("currency", "INR"),
        })
    yearly_candidates = [s for s in subs if s.billing_cycle == "monthly" and (s.amount or 0) > 200]
    if yearly_candidates:
        names = ", ".join(s.name for s in yearly_candidates[:3])
        out.append({
            "title": "Switch big monthly plans to annual billing",
            "detail": f"{names} usually offer ~15-20% off on annual plans.",
            "estimated_monthly_saving": None,
            "currency": "INR",
        })
    return out
