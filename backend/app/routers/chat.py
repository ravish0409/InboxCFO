import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlmodel import Session

from ..db import engine, get_session
from ..services.agent import answer_question, stream_answer
from ..services.llm import LLMNotConfigured, LLMUpstreamError

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
    except LLMUpstreamError as e:
        raise HTTPException(e.status_code, str(e))


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event)}\n\n"


@router.post("/chat/stream")
def chat_stream(req: ChatRequest):
    """Server-Sent Events stream of the chat answer. Emits `tool`, `token`, `sources`,
    and a final `done` event (or an `error` event). The DB session is opened inside the
    generator because a request-scoped `Depends` session would be torn down before the
    streaming body finishes producing."""
    if not req.question.strip():
        raise HTTPException(422, "question is empty")

    question = req.question.strip()
    history = req.history

    def gen():
        with Session(engine) as session:
            try:
                for event in stream_answer(session, question, history):
                    yield _sse(event)
            except LLMNotConfigured as e:
                yield _sse({"type": "error", "message": str(e)})
            except LLMUpstreamError as e:
                yield _sse({"type": "error", "message": str(e)})
            except Exception as e:  # never leave the client hanging on an open stream
                yield _sse({"type": "error", "message": f"The agent hit an error — {e}"})
            yield _sse({"type": "done"})

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
