import asyncio
import json
import threading
from datetime import date

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from sqlmodel import Session
from starlette.background import BackgroundTask

from ..db import engine, get_session
from ..services.actions import refresh_action_items
from ..services.extraction import (
    extract_source,
    find_source_by_hash,
    store_source,
    summarize_counts,
)
from ..services.gmail_sync import GmailNotConfigured, sync_inbox, sync_inbox_events
from ..services.insights import regenerate_suggestions_bg
from ..services.llm import LLMNotConfigured, LLMUpstreamError
from ..services.normalize import content_hash
from ..services.pdf import parse_eml, pdf_to_text

router = APIRouter(prefix="/api", tags=["ingest"])

# SSE plumbing for the live sync/upload streams. `X-Accel-Buffering: no` keeps proxies
# from buffering the response so each event reaches the browser as it is produced.
_SSE_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event)}\n\n"


def _spawn_disconnect_watcher(request: Request) -> tuple[threading.Event, threading.Event]:
    """Poll for client disconnect (the Stop button aborts the fetch) and raise a `stop`
    flag the threadpool-run SSE generator checks between items — so no further Gmail
    fetches or LLM extractions start once the user has stopped. Polling
    request.is_disconnected() is safe here: under uvicorn's ASGI 2.4 StreamingResponse,
    Starlette detects disconnects via `send`, not by consuming the receive channel, so
    we are the sole reader. The generator sets `done` on exit to end the watcher."""
    stop, done = threading.Event(), threading.Event()

    async def watch() -> None:
        try:
            while not done.is_set():
                if await request.is_disconnected():
                    stop.set()
                    return
                await asyncio.sleep(0.3)
        except asyncio.CancelledError:
            pass

    asyncio.create_task(watch())  # self-terminates on disconnect or when `done` is set
    return stop, done


def _parse_upload(name: str, filename: str, data: bytes) -> dict:
    """Turn raw bytes into (source_type, title, sender, received_at, raw_text)."""
    if name.endswith(".eml"):
        parsed = parse_eml(data)
        return {"source_type": "email", "title": parsed["subject"] or filename,
                "sender": parsed["sender"], "received_at": parsed["received_at"],
                "raw_text": parsed["body"]}
    if name.endswith(".pdf"):
        text = pdf_to_text(data)
        if not text:
            raise HTTPException(422, f"{filename}: no extractable text (scanned PDF?)")
        return {"source_type": "pdf", "title": filename or "document.pdf",
                "sender": "", "received_at": date.today(), "raw_text": text}
    if name.endswith(".txt"):
        return {"source_type": "text", "title": filename or "note.txt",
                "sender": "", "received_at": date.today(),
                "raw_text": data.decode("utf-8", errors="replace")}
    raise HTTPException(415, f"{filename}: only .eml, .pdf, .txt supported")


@router.post("/upload")
async def upload_files(files: list[UploadFile], background_tasks: BackgroundTasks,
                       session: Session = Depends(get_session)):
    results = []
    for f in files:
        data = await f.read()
        name = (f.filename or "upload").lower()
        try:
            fields = _parse_upload(name, f.filename or "upload", data)
            # Idempotent ingest: the same content uploaded twice is not re-extracted.
            digest = content_hash(fields["sender"], fields["title"], fields["raw_text"])
            existing = find_source_by_hash(session, digest)
            if existing:
                results.append({"file": f.filename, "source_id": existing.id,
                                "duplicate": True, "extracted": {}})
                continue
            source = store_source(session, **fields)
            counts = extract_source(session, source)
            results.append({"file": f.filename, "source_id": source.id, "extracted": counts})
        except LLMNotConfigured as e:
            raise HTTPException(503, str(e))
        except LLMUpstreamError as e:
            raise HTTPException(e.status_code, str(e))
    refresh_action_items(session)  # surface new trials/renewals/price hikes immediately
    background_tasks.add_task(regenerate_suggestions_bg)  # refresh insights after responding
    return {"results": results}


@router.post("/sync")
def sync_gmail(background_tasks: BackgroundTasks, max_messages: int | None = None,
               session: Session = Depends(get_session)):
    try:
        result = sync_inbox(session, max_messages)
        refresh_action_items(session)
        background_tasks.add_task(regenerate_suggestions_bg)  # refresh insights after responding
        return result
    except GmailNotConfigured as e:
        raise HTTPException(503, str(e))
    except LLMNotConfigured as e:
        raise HTTPException(503, str(e))
    except LLMUpstreamError as e:
        raise HTTPException(e.status_code, str(e))


@router.post("/sync/stream")
async def sync_gmail_stream(request: Request, max_messages: int | None = None):
    """Live version of /sync: streams per-message progress as SSE so the UI can show
    what the agent is doing while the inbox is read. The DB session is opened inside the
    generator because a request-scoped `Depends` session would be closed before the body
    finishes streaming. Insights are regenerated as a background task once the stream ends.

    Hitting Stop aborts the fetch, which the disconnect watcher turns into a cooperative
    `stop` flag: `sync_inbox_events` breaks before the next message, and the `finally`
    still files whatever was already committed."""
    stop, done = _spawn_disconnect_watcher(request)

    def gen():
        session = Session(engine)
        try:
            try:
                for event in sync_inbox_events(session, max_messages, should_stop=stop.is_set):
                    yield _sse(event)
            except GmailNotConfigured as e:
                yield _sse({"type": "error", "message": str(e)})
            except LLMNotConfigured as e:
                yield _sse({"type": "error", "message": str(e)})
            except LLMUpstreamError as e:
                yield _sse({"type": "error", "message": str(e)})
            except Exception as e:  # never leave the client hanging on an open stream
                yield _sse({"type": "error", "message": f"sync hit an error — {e}"})
            yield _sse({"type": "close"})
        finally:
            # Runs on a clean finish, an error, or a client Stop (GeneratorExit): surface
            # whatever was ingested, then release the session and end the watcher.
            try:
                refresh_action_items(session)
            finally:
                session.close()
                done.set()

    return StreamingResponse(
        gen(), media_type="text/event-stream", headers=_SSE_HEADERS,
        background=BackgroundTask(regenerate_suggestions_bg),
    )


@router.post("/upload/stream")
async def upload_files_stream(request: Request, files: list[UploadFile]):
    """Live version of /upload: streams one event per file as it is parsed and extracted.
    File bytes are read up front (multipart must be consumed before the streaming body
    starts); processing then happens inside the generator, emitting SSE as it goes.

    Like the sync stream, hitting Stop breaks before the next file is extracted; files
    already committed are kept and re-checked for new traps."""
    payloads = [((f.filename or "upload"), await f.read()) for f in files]
    stop, done = _spawn_disconnect_watcher(request)

    def gen():
        session = Session(engine)
        try:
            yield _sse({"type": "start", "total": len(payloads)})
            new = 0
            for i, (filename, data) in enumerate(payloads):
                # Cooperative cancel: stop before extracting the next file once the
                # client has hit Stop. Files handled so far are already committed.
                if stop.is_set():
                    yield _sse({"type": "stopped", "index": i, "total": len(payloads)})
                    break
                name = filename.lower()
                try:
                    fields = _parse_upload(name, filename, data)
                except HTTPException as e:  # unsupported type / unreadable PDF
                    yield _sse({"type": "line", "index": i, "file": filename,
                                "summary": str(e.detail), "skipped": True, "error": True})
                    continue

                digest = content_hash(fields["sender"], fields["title"], fields["raw_text"])
                existing = find_source_by_hash(session, digest)
                if existing:
                    yield _sse({"type": "line", "index": i, "file": filename,
                                "summary": "already on file, skipped", "skipped": True,
                                "source_id": existing.id})
                    continue

                yield _sse({"type": "item", "index": i, "total": len(payloads),
                            "title": fields["title"], "sender": fields.get("sender", "")})
                try:
                    source = store_source(session, **fields)
                    counts = extract_source(session, source)
                except LLMNotConfigured as e:
                    yield _sse({"type": "error", "message": str(e)})
                    break
                except LLMUpstreamError as e:
                    yield _sse({"type": "error", "message": str(e)})
                    break
                new += 1
                yield _sse({"type": "line", "index": i, "file": filename,
                            "summary": summarize_counts(counts), "skipped": False,
                            "source_id": source.id})

            yield _sse({"type": "done", "new": new, "total": len(payloads)})
            yield _sse({"type": "close"})
        finally:
            # Clean finish, error, or client Stop (GeneratorExit): file what landed.
            try:
                refresh_action_items(session)
            finally:
                session.close()
                done.set()

    return StreamingResponse(
        gen(), media_type="text/event-stream", headers=_SSE_HEADERS,
        background=BackgroundTask(regenerate_suggestions_bg),
    )
