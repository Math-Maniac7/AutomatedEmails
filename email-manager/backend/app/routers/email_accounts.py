import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.core.exceptions import not_found_exception, forbidden_exception
from app.database import get_db
from app.models.email_account import EmailAccount
from app.models.user import User
from app.schemas.email_account import EmailAccountOut, EmailAccountUpdate, ImapAccountCreate
from app.services.encryption_service import encryption_service
from app.services.imap_service import test_imap_connection

router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.get("", response_model=list[EmailAccountOut])
async def list_accounts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(EmailAccount).where(EmailAccount.user_id == current_user.id))
    return result.scalars().all()


@router.post("/imap", response_model=EmailAccountOut, status_code=status.HTTP_201_CREATED)
async def connect_imap_account(
    body: ImapAccountCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Check for duplicate
    result = await db.execute(
        select(EmailAccount).where(
            EmailAccount.user_id == current_user.id,
            EmailAccount.email_address == body.email_address,
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Account already connected")

    encrypted_pw = encryption_service.encrypt(body.password)

    account = EmailAccount(
        user_id=current_user.id,
        account_type="imap_smtp",
        display_name=body.display_name,
        email_address=body.email_address,
        color_label=body.color_label,
        imap_host=body.imap_host,
        imap_port=body.imap_port,
        imap_use_ssl=body.imap_use_ssl,
        smtp_host=body.smtp_host,
        smtp_port=body.smtp_port,
        smtp_use_tls=body.smtp_use_tls,
        encrypted_password=encrypted_pw,
    )
    db.add(account)
    await db.commit()
    await db.refresh(account)
    return account


@router.put("/{account_id}", response_model=EmailAccountOut)
async def update_account(
    account_id: uuid.UUID,
    body: EmailAccountUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    account = await _get_account(account_id, current_user.id, db)
    update_data = body.model_dump(exclude_unset=True)

    if "password" in update_data:
        account.encrypted_password = encryption_service.encrypt(update_data.pop("password"))

    for field, value in update_data.items():
        setattr(account, field, value)

    await db.commit()
    await db.refresh(account)
    return account


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    account_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    account = await _get_account(account_id, current_user.id, db)
    await db.delete(account)
    await db.commit()


@router.post("/{account_id}/test")
async def test_account_connection(
    account_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    account = await _get_account(account_id, current_user.id, db)

    if account.account_type == "gmail_oauth":
        # For Gmail OAuth accounts, verify the token via a lightweight API call
        try:
            from app.services.gmail_service import get_valid_access_token
            import httpx
            token = await get_valid_access_token(account)
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    "https://gmail.googleapis.com/gmail/v1/users/me/profile",
                    headers={"Authorization": f"Bearer {token}"},
                )
            if resp.status_code == 200:
                return {"status": "ok", "email": resp.json().get("emailAddress")}
            raise HTTPException(status_code=400, detail="Gmail OAuth token is invalid or expired — reconnect via OAuth")
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Gmail connection test failed: {exc}")

    if account.account_type == "outlook_oauth":
        try:
            from app.services.encryption_service import encryption_service
            import httpx
            token = encryption_service.decrypt(account.oauth_access_token)
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    "https://graph.microsoft.com/v1.0/me/mailboxSettings",
                    headers={"Authorization": f"Bearer {token}"},
                )
            if resp.status_code == 200:
                return {"status": "ok"}
            raise HTTPException(status_code=400, detail="Outlook OAuth token is invalid or expired — reconnect via OAuth")
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Outlook connection test failed: {exc}")

    # IMAP/SMTP account
    ok = await test_imap_connection(account)
    if not ok:
        raise HTTPException(status_code=400, detail="Connection failed — check credentials and server settings")
    return {"status": "ok"}


@router.post("/{account_id}/sync")
async def sync_account(
    account_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    account = await _get_account(account_id, current_user.id, db)
    # Always run directly so the HTTP response only returns once emails are stored.
    # Celery Beat handles automatic background polling every 60 s independently.
    from app.workers.email_polling import _poll_account_by_id
    await _poll_account_by_id(account.id)
    return {"status": "synced"}


async def _get_account(account_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession) -> EmailAccount:
    result = await db.execute(select(EmailAccount).where(EmailAccount.id == account_id))
    account = result.scalar_one_or_none()
    if not account:
        raise not_found_exception
    if account.user_id != user_id:
        raise forbidden_exception
    return account
