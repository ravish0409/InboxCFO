"""Action detection + draft-and-approve layer.

Turns the email-only signals (trials ending, renewals due, price hikes, duplicates)
into persisted ActionItems the user can review, and drafts cancellation emails on
request. Nothing is ever sent — draft_cancellation returns text + a mailto handoff,
because the Gmail scope is read-only. This is the "intercept before the charge" wedge.
"""

from datetime import date, timedelta
from urllib.parse import quote

from sqlmodel import Session, select

from ..models import ActionItem, Subscription
from .fx import to_inr

HORIZON_DAYS = 7
_SEVERITY_ORDER = {"high": 0, "medium": 1, "low": 2}


def _monthly(s: Subscription) -> float:
    if s.amount is None:
        return 0.0
    if s.billing_cycle == "yearly":
        return s.amount / 12
    if s.billing_cycle == "weekly":
        return s.amount * 4.33
    return s.amount


# ------------------------------------------------------------------ signals

def _compute_signals(session: Session) -> list[dict]:
    """Current action-worthy signals as plain dicts keyed by dedup_key."""
    today = date.today()
    horizon = today + timedelta(days=HORIZON_DAYS)
    subs = session.exec(select(Subscription).where(Subscription.status == "active")).all()
    out: list[dict] = []

    for s in subs:
        cur = s.currency or "INR"
        # Trial about to convert to paid — the highest-value interception.
        if s.is_trial and s.trial_end_date and today <= s.trial_end_date <= horizon:
            days = (s.trial_end_date - today).days
            charge = f"{cur} {s.amount:.0f}" if s.amount else "a charge"
            out.append({
                "kind": "trial_ending", "dedup_key": f"trial_ending:{s.id}",
                "title": f"{s.name} free trial ends in {days} day{'s' if days != 1 else ''}",
                "detail": f"Your {s.name} trial ends {s.trial_end_date.isoformat()} and will "
                          f"auto-charge {charge}. Cancel before then to avoid the bill.",
                "severity": "high", "estimated_saving": s.amount, "currency": cur,
                "subscription_id": s.id, "source_id": s.source_id,
            })
        # Auto-renewing subscription due soon — "cancel by" reminder.
        elif s.auto_renews and s.next_renewal and today <= s.next_renewal <= horizon:
            days = (s.next_renewal - today).days
            amt = f"{cur} {s.amount:.0f}" if s.amount else "the usual amount"
            out.append({
                "kind": "renewal_upcoming", "dedup_key": f"renewal_upcoming:{s.id}",
                "title": f"{s.name} renews in {days} day{'s' if days != 1 else ''}",
                "detail": f"{s.name} auto-renews on {s.next_renewal.isoformat()} for {amt}. "
                          f"Cancel before then if you no longer want it.",
                "severity": "medium", "estimated_saving": None, "currency": cur,
                "subscription_id": s.id, "source_id": s.source_id,
            })
        # Price increase detected across two source emails.
        if (s.previous_amount is not None and s.amount is not None
                and s.previous_amount < s.amount):
            delta = round(s.amount - s.previous_amount, 2)
            out.append({
                "kind": "price_increase", "dedup_key": f"price_increase:{s.id}",
                "title": f"{s.name} price went up {cur} {delta:.0f}/{s.billing_cycle[:2]}",
                "detail": f"{s.name} rose from {cur} {s.previous_amount:.0f} to "
                          f"{cur} {s.amount:.0f}. Review whether it's still worth it.",
                "severity": "medium", "estimated_saving": delta, "currency": cur,
                "subscription_id": s.id, "source_id": s.source_id,
            })

    out.extend(_duplicate_signals(subs))
    return out


def _duplicate_signals(subs: list[Subscription]) -> list[dict]:
    """Overlapping services in one category → suggest cancelling all but the cheapest."""
    by_cat: dict[str, list[Subscription]] = {}
    for s in subs:
        by_cat.setdefault(s.category, []).append(s)
    out: list[dict] = []
    for cat, group in by_cat.items():
        keys = {s.norm_key or s.name.lower() for s in group}
        if cat == "other" or len(keys) < 2:
            continue
        # Compare on a common currency (INR) so "cheapest" is real even across currencies.
        cheapest = min(group, key=lambda s: to_inr(_monthly(s), s.currency))
        to_cancel = max(group, key=lambda s: to_inr(_monthly(s), s.currency))  # cancel the pricier one
        # If the group is a single currency, keep the saving in it; otherwise report in INR.
        currencies = {(s.currency or "INR").upper() for s in group}
        if len(currencies) == 1:
            saving_cur = cheapest.currency or "INR"
            saving = round(sum(_monthly(s) for s in group) - _monthly(cheapest), 2)
        else:
            saving_cur = "INR"
            combined_inr = sum(to_inr(_monthly(s), s.currency) for s in group)
            saving = round(combined_inr - to_inr(_monthly(cheapest), cheapest.currency), 2)
        others = ", ".join(s.name for s in group if s.id != cheapest.id)
        # Order-independent key (§3A.7): the signal is identified by its category + the
        # *set* of overlapping services, so a changed group is a new signal rather than
        # silently mutating the old ActionItem.
        dedup_key = "duplicate:" + cat + ":" + "+".join(sorted(keys))
        out.append({
            "kind": "duplicate", "dedup_key": dedup_key,
            "title": f"{len(group)} {cat} subscriptions overlap",
            "detail": f"You pay for {', '.join(s.name for s in group)}. Keep {cheapest.name} "
                      f"and cancel {others} to save about {saving_cur} {saving:.0f}/mo.",
            "severity": "medium", "estimated_saving": saving,
            "currency": saving_cur,
            "subscription_id": to_cancel.id, "source_id": to_cancel.source_id,
        })
    return out


# ------------------------------------------------------------------ persistence

def refresh_action_items(session: Session) -> list[ActionItem]:
    """Recompute signals and upsert ActionItems idempotently, preserving user
    status (dismissed/approved) and any generated draft. Open items whose signal
    has resolved are removed; user-touched items are kept as history."""
    signals = _compute_signals(session)
    by_key = {sig["dedup_key"]: sig for sig in signals}
    existing = session.exec(select(ActionItem)).all()
    existing_by_key = {a.dedup_key: a for a in existing}

    for key, sig in by_key.items():
        item = existing_by_key.get(key)
        if item is None:
            session.add(ActionItem(status="open", **sig))
        else:
            # Refresh the descriptive fields; never touch status or draft_text.
            item.title = sig["title"]
            item.detail = sig["detail"]
            item.severity = sig["severity"]
            item.estimated_saving = sig["estimated_saving"]
            item.currency = sig["currency"]
            item.subscription_id = sig["subscription_id"]
            item.source_id = sig["source_id"]
            session.add(item)

    for a in existing:
        if a.status == "open" and a.dedup_key not in by_key:
            session.delete(a)  # signal resolved and user never acted on it

    session.commit()
    return list_action_items(session)


def list_action_items(session: Session, include_dismissed: bool = False) -> list[ActionItem]:
    items = session.exec(select(ActionItem)).all()
    if not include_dismissed:
        items = [a for a in items if a.status != "dismissed"]
    items.sort(key=lambda a: (_SEVERITY_ORDER.get(a.severity, 3), a.id or 0))
    return items


# ------------------------------------------------------------------ drafting

_DRAFT_SYSTEM = """You write short, polite, firm subscription-cancellation emails on behalf of a user.
Output ONLY the email body (no subject line, no placeholders like [Name] unless truly needed).
Keep it under 90 words: state the request to cancel, ask for confirmation, thank them."""


def _mailto(subject: str, body: str) -> str:
    return f"mailto:?subject={quote(subject)}&body={quote(body)}"


def draft_cancellation(session: Session, action_id: int) -> dict:
    """LLM-draft a cancellation email for the action's linked subscription.
    Sets draft_text + status=drafted and returns the text plus a mailto handoff."""
    item = session.get(ActionItem, action_id)
    if item is None:
        return {"error": "action not found"}
    sub = session.get(Subscription, item.subscription_id) if item.subscription_id else None
    if sub is None:
        return {"error": "this action has no subscription to cancel"}

    from .llm import chat_text  # local import keeps this module import-safe without a key

    price = f"{sub.currency} {sub.amount:.0f}" if sub.amount else "my current plan"
    user = (
        f"Service: {sub.name}\n"
        f"Plan/price: {price} ({sub.billing_cycle})\n"
        f"Cancellation link (if any): {sub.cancel_url or 'none provided'}\n"
        "Write the cancellation email body."
    )
    draft = chat_text(_DRAFT_SYSTEM, user)
    subject = f"Cancellation request — {sub.name}"

    item.draft_text = draft
    item.status = "drafted"
    session.add(item)
    session.commit()
    session.refresh(item)
    return {
        "id": item.id,
        "subscription": sub.name,
        "draft_text": draft,
        "cancel_url": sub.cancel_url,
        "mailto": _mailto(subject, draft),
    }


def set_status(session: Session, action_id: int, status: str) -> ActionItem | None:
    item = session.get(ActionItem, action_id)
    if item is None:
        return None
    item.status = status
    session.add(item)
    session.commit()
    session.refresh(item)
    return item
