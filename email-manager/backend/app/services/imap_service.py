import asyncio
import email as email_lib
import re
from datetime import datetime, timezone
from email.header import decode_header as _decode_header
from email.utils import parseaddr, parsedate_to_datetime

import aioimaplib

from app.models.email_account import EmailAccount
from app.services.encryption_service import encryption_service


def _decode_str(value: str | bytes | None, charset: str | None = None) -> str:
    if value is None:
        return ""
    if isinstance(value, bytes):
        return value.decode(charset or "utf-8", errors="replace")
    return value


def decode_mime_header(raw: str | None) -> str:
    if not raw:
        return ""
    parts = _decode_header(raw)
    return "".join(_decode_str(text, charset) for text, charset in parts)


def extract_addresses(raw: str | None) -> list[dict]:
    if not raw:
        return []
    results = []
    for part in raw.split(","):
        name, addr = parseaddr(part.strip())
        if addr:
            results.append({"email": addr, "name": decode_mime_header(name)})
    return results


def parse_raw_email(raw_bytes: bytes, account_id, folder: str = "INBOX") -> dict:
    msg = email_lib.message_from_bytes(raw_bytes)

    subject = decode_mime_header(msg.get("Subject"))
    from_raw = msg.get("From", "")
    from_name, from_address = parseaddr(from_raw)
    from_name = decode_mime_header(from_name)

    message_id_header = msg.get("Message-ID", "").strip()
    in_reply_to = msg.get("In-Reply-To", "").strip()
    references = msg.get("References", "").strip()

    to_addresses = extract_addresses(msg.get("To"))
    cc_addresses = extract_addresses(msg.get("Cc"))
    reply_to_raw = msg.get("Reply-To", "")
    _, reply_to = parseaddr(reply_to_raw)

    # Parse date
    received_at = datetime.now(timezone.utc)
    date_str = msg.get("Date")
    if date_str:
        try:
            received_at = parsedate_to_datetime(date_str)
        except Exception:
            pass

    body_text = ""
    body_html = ""
    has_attachments = False

    if msg.is_multipart():
        for part in msg.walk():
            ct = part.get_content_type()
            cd = part.get("Content-Disposition", "")
            if "attachment" in cd:
                has_attachments = True
                continue
            if ct == "text/plain" and not body_text:
                payload = part.get_payload(decode=True)
                charset = part.get_content_charset() or "utf-8"
                body_text = payload.decode(charset, errors="replace") if payload else ""
            elif ct == "text/html" and not body_html:
                payload = part.get_payload(decode=True)
                charset = part.get_content_charset() or "utf-8"
                body_html = payload.decode(charset, errors="replace") if payload else ""
    else:
        payload = msg.get_payload(decode=True)
        charset = msg.get_content_charset() or "utf-8"
        ct = msg.get_content_type()
        if payload:
            if ct == "text/html":
                body_html = payload.decode(charset, errors="replace")
            else:
                body_text = payload.decode(charset, errors="replace")

    snippet = (body_text or "").strip()[:200].replace("\n", " ")

    return {
        "message_id_header": message_id_header or None,
        "in_reply_to": in_reply_to or None,
        "references": references or None,
        "from_address": from_address,
        "from_name": from_name,
        "to_addresses": to_addresses,
        "cc_addresses": cc_addresses,
        "reply_to": reply_to or None,
        "subject": subject,
        "body_text": body_text,
        "body_html": body_html,
        "snippet": snippet,
        "received_at": received_at,
        "has_attachments": has_attachments,
        "imap_folder": folder,
    }


async def test_imap_connection(account: EmailAccount) -> bool:
    """Try connecting to IMAP with decrypted credentials. Returns True on success."""
    password = encryption_service.decrypt(account.encrypted_password)
    client = aioimaplib.IMAP4_SSL(account.imap_host, account.imap_port) if account.imap_use_ssl \
        else aioimaplib.IMAP4(account.imap_host, account.imap_port)
    try:
        await client.wait_hello_from_server()
        await client.login(account.email_address, password)
        await client.logout()
        return True
    except Exception:
        return False


async def fetch_new_messages(account: EmailAccount) -> list[dict]:
    """Fetch emails with UID greater than account.last_uid_seen. Returns list of parsed dicts."""
    password = encryption_service.decrypt(account.encrypted_password)

    client = aioimaplib.IMAP4_SSL(account.imap_host, account.imap_port) if account.imap_use_ssl \
        else aioimaplib.IMAP4(account.imap_host, account.imap_port)

    messages = []
    try:
        await client.wait_hello_from_server()
        await client.login(account.email_address, password)
        await client.select("INBOX")

        uid_start = account.last_uid_seen + 1
        _, data = await client.uid("search", f"UID {uid_start}:*")
        uid_list = data[0].split() if data and data[0] else []

        for uid_bytes in uid_list:
            uid = int(uid_bytes)
            if uid <= account.last_uid_seen:
                continue
            _, msg_data = await client.uid("fetch", str(uid), "(RFC822)")
            if msg_data and len(msg_data) >= 2:
                raw = msg_data[1]
                if isinstance(raw, (bytes, bytearray)):
                    parsed = parse_raw_email(raw, account.id)
                    parsed["imap_uid"] = uid
                    messages.append(parsed)

        await client.logout()
    except Exception as exc:
        # Log but don't crash — polling will retry next cycle
        import logging
        logging.getLogger(__name__).error("IMAP fetch error for %s: %s", account.email_address, exc)

    return messages
