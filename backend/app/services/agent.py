"""Chat agent: Fireworks tool-calling over the structured DB (never over raw emails)."""

import json
from datetime import date, timedelta

from sqlmodel import Session, select

from ..config import AGENT_TOOL_MODE
from ..models import Bill, DocumentRecord, Source, Subscription, Transaction
from .llm import _parse_json_lenient, chat_raw

MAX_TURNS = 6


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


def query_spend(session: Session, merchant: str = "", category: str = "",
                start_date: str = "", end_date: str = "") -> dict:
    stmt = select(Transaction)
    rows = session.exec(stmt).all()
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


def search_documents(session: Session, query: str = "") -> dict:
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


TOOL_FUNCS = {
    "query_spend": query_spend,
    "list_subscriptions": list_subscriptions,
    "upcoming_renewals": upcoming_renewals,
    "find_duplicate_subscriptions": find_duplicate_subscriptions,
    "search_documents": search_documents,
}

TOOL_SCHEMAS = [
    {"type": "function", "function": {
        "name": "query_spend",
        "description": "Sum and list transactions, optionally filtered by merchant substring, category, and ISO date range. Use this for any 'how much did I spend' question.",
        "parameters": {"type": "object", "properties": {
            "merchant": {"type": "string", "description": "merchant name substring, e.g. 'swiggy'"},
            "category": {"type": "string", "description": "one of food|shopping|transport|entertainment|bills|other"},
            "start_date": {"type": "string", "description": "YYYY-MM-DD inclusive"},
            "end_date": {"type": "string", "description": "YYYY-MM-DD inclusive"}},
            "required": []}}},
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
        "name": "search_documents",
        "description": "Keyword search over stored documents (insurance policies, warranties, statements) and bills. Use for expiry/renewal/policy questions.",
        "parameters": {"type": "object", "properties": {
            "query": {"type": "string", "description": "keywords, e.g. 'car insurance'"}}, "required": ["query"]}}},
]

SYSTEM_PROMPT = """You are "Inbox CFO", a personal finance assistant. You answer questions about the user's
subscriptions, bills, transactions, insurance and documents using ONLY the provided tools — never guess numbers.

Today's date is {today}. Default currency is INR (₹).

Rules:
- Always call a tool before answering a factual question. For spend questions use query_spend with date filters
  (e.g. "last month" = the previous calendar month).
- Quote exact totals returned by tools; do not recompute or round differently.
- Be concise and friendly. Mention the source email/document when the tool result includes one.
- If a tool returns nothing relevant, say you couldn't find it in the ingested data."""

JSON_MODE_SUFFIX = """

You do not have native tool-calling. Instead reply with EXACTLY ONE JSON object per turn, no other text:
- To call a tool: {"tool": "<name>", "args": {...}}
  Available tools: query_spend(merchant?, category?, start_date?, end_date?), list_subscriptions(),
  upcoming_renewals(days?), find_duplicate_subscriptions(), search_documents(query)
- To answer the user: {"answer": "<your final answer>"}"""


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
    system = SYSTEM_PROMPT.format(today=date.today().isoformat())
    if AGENT_TOOL_MODE == "json":
        system += JSON_MODE_SUFFIX
    messages: list[dict] = [{"role": "system", "content": system}]
    for h in (history or [])[-6:]:
        if h.get("role") in ("user", "assistant") and h.get("content"):
            messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": question})

    sources: list[dict] = []
    trace: list[dict] = []

    for _ in range(MAX_TURNS):
        if AGENT_TOOL_MODE == "json":
            resp = chat_raw(messages)
            content = resp.choices[0].message.content or ""
            try:
                obj = _parse_json_lenient(content)
            except Exception:
                return {"answer": content, "sources": sources, "tool_trace": trace}
            if "answer" in obj:
                return {"answer": str(obj["answer"]), "sources": sources, "tool_trace": trace}
            name, args = obj.get("tool", ""), obj.get("args") or {}
            result = _run_tool(session, name, args)
            _collect_sources(result, sources)
            trace.append({"tool": name, "args": args})
            messages.append({"role": "assistant", "content": content})
            messages.append({"role": "user",
                             "content": f"Tool result for {name}: {json.dumps(result, default=str)}"})
        else:
            resp = chat_raw(messages, tools=TOOL_SCHEMAS)
            msg = resp.choices[0].message
            if not msg.tool_calls:
                return {"answer": msg.content or "", "sources": sources, "tool_trace": trace}
            messages.append({
                "role": "assistant", "content": msg.content,
                "tool_calls": [tc.model_dump() for tc in msg.tool_calls],
            })
            for tc in msg.tool_calls:
                try:
                    args = json.loads(tc.function.arguments or "{}")
                except json.JSONDecodeError:
                    args = {}
                result = _run_tool(session, tc.function.name, args)
                _collect_sources(result, sources)
                trace.append({"tool": tc.function.name, "args": args})
                messages.append({
                    "role": "tool", "tool_call_id": tc.id,
                    "content": json.dumps(result, default=str),
                })

    return {"answer": "I couldn't complete that within my step limit — try a simpler question.",
            "sources": sources, "tool_trace": trace}
