"""Gmail REST API service — fetches messages using OAuth access tokens."""
import base64
import logging
from datetime import datetime, timedelta, timezone
from email.utils import parseaddr

import httpx

from app.models.email_account import EmailAccount
from app.services.encryption_service import encryption_service

logger = logging.getLogger(__name__)

GMAIL_API = "https://gmail.googleapis.com/gmail/v1"
GMAIL_TOKEN_URL = "https://oauth2.googleapis.com/token"


# ── token helpers ─────────────────────────────────────────────────────────────

async def get_valid_access_token(account: EmailAccount) -> str:
    """Return a valid access token, refreshing it if it expires within 5 minutes."""
    access_token = encryption_service.decrypt(account.oauth_access_token)

    if account.oauth_token_expiry:
        expiry = account.oauth_token_expiry
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
        if expiry < datetime.now(timezone.utc) + timedelta(minutes=5):
            if account.oauth_refresh_token:
                refreshed = await _refresh_access_token(account)
                if refreshed:
                    return refreshed

    return access_token


async def _refresh_access_token(account: EmailAccount) -> str | None:
    """Call Google token endpoint to get a fresh access token."""
    from app.config import settings
    refresh_token = encryption_service.decrypt(account.oauth_refresh_token)
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(GMAIL_TOKEN_URL, data={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": settings.gmail_client_id,
                "client_secret": settings.gmail_client_secret,
            })
            resp.raise_for_status()
            return resp.json()["access_token"]
    except Exception as exc:
        logger.error("Gmail token refresh failed for %s: %s", account.email_address, exc)
        return None


# ── body extraction ───────────────────────────────────────────────────────────

def _b64_decode(data: str) -> str:
    """Decode URL-safe base64 Gmail body data."""
    padded = data + "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(padded).decode("utf-8", errors="replace")


def _extract_body(payload: dict) -> tuple[str, str, bool]:
    """Recursively extract plain text, HTML, and attachment flag from Gmail payload."""
    body_text = ""
    body_html = ""
    has_attachments = False

    mime = payload.get("mimeType", "")
    filename = payload.get("filename", "")

    if filename:
        has_attachments = True
        return body_text, body_html, has_attachments

    if mime == "text/plain":
        data = payload.get("body", {}).get("data", "")
        if data:
            body_text = _b64_decode(data)
    elif mime == "text/html":
        data = payload.get("body", {}).get("data", "")
        if data:
            body_html = _b64_decode(data)
    elif mime.startswith("multipart/"):
        for part in payload.get("parts", []):
            pt, ph, pa = _extract_body(part)
            if pt and not body_text:
                body_text = pt
            if ph and not body_html:
                body_html = ph
            if pa:
                has_attachments = True

    return body_text, body_html, has_attachments


# ── message parsing ───────────────────────────────────────────────────────────

def _parse_addr_list(raw: str) -> list[dict]:
    if not raw:
        return []
    results = []
    for part in raw.split(","):
        name, addr = parseaddr(part.strip())
        if addr:
            results.append({"email": addr, "name": name})
    return results


def _parse_gmail_message(msg: dict) -> dict:
    """Convert a Gmail API message object into our standard parsed-email dict."""
    headers = {h["name"].lower(): h["value"] for h in msg.get("payload", {}).get("headers", [])}

    from_name, from_address = parseaddr(headers.get("from", ""))
    message_id_header = headers.get("message-id", "").strip()
    in_reply_to = headers.get("in-reply-to", "").strip()
    references = headers.get("references", "").strip()

    # Gmail internalDate is milliseconds since epoch
    internal_date = msg.get("internalDate")
    received_at = (
        datetime.fromtimestamp(int(internal_date) / 1000, tz=timezone.utc)
        if internal_date
        else datetime.now(timezone.utc)
    )

    body_text, body_html, has_attachments = _extract_body(msg.get("payload", {}))
    snippet = msg.get("snippet", "")[:200]

    return {
        "message_id_header": message_id_header or None,
        "in_reply_to": in_reply_to or None,
        "references": references or None,
        "from_address": from_address,
        "from_name": from_name,
        "to_addresses": _parse_addr_list(headers.get("to", "")),
        "cc_addresses": _parse_addr_list(headers.get("cc", "")),
        "reply_to": None,
        "subject": headers.get("subject", ""),
        "body_text": body_text,
        "body_html": body_html,
        "snippet": snippet,
        "received_at": received_at,
        "has_attachments": has_attachments,
        "imap_folder": "INBOX",
        # Store Gmail message ID so we can de-dup without a Message-ID header
        "gmail_id": msg["id"],
    }


# ── main fetch function ───────────────────────────────────────────────────────

async def fetch_new_messages_gmail(account: EmailAccount) -> tuple[list[dict], int]:
    """
    Fetch new Gmail inbox messages using the Gmail REST API.

    Uses account.last_uid_seen to store Google's historyId, which lets us
    efficiently fetch only messages that arrived since the last sync.

    Returns:
        (list of parsed message dicts, new historyId to persist)
    """
    access_token = await get_valid_access_token(account)
    auth_headers = {"Authorization": f"Bearer {access_token}"}
    messages: list[dict] = []
    new_history_id = account.last_uid_seen

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            if account.last_uid_seen == 0:
                # ── First sync: list recent inbox messages ──────────────────
                resp = await client.get(
                    f"{GMAIL_API}/users/me/messages",
                    headers=auth_headers,
                    params={"maxResults": 100, "q": "in:inbox"},
                )
                resp.raise_for_status()
                data = resp.json()
                new_history_id = int(data.get("historyId", 0))
                msg_refs = data.get("messages", [])
            else:
                # ── Incremental sync: use Gmail history API ─────────────────
                resp = await client.get(
                    f"{GMAIL_API}/users/me/history",
                    headers=auth_headers,
                    params={
                        "startHistoryId": str(account.last_uid_seen),
                        "historyTypes": "messageAdded",
                        "labelId": "INBOX",
                    },
                )
                if resp.status_code == 404:
                    # historyId expired — reset and do a full re-fetch
                    logger.warning("Gmail historyId expired for %s, doing full re-fetch", account.email_address)
                    account.last_uid_seen = 0
                    return await fetch_new_messages_gmail(account)
                resp.raise_for_status()
                data = resp.json()
                new_history_id = int(data.get("historyId", account.last_uid_seen))
                msg_refs = [
                    added["message"]
                    for record in data.get("history", [])
                    for added in record.get("messagesAdded", [])
                ]

            # ── Fetch full content for each message reference ───────────────
            for ref in msg_refs:
                try:
                    full_resp = await client.get(
                        f"{GMAIL_API}/users/me/messages/{ref['id']}",
                        headers=auth_headers,
                        params={"format": "full"},
                    )
                    if full_resp.status_code != 200:
                        continue
                    msg_data = full_resp.json()

                    # Skip messages that are only in SENT (not in INBOX)
                    label_ids = msg_data.get("labelIds", [])
                    if "SENT" in label_ids and "INBOX" not in label_ids:
                        continue

                    messages.append(_parse_gmail_message(msg_data))
                except Exception as exc:
                    logger.warning("Failed to fetch Gmail message %s: %s", ref.get("id"), exc)

        except Exception as exc:
            logger.error(
                "Gmail API fetch error for %s: %s",
                account.email_address, exc, exc_info=True,
            )

    return messages, new_history_id
