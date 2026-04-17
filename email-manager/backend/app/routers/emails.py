import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.core.exceptions import forbidden_exception, not_found_exception
from app.database import get_db
from app.models.email_account import EmailAccount
from app.models.email_message import EmailMessage
from app.models.email_thread import EmailThread
from app.models.user import User
from app.schemas.email_message import ComposeEmail, EmailMessageDetail, EmailMessageOut, ReplyEmail
from app.services.smtp_service import send_email

router = APIRouter(prefix="/emails", tags=["emails"])


@router.get("", response_model=list[EmailMessageOut])
async def list_emails(
    account_ids: str | None = Query(None, description="Comma-separated account UUIDs"),
    is_read: bool | None = Query(None),
    is_sent: bool | None = Query(None),
    has_attachments: bool | None = Query(None),
    auto_replied: bool | None = Query(None),
    search: str | None = Query(None, description="Full-text search in subject and body"),
    from_address: str | None = Query(None, alias="from"),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Collect account IDs belonging to this user
    user_account_ids = await _get_user_account_ids(current_user.id, db)
    if not user_account_ids:
        return []

    # Filter to requested account_ids if provided
    if account_ids:
        requested = [uuid.UUID(a.strip()) for a in account_ids.split(",")]
        filtered = [a for a in requested if a in user_account_ids]
    else:
        filtered = user_account_ids

    if not filtered:
        return []

    conditions = [EmailMessage.email_account_id.in_(filtered)]

    if is_read is not None:
        conditions.append(EmailMessage.is_read == is_read)
    if is_sent is not None:
        conditions.append(EmailMessage.is_sent == is_sent)
    if has_attachments is not None:
        conditions.append(EmailMessage.has_attachments == has_attachments)
    if auto_replied is not None:
        conditions.append(EmailMessage.auto_replied == auto_replied)
    if from_address:
        conditions.append(EmailMessage.from_address.ilike(f"%{from_address}%"))
    if date_from:
        conditions.append(EmailMessage.received_at >= date_from)
    if date_to:
        conditions.append(EmailMessage.received_at <= date_to)
    if search:
        # pg_trgm similarity search
        conditions.append(
            or_(
                EmailMessage.subject.ilike(f"%{search}%"),
                EmailMessage.body_text.ilike(f"%{search}%"),
            )
        )

    offset = (page - 1) * page_size
    result = await db.execute(
        select(EmailMessage)
        .where(and_(*conditions))
        .order_by(EmailMessage.received_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    return result.scalars().all()


@router.get("/{message_id}", response_model=EmailMessageDetail)
async def get_email(
    message_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    message = await _get_message(message_id, current_user.id, db)
    message.is_read = True
    await db.commit()
    await db.refresh(message)
    return message


@router.get("/{message_id}/thread", response_model=list[EmailMessageOut])
async def get_thread(
    message_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    message = await _get_message(message_id, current_user.id, db)
    result = await db.execute(
        select(EmailMessage)
        .where(EmailMessage.thread_id == message.thread_id)
        .order_by(EmailMessage.received_at.asc())
    )
    return result.scalars().all()


@router.post("/{message_id}/reply", status_code=201)
async def reply_to_email(
    message_id: uuid.UUID,
    body: ReplyEmail,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    message = await _get_message(message_id, current_user.id, db)
    account = await _get_account(message.email_account_id, db)

    if account.account_type != "imap_smtp":
        raise HTTPException(status_code=400, detail="OAuth account sending not yet supported via this endpoint")

    to_list = [message.from_address]
    subject = f"Re: {message.subject}" if message.subject and not message.subject.startswith("Re:") else (message.subject or "")

    await send_email(
        account=account,
        to_addresses=to_list,
        subject=subject,
        body_text=body.body_text,
        body_html=body.body_html,
        in_reply_to=message.message_id_header,
    )
    return {"status": "sent"}


@router.post("/compose", status_code=201)
async def compose_email(
    body: ComposeEmail,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    account = await _get_account(body.account_id, db)
    if account.user_id != current_user.id:
        raise forbidden_exception
    if account.account_type != "imap_smtp":
        raise HTTPException(status_code=400, detail="OAuth account sending not yet supported via this endpoint")

    await send_email(
        account=account,
        to_addresses=body.to_addresses,
        subject=body.subject,
        body_text=body.body_text,
        body_html=body.body_html,
    )
    return {"status": "sent"}


@router.patch("/{message_id}/read")
async def toggle_read(
    message_id: uuid.UUID,
    is_read: bool,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    message = await _get_message(message_id, current_user.id, db)
    message.is_read = is_read
    await db.commit()
    return {"is_read": is_read}


@router.patch("/{message_id}/star")
async def toggle_star(
    message_id: uuid.UUID,
    is_starred: bool,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    message = await _get_message(message_id, current_user.id, db)
    # Star lives on the thread
    result = await db.execute(select(EmailThread).where(EmailThread.id == message.thread_id))
    thread = result.scalar_one()
    thread.is_starred = is_starred
    await db.commit()
    return {"is_starred": is_starred}


@router.patch("/{message_id}/archive")
async def archive_message(
    message_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    message = await _get_message(message_id, current_user.id, db)
    result = await db.execute(select(EmailThread).where(EmailThread.id == message.thread_id))
    thread = result.scalar_one()
    thread.is_archived = True
    await db.commit()
    return {"archived": True}


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _get_user_account_ids(user_id: uuid.UUID, db: AsyncSession) -> list[uuid.UUID]:
    result = await db.execute(select(EmailAccount.id).where(EmailAccount.user_id == user_id))
    return [row[0] for row in result.all()]


async def _get_message(message_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession) -> EmailMessage:
    result = await db.execute(select(EmailMessage).where(EmailMessage.id == message_id))
    message = result.scalar_one_or_none()
    if not message:
        raise not_found_exception
    # Verify ownership via account
    account = await _get_account(message.email_account_id, db)
    if account.user_id != user_id:
        raise forbidden_exception
    return message


async def _get_account(account_id: uuid.UUID, db: AsyncSession) -> EmailAccount:
    result = await db.execute(select(EmailAccount).where(EmailAccount.id == account_id))
    account = result.scalar_one_or_none()
    if not account:
        raise not_found_exception
    return account
