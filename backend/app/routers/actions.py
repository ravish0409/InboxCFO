from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from ..db import get_session
from ..services.actions import (
    draft_cancellation,
    list_action_items,
    refresh_action_items,
    set_status,
)
from ..services.llm import LLMNotConfigured, LLMUpstreamError

router = APIRouter(prefix="/api", tags=["actions"])


@router.get("/actions")
def get_actions(session: Session = Depends(get_session)):
    return list_action_items(session)


@router.post("/actions/refresh")
def refresh_actions(session: Session = Depends(get_session)):
    return refresh_action_items(session)


@router.post("/actions/{action_id}/draft")
def draft_action(action_id: int, session: Session = Depends(get_session)):
    try:
        result = draft_cancellation(session, action_id)
    except LLMNotConfigured as e:
        raise HTTPException(503, str(e))
    except LLMUpstreamError as e:
        raise HTTPException(e.status_code, str(e))
    if "error" in result:
        raise HTTPException(404, result["error"])
    return result


@router.post("/actions/{action_id}/approve")
def approve_action(action_id: int, session: Session = Depends(get_session)):
    item = set_status(session, action_id, "approved")
    if item is None:
        raise HTTPException(404, "action not found")
    return item


@router.post("/actions/{action_id}/dismiss")
def dismiss_action(action_id: int, session: Session = Depends(get_session)):
    item = set_status(session, action_id, "dismissed")
    if item is None:
        raise HTTPException(404, "action not found")
    return item
