"""OAuth token management for Gmail and Outlook accounts."""
from datetime import datetime, timedelta, timezone

import httpx

from app.config import settings
from app.models.email_account import EmailAccount
from app.services.encryption_service import encryption_service

GMAIL_TOKEN_URL = "https://oauth2.googleapis.com/token"
OUTLOOK_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token"


async def refresh_gmail_token(account: EmailAccount) -> str:
    """Refresh and re-encrypt the Gmail access token. Returns the new plaintext access token."""
    refresh_token = encryption_service.decrypt(account.oauth_refresh_token)

    async with httpx.AsyncClient() as client:
        resp = await client.post(GMAIL_TOKEN_URL, data={
            "client_id": settings.gmail_client_id,
            "client_secret": settings.gmail_client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        })
        resp.raise_for_status()
        data = resp.json()

    account.oauth_access_token = encryption_service.encrypt(data["access_token"])
    account.oauth_token_expiry = datetime.now(timezone.utc) + timedelta(seconds=data.get("expires_in", 3600))
    return data["access_token"]


async def refresh_outlook_token(account: EmailAccount) -> str:
    """Refresh and re-encrypt the Outlook access token. Returns the new plaintext access token."""
    refresh_token = encryption_service.decrypt(account.oauth_refresh_token)

    async with httpx.AsyncClient() as client:
        resp = await client.post(OUTLOOK_TOKEN_URL, data={
            "client_id": settings.outlook_client_id,
            "client_secret": settings.outlook_client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
            "scope": "https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.Send offline_access",
        })
        resp.raise_for_status()
        data = resp.json()

    account.oauth_access_token = encryption_service.encrypt(data["access_token"])
    if "refresh_token" in data:
        account.oauth_refresh_token = encryption_service.encrypt(data["refresh_token"])
    account.oauth_token_expiry = datetime.now(timezone.utc) + timedelta(seconds=data.get("expires_in", 3600))
    return data["access_token"]


async def get_valid_access_token(account: EmailAccount) -> str:
    """Return a valid (non-expired) access token, refreshing if necessary."""
    if account.oauth_token_expiry and account.oauth_token_expiry > datetime.now(timezone.utc) + timedelta(minutes=5):
        return encryption_service.decrypt(account.oauth_access_token)

    if account.account_type == "gmail_oauth":
        return await refresh_gmail_token(account)
    elif account.account_type == "outlook_oauth":
        return await refresh_outlook_token(account)
    else:
        raise ValueError(f"Unknown OAuth account type: {account.account_type}")
