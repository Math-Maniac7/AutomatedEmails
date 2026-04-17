"""OAuth 2.0 routes for Gmail and Outlook account connection."""
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.dependencies import get_current_user
from app.database import get_db
from app.models.email_account import EmailAccount
from app.models.user import User
from app.services.encryption_service import encryption_service

router = APIRouter(prefix="/oauth", tags=["oauth"])

# In production, replace with Redis-backed state store
_state_store: dict[str, dict] = {}

GMAIL_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GMAIL_TOKEN_URL = "https://oauth2.googleapis.com/token"
GMAIL_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"
GMAIL_SCOPE = "https://mail.google.com/ email profile"

OUTLOOK_AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
OUTLOOK_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
OUTLOOK_USERINFO_URL = "https://graph.microsoft.com/v1.0/me"
OUTLOOK_SCOPE = "https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.Send offline_access email profile"


def _require_oauth_config(provider: str, client_id: str, client_secret: str) -> None:
    if client_id and client_secret:
        return
    raise HTTPException(
        status_code=400,
        detail=f"{provider} OAuth is not configured on the server yet",
    )


# ── Gmail ──────────────────────────────────────────────────────────────────────

@router.get("/gmail/start")
async def gmail_start(current_user: User = Depends(get_current_user)):
    _require_oauth_config("Gmail", settings.gmail_client_id, settings.gmail_client_secret)
    state = secrets.token_urlsafe(32)
    _state_store[state] = {"user_id": str(current_user.id), "expires": datetime.now(timezone.utc) + timedelta(minutes=10)}

    params = urlencode({
        "client_id": settings.gmail_client_id,
        "redirect_uri": settings.gmail_redirect_uri,
        "response_type": "code",
        "scope": GMAIL_SCOPE,
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    })
    return RedirectResponse(f"{GMAIL_AUTH_URL}?{params}")


@router.get("/gmail/callback")
async def gmail_callback(code: str, state: str, db: AsyncSession = Depends(get_db)):
    _require_oauth_config("Gmail", settings.gmail_client_id, settings.gmail_client_secret)
    state_data = _validate_state(state)
    user_id = uuid.UUID(state_data["user_id"])

    async with httpx.AsyncClient() as client:
        token_resp = await client.post(GMAIL_TOKEN_URL, data={
            "code": code,
            "client_id": settings.gmail_client_id,
            "client_secret": settings.gmail_client_secret,
            "redirect_uri": settings.gmail_redirect_uri,
            "grant_type": "authorization_code",
        })
        token_resp.raise_for_status()
        tokens = token_resp.json()

        userinfo_resp = await client.get(
            GMAIL_USERINFO_URL,
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
        )
        userinfo_resp.raise_for_status()
        userinfo = userinfo_resp.json()

    email_address = userinfo["email"]
    await _upsert_oauth_account(db, user_id, "gmail_oauth", email_address, tokens)

    return RedirectResponse(f"{settings.frontend_origin}/settings/accounts?connected=gmail")


# ── Outlook ────────────────────────────────────────────────────────────────────

@router.get("/outlook/start")
async def outlook_start(current_user: User = Depends(get_current_user)):
    _require_oauth_config("Outlook", settings.outlook_client_id, settings.outlook_client_secret)
    state = secrets.token_urlsafe(32)
    _state_store[state] = {"user_id": str(current_user.id), "expires": datetime.now(timezone.utc) + timedelta(minutes=10)}

    params = urlencode({
        "client_id": settings.outlook_client_id,
        "redirect_uri": settings.outlook_redirect_uri,
        "response_type": "code",
        "scope": OUTLOOK_SCOPE,
        "state": state,
    })
    return RedirectResponse(f"{OUTLOOK_AUTH_URL}?{params}")


@router.get("/outlook/callback")
async def outlook_callback(code: str, state: str, db: AsyncSession = Depends(get_db)):
    _require_oauth_config("Outlook", settings.outlook_client_id, settings.outlook_client_secret)
    state_data = _validate_state(state)
    user_id = uuid.UUID(state_data["user_id"])

    async with httpx.AsyncClient() as client:
        token_resp = await client.post(OUTLOOK_TOKEN_URL, data={
            "code": code,
            "client_id": settings.outlook_client_id,
            "client_secret": settings.outlook_client_secret,
            "redirect_uri": settings.outlook_redirect_uri,
            "grant_type": "authorization_code",
            "scope": OUTLOOK_SCOPE,
        })
        token_resp.raise_for_status()
        tokens = token_resp.json()

        userinfo_resp = await client.get(
            OUTLOOK_USERINFO_URL,
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
        )
        userinfo_resp.raise_for_status()
        userinfo = userinfo_resp.json()

    email_address = userinfo.get("mail") or userinfo.get("userPrincipalName", "")
    await _upsert_oauth_account(db, user_id, "outlook_oauth", email_address, tokens)

    return RedirectResponse(f"{settings.frontend_origin}/settings/accounts?connected=outlook")


# ── Helpers ────────────────────────────────────────────────────────────────────

def _validate_state(state: str) -> dict:
    data = _state_store.pop(state, None)
    if not data:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")
    if data["expires"] < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="OAuth state expired")
    return data


async def _upsert_oauth_account(
    db: AsyncSession,
    user_id: uuid.UUID,
    account_type: str,
    email_address: str,
    tokens: dict,
) -> EmailAccount:
    result = await db.execute(
        select(EmailAccount).where(
            EmailAccount.user_id == user_id,
            EmailAccount.email_address == email_address,
        )
    )
    account = result.scalar_one_or_none()

    expiry = datetime.now(timezone.utc) + timedelta(seconds=tokens.get("expires_in", 3600))
    access_enc = encryption_service.encrypt(tokens["access_token"])
    refresh_enc = encryption_service.encrypt(tokens.get("refresh_token", "")) if tokens.get("refresh_token") else None

    if account:
        account.oauth_access_token = access_enc
        if refresh_enc:
            account.oauth_refresh_token = refresh_enc
        account.oauth_token_expiry = expiry
        account.is_active = True
    else:
        account = EmailAccount(
            user_id=user_id,
            account_type=account_type,
            email_address=email_address,
            display_name=email_address,
            oauth_access_token=access_enc,
            oauth_refresh_token=refresh_enc,
            oauth_token_expiry=expiry,
            oauth_scope=tokens.get("scope"),
        )
        db.add(account)

    await db.commit()
    await db.refresh(account)
    return account
