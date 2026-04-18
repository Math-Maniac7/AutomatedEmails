import base64
import os
from pydantic_settings import BaseSettings, SettingsConfigDict

# Always find .env relative to this file regardless of working directory
_ENV_FILE = os.path.join(os.path.dirname(__file__), "..", ".env")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_ENV_FILE, extra="ignore")

    # Database
    database_url: str = "postgresql+asyncpg://postgres:password@localhost:5432/email_manager"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # JWT
    jwt_secret_key: str = "change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 30

    # Encryption (base64url-encoded 32-byte key)
    encryption_key: str = ""

    @property
    def encryption_key_bytes(self) -> bytes:
        return base64.urlsafe_b64decode(self.encryption_key + "==")

    # AI
    anthropic_api_key: str = ""

    # Gmail OAuth
    gmail_client_id: str = ""
    gmail_client_secret: str = ""
    gmail_redirect_uri: str = "http://localhost:8000/oauth/gmail/callback"

    # Outlook OAuth
    outlook_client_id: str = ""
    outlook_client_secret: str = ""
    outlook_redirect_uri: str = "http://localhost:8000/oauth/outlook/callback"

    # CORS
    frontend_origin: str = "http://localhost:5173"


settings = Settings()
