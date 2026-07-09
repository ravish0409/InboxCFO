"""PDF and .eml text extraction helpers."""

import email
import email.policy
import re
from datetime import date, datetime


def pdf_to_text(data: bytes) -> str:
    import fitz  # PyMuPDF

    with fitz.open(stream=data, filetype="pdf") as doc:
        return "\n".join(page.get_text() for page in doc).strip()


def html_to_text(html: str) -> str:
    text = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", html, flags=re.S | re.I)
    text = re.sub(r"<br\s*/?>|</p>|</div>|</tr>", "\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = text.replace("&nbsp;", " ").replace("&amp;", "&").replace("&#8377;", "₹")
    return re.sub(r"[ \t]{2,}", " ", text).strip()


def parse_eml(data: bytes) -> dict:
    """Parse a raw .eml file into subject/sender/date/body (+ extracted PDF attachments)."""
    msg = email.message_from_bytes(data, policy=email.policy.default)
    subject = msg.get("Subject", "")
    sender = msg.get("From", "")
    received: date | None = None
    if msg.get("Date"):
        try:
            received = email.utils.parsedate_to_datetime(msg["Date"]).date()
        except (TypeError, ValueError):
            received = None

    body_parts: list[str] = []
    plain = msg.get_body(preferencelist=("plain",))
    if plain is not None:
        body_parts.append(plain.get_content())
    else:
        html = msg.get_body(preferencelist=("html",))
        if html is not None:
            body_parts.append(html_to_text(html.get_content()))

    for part in msg.iter_attachments():
        if part.get_content_type() == "application/pdf":
            try:
                pdf_text = pdf_to_text(part.get_payload(decode=True))
                if pdf_text:
                    body_parts.append(f"\n--- ATTACHMENT: {part.get_filename()} ---\n{pdf_text}")
            except Exception:
                pass

    return {
        "subject": subject,
        "sender": sender,
        "received_at": received,
        "body": "\n".join(body_parts).strip(),
    }
