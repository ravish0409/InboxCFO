"""Chat agent: Gemini function-calling over the structured DB (never over raw emails)."""

import json
from datetime import date, timedelta

from google.genai import types
from sqlmodel import Session, select

from ..models import Bill, DocumentRecord, Source, Subscription, Transaction
from .llm import generate, generate_stream

MAX_TURNS = 5


# ---------------------------------------------------------------- tool impls

def _source_ref(session: Session, source_id: int | None) -> dict | None:
    if source_id is None:
        return None
    src = session.get(Source, source_id)
    if src is None:
        return None
    return {
        "source_id": src.id,
        "title": src.title,
        "sender": src.sender,
        "date": src.received_at.isoformat() if src.received_at else None,
    }


def _spend(session: Session, merchant: str = "", category: str = "",
           start_date: str = "", end_date: str = "") -> dict:
    """Shared spend query — sum + list transactions filtered by merchant/category/date.
    Exposed to the agent as three named tools (total/by-category/by-merchant) per §3.6."""
    rows = session.exec(select(Transaction)).all()
    out = []
    for t in rows:
        if merchant and merchant.lower() not in t.merchant.lower():
            continue
        if category and category.lower() != t.category.lower():
            continue
        if start_date and (t.txn_date is None or t.txn_date.isoformat() < start_date):
            continue
        if end_date and (t.txn_date is None or t.txn_date.isoformat() > end_date):
            continue
        out.append(t)
    total = round(sum(t.amount for t in out), 2)
    return {
        "total_spend": total,
        "currency": out[0].currency if out else "INR",
        "transaction_count": len(out),
        "transactions": [
            {
                "merchant": t.merchant, "amount": t.amount, "currency": t.currency,
                "date": t.txn_date.isoformat() if t.txn_date else None,
                "category": t.category, "description": t.description,
                "source": _source_ref(session, t.source_id),
            }
            for t in sorted(out, key=lambda x: x.txn_date or date.min, reverse=True)[:25]
        ],
    }


def total_spend(session: Session, start_date: str = "", end_date: str = "") -> dict:
    return _spend(session, start_date=start_date, end_date=end_date)


def spend_by_category(session: Session, category: str = "",
                      start_date: str = "", end_date: str = "") -> dict:
    return _spend(session, category=category, start_date=start_date, end_date=end_date)


def spend_by_merchant(session: Session, merchant: str = "",
                      start_date: str = "", end_date: str = "") -> dict:
    return _spend(session, merchant=merchant, start_date=start_date, end_date=end_date)


def list_subscriptions(session: Session) -> dict:
    subs = session.exec(select(Subscription).where(Subscription.status == "active")).all()
    return {
        "subscriptions": [
            {
                "name": s.name, "category": s.category, "amount": s.amount,
                "currency": s.currency, "billing_cycle": s.billing_cycle,
                "next_renewal": s.next_renewal.isoformat() if s.next_renewal else None,
                "source": _source_ref(session, s.source_id),
            }
            for s in subs
        ]
    }


def upcoming_renewals(session: Session, days: int = 60) -> dict:
    today = date.today()
    horizon = today + timedelta(days=int(days))
    subs = session.exec(select(Subscription).where(Subscription.status == "active")).all()
    bills = session.exec(select(Bill).where(Bill.status == "due")).all()
    docs = session.exec(select(DocumentRecord)).all()
    items = []
    for s in subs:
        if s.next_renewal and today <= s.next_renewal <= horizon:
            items.append({"type": "subscription", "name": s.name, "date": s.next_renewal.isoformat(),
                          "amount": s.amount, "currency": s.currency,
                          "source": _source_ref(session, s.source_id)})
    for b in bills:
        if b.due_date and today <= b.due_date <= horizon:
            items.append({"type": "bill", "name": b.name, "date": b.due_date.isoformat(),
                          "amount": b.amount, "currency": b.currency,
                          "source": _source_ref(session, b.source_id)})
    for d in docs:
        if d.expiry_date and today <= d.expiry_date <= horizon:
            items.append({"type": d.doc_type, "name": d.title, "date": d.expiry_date.isoformat(),
                          "amount": d.amount, "currency": d.currency,
                          "source": _source_ref(session, d.source_id)})
    items.sort(key=lambda x: x["date"])
    return {"days_ahead": days, "items": items}


def find_duplicate_subscriptions(session: Session) -> dict:
    subs = session.exec(select(Subscription).where(Subscription.status == "active")).all()
    by_cat: dict[str, list[Subscription]] = {}
    for s in subs:
        by_cat.setdefault(s.category, []).append(s)
    dupes = []
    for cat, group in by_cat.items():
        names = {s.name.lower() for s in group}
        if cat != "other" and len(names) > 1:
            monthly = sum((s.amount or 0) / (12 if s.billing_cycle == "yearly" else 1) for s in group)
            dupes.append({
                "category": cat,
                "services": [{"name": s.name, "amount": s.amount, "currency": s.currency,
                              "billing_cycle": s.billing_cycle,
                              "source": _source_ref(session, s.source_id)} for s in group],
                "combined_monthly_cost": round(monthly, 2),
            })
    return {"duplicate_groups": dupes}


def find_documents(session: Session, query: str = "") -> dict:
    q = (query or "").lower()
    docs = session.exec(select(DocumentRecord)).all()
    bills = session.exec(select(Bill)).all()
    results = []
    for d in docs:
        hay = f"{d.title} {d.provider} {d.doc_type} {d.summary}".lower()
        if not q or any(w in hay for w in q.split()):
            results.append({"kind": "document", "doc_type": d.doc_type, "title": d.title,
                            "provider": d.provider,
                            "expiry_date": d.expiry_date.isoformat() if d.expiry_date else None,
                            "amount": d.amount, "currency": d.currency, "summary": d.summary,
                            "source": _source_ref(session, d.source_id)})
    for b in bills:
        hay = f"{b.name} {b.category}".lower()
        if q and any(w in hay for w in q.split()):
            results.append({"kind": "bill", "title": b.name, "category": b.category,
                            "due_date": b.due_date.isoformat() if b.due_date else None,
                            "amount": b.amount, "currency": b.currency, "status": b.status,
                            "source": _source_ref(session, b.source_id)})
    return {"results": results[:20]}


def list_action_items(session: Session) -> dict:
    """Trials ending, renewals due, price hikes and duplicates the user should review."""
    from .actions import list_action_items as _list
    items = _list(session)
    return {
        "action_items": [
            {
                "id": a.id, "kind": a.kind, "title": a.title, "detail": a.detail,
                "severity": a.severity, "estimated_saving": a.estimated_saving,
                "currency": a.currency, "status": a.status,
                "source": _source_ref(session, a.source_id),
            }
            for a in items
        ]
    }


def draft_cancellation(session: Session, subscription_name: str = "") -> dict:
    """Draft (do NOT send) a cancellation email for a subscription by name."""
    from .actions import draft_cancellation as _draft
    from .actions import refresh_action_items
    from .normalize import norm_key
    from ..models import ActionItem, Subscription

    key = norm_key(subscription_name)
    if not key:
        return {"error": "please name the subscription to cancel"}
    sub = session.exec(
        select(Subscription).where(Subscription.norm_key == key,
                                   Subscription.status == "active")
    ).first()
    if sub is None:
        return {"error": f"no active subscription matching '{subscription_name}'"}

    item = session.exec(
        select(ActionItem).where(ActionItem.subscription_id == sub.id)
    ).first()
    if item is None:
        # User wants to cancel something we didn't flag — make an ad-hoc action so
        # the draft also shows up in the Action Center.
        item = ActionItem(kind="manual_cancel", dedup_key=f"manual_cancel:{sub.id}",
                          title=f"Cancel {sub.name}", severity="low",
                          subscription_id=sub.id, source_id=sub.source_id, status="open")
        session.add(item)
        session.commit()
        session.refresh(item)
    return _draft(session, item.id)


TOOL_FUNCS = {
    "total_spend": total_spend,
    "spend_by_category": spend_by_category,
    "spend_by_merchant": spend_by_merchant,
    "list_subscriptions": list_subscriptions,
    "upcoming_renewals": upcoming_renewals,
    "find_duplicate_subscriptions": find_duplicate_subscriptions,
    "find_documents": find_documents,
    "list_action_items": list_action_items,
    "draft_cancellation": draft_cancellation,
}

TOOL_SCHEMAS = [
    {"type": "function", "function": {
        "name": "total_spend",
        "description": "Sum and list ALL transactions, optionally within an ISO date range. Use for overall 'how much did I spend' questions with no merchant or category filter.",
        "parameters": {"type": "object", "properties": {
            "start_date": {"type": "string", "description": "YYYY-MM-DD inclusive"},
            "end_date": {"type": "string", "description": "YYYY-MM-DD inclusive"}},
            "required": []}}},
    {"type": "function", "function": {
        "name": "spend_by_category",
        "description": "Sum and list transactions in ONE category, optionally within an ISO date range.",
        "parameters": {"type": "object", "properties": {
            "category": {"type": "string", "description": "one of food|shopping|transport|entertainment|bills|other"},
            "start_date": {"type": "string", "description": "YYYY-MM-DD inclusive"},
            "end_date": {"type": "string", "description": "YYYY-MM-DD inclusive"}},
            "required": ["category"]}}},
    {"type": "function", "function": {
        "name": "spend_by_merchant",
        "description": "Sum and list transactions for ONE merchant (substring match), optionally within an ISO date range. Use for 'how much did I spend on <merchant>'.",
        "parameters": {"type": "object", "properties": {
            "merchant": {"type": "string", "description": "merchant name substring, e.g. 'swiggy'"},
            "start_date": {"type": "string", "description": "YYYY-MM-DD inclusive"},
            "end_date": {"type": "string", "description": "YYYY-MM-DD inclusive"}},
            "required": ["merchant"]}}},
    {"type": "function", "function": {
        "name": "list_subscriptions",
        "description": "List all active subscriptions with cost, billing cycle and next renewal.",
        "parameters": {"type": "object", "properties": {}, "required": []}}},
    {"type": "function", "function": {
        "name": "upcoming_renewals",
        "description": "Subscriptions renewing, bills due, and documents/policies expiring within N days.",
        "parameters": {"type": "object", "properties": {
            "days": {"type": "integer", "description": "horizon in days, default 60"}}, "required": []}}},
    {"type": "function", "function": {
        "name": "find_duplicate_subscriptions",
        "description": "Find overlapping subscriptions in the same category (e.g. two music services).",
        "parameters": {"type": "object", "properties": {}, "required": []}}},
    {"type": "function", "function": {
        "name": "find_documents",
        "description": "Keyword search over stored documents (insurance policies, warranties, statements) and bills. Use for expiry/renewal/policy questions.",
        "parameters": {"type": "object", "properties": {
            "query": {"type": "string", "description": "keywords, e.g. 'car insurance'"}}, "required": ["query"]}}},
    {"type": "function", "function": {
        "name": "list_action_items",
        "description": "List things the user should review right now: free trials ending soon, subscriptions auto-renewing soon, price increases, and duplicate subscriptions. Use for 'what should I cancel', 'anything ending soon', 'what needs my attention'.",
        "parameters": {"type": "object", "properties": {}, "required": []}}},
    {"type": "function", "function": {
        "name": "draft_cancellation",
        "description": "Draft (never send) a polite cancellation email for a subscription by name. Use when the user asks to cancel something or accepts your offer to draft a cancellation.",
        "parameters": {"type": "object", "properties": {
            "subscription_name": {"type": "string", "description": "the service to cancel, e.g. 'Audible'"}},
            "required": ["subscription_name"]}}},
]

SYSTEM_PROMPT = """You are "Inbox CFO", a personal finance assistant. You answer questions about the user's
subscriptions, bills, transactions, insurance and documents using ONLY the provided tools — never guess numbers.

Today's date is {today}. Default currency is INR (₹).

Rules:
- Always call a tool before answering a factual question. For spend questions use total_spend (overall),
  spend_by_category, or spend_by_merchant with date filters (e.g. "last month" = the previous calendar month).
- Quote exact totals returned by tools; do not recompute or round differently.
- Be concise and friendly. Mention the source email/document when the tool result includes one.
- For "what should I cancel / what needs my attention / anything ending soon", call list_action_items.
  If it surfaces a free trial ending or a duplicate, proactively OFFER to draft a cancellation.
- When the user asks to cancel something (or accepts your offer), call draft_cancellation with the name.
  You draft the email for their approval — you never send it. Tell them it's a draft to review and send.
- If a tool returns nothing relevant, say you couldn't find it in the ingested data.

Formatting: reply in GitHub-flavored Markdown. Put money amounts and service names in **bold**
(e.g. **₹499/mo** for **Netflix**). Use a short `-` bullet list when you name several
subscriptions, bills or charges; keep single-fact answers to one or two sentences with no list.
When you present a drafted cancellation email, put its full text in a fenced ``` code block."""


def _build_tool() -> "types.Tool":
    """Convert the OpenAI-shaped TOOL_SCHEMAS into one Gemini Tool. The parameter blocks are
    already JSON Schema, so they pass straight through as `parameters_json_schema`."""
    decls = []
    for t in TOOL_SCHEMAS:
        fn = t["function"]
        decls.append(types.FunctionDeclaration(
            name=fn["name"],
            description=fn["description"],
            parameters_json_schema=fn.get("parameters") or {"type": "object", "properties": {}},
        ))
    return types.Tool(function_declarations=decls)


_TOOL = _build_tool()


def _config(system: str) -> "types.GenerateContentConfig":
    # Declarations-only tools: the SDK returns the function calls to us to run, rather than
    # trying to auto-invoke (which it can't — these aren't Python callables). Disable AFC
    # explicitly so a future SDK default can't start swallowing our calls.
    return types.GenerateContentConfig(
        system_instruction=system,
        temperature=0.1,
        tools=[_TOOL],
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
    )


def _to_contents(question: str, history: list[dict] | None) -> list:
    """Prior turns + the new question as Gemini `Content`. Roles map user→user, assistant→model."""
    contents: list = []
    for h in (history or [])[-6:]:
        role, text = h.get("role"), h.get("content")
        if role in ("user", "assistant") and text:
            contents.append(types.Content(
                role="model" if role == "assistant" else "user",
                parts=[types.Part(text=text)],
            ))
    contents.append(types.Content(role="user", parts=[types.Part(text=question)]))
    return contents


def _tool_response_part(name: str, result: dict) -> "types.Part":
    # from_function_response needs a JSON-safe dict; tool results carry ISO date strings but
    # round-trip through json to be certain nothing (e.g. a stray date) breaks serialization.
    safe = json.loads(json.dumps(result, default=str))
    return types.Part.from_function_response(name=name, response=safe)


def _collect_sources(obj, acc: list[dict]) -> None:
    if isinstance(obj, dict):
        src = obj.get("source")
        if isinstance(src, dict) and src.get("source_id") is not None:
            if src not in acc:
                acc.append(src)
        for v in obj.values():
            _collect_sources(v, acc)
    elif isinstance(obj, list):
        for v in obj:
            _collect_sources(v, acc)


def _run_tool(session: Session, name: str, args: dict) -> dict:
    func = TOOL_FUNCS.get(name)
    if func is None:
        return {"error": f"unknown tool '{name}'"}
    try:
        return func(session, **{k: v for k, v in (args or {}).items() if v not in (None, "")})
    except TypeError as e:
        return {"error": f"bad arguments: {e}"}


def answer_question(session: Session, question: str, history: list[dict] | None = None) -> dict:
    """Non-streaming answer (used by POST /api/chat). Runs the Gemini function-calling loop:
    each turn either returns function calls to run, or the final text answer."""
    system = SYSTEM_PROMPT.format(today=date.today().isoformat())
    config = _config(system)
    contents = _to_contents(question, history)
    sources: list[dict] = []
    trace: list[dict] = []

    for _ in range(MAX_TURNS):
        resp = generate(contents, config)
        calls = resp.function_calls or []
        if not calls:
            return {"answer": resp.text or "", "sources": sources, "tool_trace": trace}

        contents.append(resp.candidates[0].content)  # the model's function-call turn
        response_parts = []
        for fc in calls:
            args = dict(fc.args or {})
            result = _run_tool(session, fc.name, args)
            _collect_sources(result, sources)
            trace.append({"tool": fc.name, "args": args})
            response_parts.append(_tool_response_part(fc.name, result))
        contents.append(types.Content(role="user", parts=response_parts))

    return {"answer": "I couldn't complete that within my step limit — try a simpler question.",
            "sources": sources, "tool_trace": trace}


def stream_answer(session: Session, question: str, history: list[dict] | None = None):
    """Generator yielding SSE-shaped events for the chat stream:
      {"type": "tool", "tool": <name>}     — a tool step, as it happens
      {"type": "token", "text": <chunk>}   — a fragment of the final answer
      {"type": "sources", "sources": [...]}— evidence, once at the end

    Each Gemini turn is streamed. Text parts are forwarded as tokens; function-call parts
    are collected (Gemini may send them across chunks — merge args by name), executed, and
    fed back as function responses. Loops until a turn produces text with no function call.
    """
    system = SYSTEM_PROMPT.format(today=date.today().isoformat())
    config = _config(system)
    contents = _to_contents(question, history)
    sources: list[dict] = []

    for _ in range(MAX_TURNS):
        text_accum = ""
        fc_parts: list = []          # ORIGINAL function_call parts (carry thought_signature)
        exec_calls: list = []        # (name, args) to run, in arrival order
        for chunk in generate_stream(contents, config):
            candidate = (chunk.candidates or [None])[0]
            if not candidate or not candidate.content or not candidate.content.parts:
                continue
            for part in candidate.content.parts:
                if part.function_call:
                    # Keep the part verbatim — Gemini 3.x rejects the follow-up turn if the
                    # function_call is resent without its thought_signature.
                    fc_parts.append(part)
                    exec_calls.append((part.function_call.name, dict(part.function_call.args or {})))
                elif part.text and not part.thought:  # skip the model's thinking summary
                    text_accum += part.text
                    yield {"type": "token", "text": part.text}

        if not fc_parts:
            yield {"type": "sources", "sources": sources}
            return

        # Replay the model's turn verbatim (original parts, signatures intact), then answer
        # each call with a function response.
        model_parts = ([types.Part(text=text_accum)] if text_accum else []) + fc_parts
        contents.append(types.Content(role="model", parts=model_parts))

        response_parts = []
        for name, args in exec_calls:
            yield {"type": "tool", "tool": name}
            result = _run_tool(session, name, args)
            _collect_sources(result, sources)
            response_parts.append(_tool_response_part(name, result))
        contents.append(types.Content(role="user", parts=response_parts))

    yield {"type": "token",
           "text": "I couldn't complete that within my step limit — try a simpler question."}
    yield {"type": "sources", "sources": sources}
