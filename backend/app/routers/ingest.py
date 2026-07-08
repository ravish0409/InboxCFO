from datetime import date

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlmodel import Session

from ..db import get_session
from ..services.extraction import extract_source, store_source
from ..services.gmail_sync import GmailNotConfigured, sync_inbox
from ..services.llm import LLMNotConfigured
from ..services.pdf import parse_eml, pdf_to_text

router = APIRouter(prefix="/api", tags=["ingest"])


@router.post("/upload")
async def upload_files(files: list[UploadFile], session: Session = Depends(get_session)):
    results = []
    for f in files:
        data = await f.read()
        name = (f.filename or "upload").lower()
        try:
            if name.endswith(".eml"):
                parsed = parse_eml(data)
                source = store_source(
                    session, source_type="email", title=parsed["subject"] or f.filename,
                    sender=parsed["sender"], received_at=parsed["received_at"],
                    raw_text=parsed["body"],
                )
            elif name.endswith(".pdf"):
                text = pdf_to_text(data)
                if not text:
                    raise HTTPException(422, f"{f.filename}: no extractable text (scanned PDF?)")
                source = store_source(
                    session, source_type="pdf", title=f.filename or "document.pdf",
                    received_at=date.today(), raw_text=text,
                )
            elif name.endswith(".txt"):
                source = store_source(
                    session, source_type="text", title=f.filename or "note.txt",
                    received_at=date.today(), raw_text=data.decode("utf-8", errors="replace"),
                )
            else:
                raise HTTPException(415, f"{f.filename}: only .eml, .pdf, .txt supported")
            counts = extract_source(session, source)
            results.append({"file": f.filename, "source_id": source.id, "extracted": counts})
        except LLMNotConfigured as e:
            raise HTTPException(503, str(e))
    return {"results": results}


@router.post("/sync")
def sync_gmail(max_messages: int | None = None, session: Session = Depends(get_session)):
    try:
        return sync_inbox(session, max_messages)
    except GmailNotConfigured as e:
        raise HTTPException(503, str(e))
    except LLMNotConfigured as e:
        raise HTTPException(503, str(e))
