from datetime import date

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlmodel import Session

from ..db import get_session
from ..services.actions import refresh_action_items
from ..services.extraction import extract_source, find_source_by_hash, store_source
from ..services.gmail_sync import GmailNotConfigured, sync_inbox
from ..services.llm import LLMNotConfigured
from ..services.normalize import content_hash
from ..services.pdf import parse_eml, pdf_to_text

router = APIRouter(prefix="/api", tags=["ingest"])


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
async def upload_files(files: list[UploadFile], session: Session = Depends(get_session)):
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
    refresh_action_items(session)  # surface new trials/renewals/price hikes immediately
    return {"results": results}


@router.post("/sync")
def sync_gmail(max_messages: int | None = None, session: Session = Depends(get_session)):
    try:
        result = sync_inbox(session, max_messages)
        refresh_action_items(session)
        return result
    except GmailNotConfigured as e:
        raise HTTPException(503, str(e))
    except LLMNotConfigured as e:
        raise HTTPException(503, str(e))
