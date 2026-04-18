"""Celery tasks for polling IMAP accounts and storing new emails."""
import asyncio
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.models.email_account import EmailAccount
from app.models.email_message import EmailMessage
from app.models.email_thread import EmailThread
from app.services.imap_service import fetch_new_messages
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="app.workers.email_polling.poll_all_active_accounts")
def poll_all_active_accounts():
    asyncio.run(_poll_all())


@celery_app.task(name="app.workers.email_polling.poll_single_account")
def poll_single_account(account_id: str):
    asyncio.run(_poll_account_by_id(uuid.UUID(account_id)))


async def _poll_all():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(EmailAccount).where(EmailAccount.is_active == True))  # noqa: E712
        accounts = result.scalars().all()

    for account in accounts:
        try:
            await _process_account(account)
        except Exception as exc:
            logger.error("Polling failed for account %s: %s", account.email_address, exc)


async def _poll_account_by_id(account_id: uuid.UUID):
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(EmailAccount).where(EmailAccount.id == account_id))
        account = result.scalar_one_or_none()
        if not account:
            return
    await _process_account(account)


async def _process_account(account: EmailAccount):
    new_messages: list[dict] = []
    new_last_uid: int | None = None  # set by OAuth providers that manage their own cursor

    if account.account_type == "imap_smtp":
        new_messages = await fetch_new_messages(account)
    elif account.account_type == "gmail_oauth":
        from app.services.gmail_service import fetch_new_messages_gmail
        new_messages, new_last_uid = await fetch_new_messages_gmail(account)
    else:
        logger.info("OAuth polling not yet implemented for %s", account.email_address)

    if not new_messages:
        async with AsyncSessionLocal() as db:
            account = await db.merge(account)
            if new_last_uid is not None:
                account.last_uid_seen = new_last_uid
            account.last_polled_at = datetime.now(timezone.utc)
            await db.commit()
        return

    async with AsyncSessionLocal() as db:
        account = await db.merge(account)
        new_message_ids = []

        for msg_data in new_messages:
            message_id = await _store_message(db, account, msg_data)
            if message_id:
                new_message_ids.append(str(message_id))

        # Update polling cursor
        if new_last_uid is not None:
            # Gmail: use the historyId returned by the API
            account.last_uid_seen = new_last_uid
        else:
            # IMAP: advance by max UID seen
            max_uid = max(
                (m["imap_uid"] for m in new_messages if m.get("imap_uid")),
                default=account.last_uid_seen,
            )
            account.last_uid_seen = max_uid
        account.last_polled_at = datetime.now(timezone.utc)
        await db.commit()

    # Trigger auto-reply processing for new messages
    if new_message_ids:
        from app.workers.auto_reply_processor import process_new_messages
        process_new_messages.delay(str(account.user_id), new_message_ids)


async def _store_message(db: AsyncSession, account: EmailAccount, msg_data: dict) -> uuid.UUID | None:
    """Store a parsed email. Returns the new message UUID, or None if duplicate."""
    # Deduplication by Message-ID header
    if msg_data.get("message_id_header"):
        existing = await db.execute(
            select(EmailMessage).where(EmailMessage.message_id_header == msg_data["message_id_header"])
        )
        if existing.scalar_one_or_none():
            return None

    # Thread grouping: match by In-Reply-To or References
    thread = await _find_or_create_thread(db, account, msg_data)

    message = EmailMessage(
        thread_id=thread.id,
        email_account_id=account.id,
        message_id_header=msg_data.get("message_id_header"),
        imap_uid=msg_data.get("imap_uid"),
        imap_folder=msg_data.get("imap_folder", "INBOX"),
        from_address=msg_data["from_address"],
        from_name=msg_data.get("from_name"),
        to_addresses=msg_data.get("to_addresses", []),
        cc_addresses=msg_data.get("cc_addresses", []),
        reply_to=msg_data.get("reply_to"),
        subject=msg_data.get("subject"),
        body_text=msg_data.get("body_text"),
        body_html=msg_data.get("body_html"),
        snippet=msg_data.get("snippet"),
        received_at=msg_data.get("received_at", datetime.now(timezone.utc)),
        has_attachments=msg_data.get("has_attachments", False),
    )
    db.add(message)

    # Update thread metadata
    thread.message_count += 1
    thread.last_message_at = message.received_at
    if msg_data["from_address"] not in thread.participant_emails:
        thread.participant_emails = thread.participant_emails + [msg_data["from_address"]]

    await db.flush()
    return message.id


async def _find_or_create_thread(db: AsyncSession, account: EmailAccount, msg_data: dict) -> EmailThread:
    """Find an existing thread via In-Reply-To/References, or create a new one."""
    in_reply_to = msg_data.get("in_reply_to")
    references = msg_data.get("references", "")

    if in_reply_to:
        # Look for a message with this Message-ID
        result = await db.execute(
            select(EmailMessage).where(EmailMessage.message_id_header == in_reply_to)
        )
        parent = result.scalar_one_or_none()
        if parent:
            result2 = await db.execute(select(EmailThread).where(EmailThread.id == parent.thread_id))
            thread = result2.scalar_one_or_none()
            if thread:
                return thread

    thread = EmailThread(
        email_account_id=account.id,
        thread_subject=msg_data.get("subject"),
        participant_emails=[msg_data["from_address"]],
        last_message_at=msg_data.get("received_at", datetime.now(timezone.utc)),
        message_count=0,
    )
    db.add(thread)
    await db.flush()
    return thread
