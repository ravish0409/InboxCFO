import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ..db import get_session
from ..models import ChatMessage, Conversation

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


class MessageIn(BaseModel):
    role: str
    content: str = ""
    trace: list[dict] = []
    sources: list[dict] = []
    charts: list[dict] = []
    actions: list[dict] = []
    error: bool = False


class ConversationIn(BaseModel):
    messages: list[MessageIn] = []


def _title_from(messages: list[MessageIn]) -> str:
    """The conversation title is the first user turn, trimmed to a chip-sized string."""
    first = next((m.content.strip() for m in messages if m.role == "user" and m.content.strip()), "")
    if not first:
        return "New chat"
    return first[:48] + "…" if len(first) > 48 else first


def _meta(c: Conversation) -> dict:
    return {
        "id": c.id,
        "title": c.title,
        "created_at": c.created_at.isoformat(),
        "updated_at": c.updated_at.isoformat(),
    }


def _message_out(m: ChatMessage) -> dict:
    return {
        "role": m.role,
        "content": m.content,
        "trace": json.loads(m.trace_json or "[]"),
        "sources": json.loads(m.sources_json or "[]"),
        "charts": json.loads(m.charts_json or "[]"),
        "actions": json.loads(m.actions_json or "[]"),
        "error": m.error,
    }


def _delete_messages(session: Session, conv_id: int) -> None:
    existing = session.exec(
        select(ChatMessage).where(ChatMessage.conversation_id == conv_id)
    ).all()
    for m in existing:
        session.delete(m)


def _replace_messages(session: Session, conv: Conversation, messages: list[MessageIn]) -> None:
    """Swap the conversation's messages for the given list, update its title/timestamp.
    Full replace mirrors the client, which commits the whole thread after each turn."""
    _delete_messages(session, conv.id)
    for i, m in enumerate(messages):
        session.add(ChatMessage(
            conversation_id=conv.id,
            position=i,
            role=m.role,
            content=m.content,
            trace_json=json.dumps(m.trace),
            sources_json=json.dumps(m.sources),
            charts_json=json.dumps(m.charts),
            actions_json=json.dumps(m.actions),
            error=m.error,
        ))
    conv.title = _title_from(messages)
    conv.updated_at = datetime.utcnow()
    session.add(conv)


@router.get("")
def list_conversations(session: Session = Depends(get_session)):
    convs = session.exec(select(Conversation).order_by(Conversation.updated_at.desc())).all()
    return [_meta(c) for c in convs]


@router.get("/{conv_id}")
def get_conversation(conv_id: int, session: Session = Depends(get_session)):
    conv = session.get(Conversation, conv_id)
    if conv is None:
        raise HTTPException(404, "conversation not found")
    msgs = session.exec(
        select(ChatMessage)
        .where(ChatMessage.conversation_id == conv_id)
        .order_by(ChatMessage.position)
    ).all()
    return {**_meta(conv), "messages": [_message_out(m) for m in msgs]}


@router.post("")
def create_conversation(req: ConversationIn, session: Session = Depends(get_session)):
    conv = Conversation()
    session.add(conv)
    session.commit()  # assign the id before messages reference it
    _replace_messages(session, conv, req.messages)
    session.commit()
    session.refresh(conv)
    return _meta(conv)


@router.put("/{conv_id}")
def update_conversation(conv_id: int, req: ConversationIn, session: Session = Depends(get_session)):
    conv = session.get(Conversation, conv_id)
    if conv is None:
        raise HTTPException(404, "conversation not found")
    _replace_messages(session, conv, req.messages)
    session.commit()
    session.refresh(conv)
    return _meta(conv)


@router.delete("/{conv_id}", status_code=204)
def delete_conversation(conv_id: int, session: Session = Depends(get_session)):
    conv = session.get(Conversation, conv_id)
    if conv is None:
        raise HTTPException(404, "conversation not found")
    _delete_messages(session, conv_id)
    session.delete(conv)
    session.commit()
