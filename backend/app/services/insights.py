"""Insights: rule-based duplicate detection (always works) + LLM savings suggestions (optional).

The LLM suggestions are expensive, so they are cached in the DB (InsightsCache) and only
regenerated on ingest via `regenerate_suggestions`. GET /api/insights reads the cache and
never blocks on a live LLM call; the rule-based parts are recomputed fresh each request."""

import json
from datetime import date, datetime

from sqlmodel import Session, select

from ..models import InsightsCache, Subscription
from .agent import find_duplicate_subscriptions, upcoming_renewals
from .fx import to_inr
from .llm import LLMNotConfigured, chat_json

SAVINGS_SYSTEM = """You are a pragmatic personal-finance advisor. Given a JSON summary of the user's
subscriptions, duplicate groups, and upcoming bills, suggest concrete ways to save money.
Output ONLY JSON: {"suggestions": [{"title": str, "detail": str, "estimated_monthly_saving": number|null, "currency": str}]}
Max 5 suggestions, most impactful first. Be specific (name the services). Never invent services not in the data."""


def _monthly_cost(s: Subscription) -> float:
    if s.amount is None:
        return 0.0
    return s.amount / 12 if s.billing_cycle == "yearly" else s.amount * (4.33 if s.billing_cycle == "weekly" else 1)


def _compute_rule_based(session: Session):
    """The instant, always-fresh part of insights: subs, duplicate groups, renewals, total."""
    subs = session.exec(select(Subscription).where(Subscription.status == "active")).all()
    dupes = find_duplicate_subscriptions(session)["duplicate_groups"]
    renewals = upcoming_renewals(session, days=45)["items"]
    # Base currency for the headline total is INR — convert each sub before summing.
    total_monthly = round(sum(to_inr(_monthly_cost(s), s.currency) for s in subs), 2)
    return subs, dupes, renewals, total_monthly


def _write_cache(session: Session, suggestions: list[dict], llm_used: bool) -> InsightsCache:
    cache = session.get(InsightsCache, 1)
    if cache is None:
        cache = InsightsCache(id=1)
        session.add(cache)
    cache.suggestions_json = json.dumps(suggestions)
    cache.llm_used = llm_used
    cache.updated_at = datetime.utcnow()
    session.commit()
    session.refresh(cache)
    return cache


def regenerate_suggestions(session: Session) -> InsightsCache:
    """Call the LLM for savings suggestions and persist them. Falls back to rule-based
    suggestions when the LLM is unconfigured or fails. This is the SLOW path (a live LLM
    call) — run it on ingest or in a background task, never on the read path."""
    subs, dupes, renewals, total_monthly = _compute_rule_based(session)
    summary = {
        "total_monthly_subscription_cost": total_monthly,
        "subscriptions": [
            {"name": s.name, "category": s.category, "amount": s.amount,
             "billing_cycle": s.billing_cycle, "currency": s.currency} for s in subs
        ],
        "duplicate_groups": dupes,
        "upcoming_45_days": renewals,
    }

    llm_used = False
    try:
        data = chat_json(SAVINGS_SYSTEM, str(summary))
        suggestions = data.get("suggestions") or []
        llm_used = True
    except (LLMNotConfigured, Exception):
        suggestions = _rule_based_suggestions(dupes, subs)

    return _write_cache(session, suggestions, llm_used)


def regenerate_suggestions_bg() -> None:
    """Background-task entrypoint. Opens its own DB session (the request's session is
    already closed by the time a background task runs) and never raises."""
    from ..db import engine

    with Session(engine) as session:
        try:
            regenerate_suggestions(session)
        except Exception:
            pass


def build_insights(session: Session) -> dict:
    """Read path for GET /api/insights — never calls the LLM, so it always returns fast.
    Rule-based parts are recomputed fresh each request. LLM suggestions come from the
    cache; on a cold cache we seed instant rule-based suggestions so the panel is never
    empty, and the router schedules a one-off background LLM refresh."""
    subs, dupes, renewals, total_monthly = _compute_rule_based(session)

    cache = session.get(InsightsCache, 1)
    if cache is None:
        cache = _write_cache(session, _rule_based_suggestions(dupes, subs), llm_used=False)

    return {
        "as_of": date.today().isoformat(),
        "total_monthly_subscription_cost": total_monthly,
        "duplicate_groups": dupes,
        "upcoming_renewals": renewals,
        "suggestions": json.loads(cache.suggestions_json or "[]"),
        "llm_used": cache.llm_used,
        "suggestions_updated_at": cache.updated_at.isoformat(),
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
