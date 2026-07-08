from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session

from ..db import get_session
from ..services.agent import answer_question
from ..services.llm import LLMNotConfigured

router = APIRouter(prefix="/api", tags=["chat"])


class ChatRequest(BaseModel):
    question: str
    history: list[dict] = []


@router.post("/chat")
def chat(req: ChatRequest, session: Session = Depends(get_session)):
    if not req.question.strip():
        raise HTTPException(422, "question is empty")
    try:
        return answer_question(session, req.question.strip(), req.history)
    except LLMNotConfigured as e:
        raise HTTPException(503, str(e))
