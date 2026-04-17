"""Celery task: process new emails through the auto-reply engine."""
import asyncio
import uuid
import logging

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.email_account import EmailAccount
from app.models.email_message import EmailMessage
from app.services.auto_reply_service import process_message_for_auto_reply
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="app.workers.auto_reply_processor.process_new_messages")
def process_new_messages(user_id: str, message_ids: list[str]):
    asyncio.run(_process(user_id, message_ids))


async def _process(user_id: str, message_ids: list[str]):
    async with AsyncSessionLocal() as db:
        for mid_str in message_ids:
            try:
                mid = uuid.UUID(mid_str)
                result = await db.execute(select(EmailMessage).where(EmailMessage.id == mid))
                message = result.scalar_one_or_none()
                if not message:
                    continue

                acct_result = await db.execute(
                    select(EmailAccount).where(EmailAccount.id == message.email_account_id)
                )
                account = acct_result.scalar_one_or_none()
                if not account or account.account_type != "imap_smtp":
                    continue

                await process_message_for_auto_reply(db, message, account)

            except Exception as exc:
                logger.error("Auto-reply processing failed for message %s: %s", mid_str, exc)
