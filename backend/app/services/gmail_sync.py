"""One-shot Gmail sync (readonly) for the seeded demo account.

Requires backend/credentials.json (OAuth client) — see README. First run opens a browser
consent window and caches token.json. If credentials are missing we fail with a clear
message; the upload path keeps working regardless.
"""

import base64
import os
from collections.abc import Callable, Iterator
from datetime import date

from sqlmodel import Session, select

from ..config import GMAIL_CREDENTIALS_FILE, GMAIL_MAX_MESSAGES, GMAIL_TOKEN_FILE
from ..models import Source
from .extraction import extract_source, store_source, summarize_counts
from .pdf import html_to_text, pdf_to_text

SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]


class GmailNotConfigured(Exception):
    pass


def _get_service():
    try:
        from google.auth.transport.requests import Request
        from google.oauth2.credentials import Credentials
        from google_auth_oauthlib.flow import InstalledAppFlow
        from googleapiclient.discovery import build
    except ImportError as e:
        raise GmailNotConfigured(f"Google API libraries not installed: {e}")

    creds = None
    if os.path.exists(GMAIL_TOKEN_FILE):
        creds = Credentials.from_authorized_user_file(GMAIL_TOKEN_FILE, SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not os.path.exists(GMAIL_CREDENTIALS_FILE):
                raise GmailNotConfigured(
                    "credentials.json not found in backend/. Create an OAuth client "
                    "(Desktop app) in Google Cloud Console with the Gmail API enabled."
                )
            flow = InstalledAppFlow.from_client_secrets_file(GMAIL_CREDENTIALS_FILE, SCOPES)
            creds = flow.run_local_server(port=0)
        with open(GMAIL_TOKEN_FILE, "w") as f:
            f.write(creds.to_json())
    return build("gmail", "v1", credentials=creds)


def _walk_parts(service, msg_id: str, payload: dict) -> tuple[list[str], list[str]]:
    """Returns (plain_texts, html_texts); PDF attachments are appended to plain_texts."""
    plains: list[str] = []
    htmls: list[str] = []
    stack = [payload]
    while stack:
        part = stack.pop()
        for child in part.get("parts", []) or []:
            stack.append(child)
        mime = part.get("mimeType", "")
        body = part.get("body", {}) or {}
        data = body.get("data")
        if data:
            decoded = base64.urlsafe_b64decode(data.encode()).decode("utf-8", errors="replace")
            if mime == "text/plain":
                plains.append(decoded)
            elif mime == "text/html":
                htmls.append(decoded)
        elif mime == "application/pdf" and body.get("attachmentId"):
            try:
                att = service.users().messages().attachments().get(
                    userId="me", messageId=msg_id, id=body["attachmentId"]).execute()
                pdf_bytes = base64.urlsafe_b64decode(att["data"].encode())
                text = pdf_to_text(pdf_bytes)
                if text:
                    plains.append(f"\n--- ATTACHMENT: {part.get('filename', 'file.pdf')} ---\n{text}")
            except Exception:
                pass
    return plains, htmls


def sync_inbox_events(session: Session, max_messages: int | None = None,
                      should_stop: Callable[[], bool] | None = None) -> Iterator[dict]:
    """Sync the inbox while yielding progress events, one message at a time, so the
    UI can narrate the agent's work live over SSE. Event shapes:

      {"type": "status", "message": str}          - connection / listing progress
      {"type": "start",  "total": int}            - number of messages to scan
      {"type": "item",   "index", "total",        - a message the agent is now analyzing
                         "title", "sender"}
      {"type": "line",   "index", "file",         - result for one message (a "row")
                         "summary", "skipped", "source_id"}
      {"type": "done", "fetched", "new",          - final tally (same as sync_inbox())
                       "skipped_existing", "extracted"}

    The consumer is responsible for translating these into `data:` SSE frames.
    """
    yield {"type": "status", "message": "connecting to gmail…"}
    service = _get_service()
    limit = max_messages or GMAIL_MAX_MESSAGES
    yield {"type": "status", "message": "listing inbox…"}
    resp = service.users().messages().list(
        userId="me", maxResults=limit, q="-in:spam -in:trash").execute()
    message_ids = [m["id"] for m in resp.get("messages", [])]
    total = len(message_ids)
    yield {"type": "start", "total": total}

    new, skipped = 0, 0
    counts_total = {"subscriptions": 0, "bills": 0, "transactions": 0, "documents": 0}
    for i, mid in enumerate(message_ids):
        # Cooperative cancel: the client hit Stop (disconnected). Break before doing any
        # more Gmail fetches or LLM extraction — whatever's already committed stays.
        if should_stop and should_stop():
            yield {"type": "stopped", "index": i, "total": total}
            break
        exists = session.exec(select(Source).where(Source.external_id == mid)).first()
        if exists:
            skipped += 1
            yield {"type": "line", "index": i, "file": exists.title or "(already on file)",
                   "summary": "already synced, skipped", "skipped": True,
                   "source_id": exists.id}
            continue
        full = service.users().messages().get(userId="me", id=mid, format="full").execute()
        headers = {h["name"].lower(): h["value"] for h in full.get("payload", {}).get("headers", [])}
        title = headers.get("subject", "(no subject)")
        sender = headers.get("from", "")
        yield {"type": "item", "index": i, "total": total, "title": title, "sender": sender}
        plains, htmls = _walk_parts(service, mid, full.get("payload", {}))
        body = "\n".join(plains).strip() or html_to_text("\n".join(htmls))
        received: date | None = None
        if full.get("internalDate"):
            received = date.fromtimestamp(int(full["internalDate"]) / 1000)
        source = store_source(
            session,
            source_type="email",
            title=title,
            sender=sender,
            received_at=received,
            raw_text=body,
            external_id=mid,
        )
        counts = extract_source(session, source)
        for k in counts_total:
            counts_total[k] += counts[k]
        new += 1
        yield {"type": "line", "index": i, "file": title, "summary": summarize_counts(counts),
               "skipped": False, "source_id": source.id}

    yield {"type": "done", "fetched": total, "new": new,
           "skipped_existing": skipped, "extracted": counts_total}


def sync_inbox(session: Session, max_messages: int | None = None) -> dict:
    """Non-streaming sync: drive the event generator to completion and return the
    final tally. The streaming endpoint consumes `sync_inbox_events` directly."""
    result = {"fetched": 0, "new": 0, "skipped_existing": 0,
              "extracted": {"subscriptions": 0, "bills": 0, "transactions": 0, "documents": 0}}
    for event in sync_inbox_events(session, max_messages):
        if event["type"] == "done":
            result = {k: v for k, v in event.items() if k != "type"}
    return result
