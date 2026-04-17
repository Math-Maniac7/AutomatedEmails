import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr


class ImapAccountCreate(BaseModel):
    email_address: EmailStr
    display_name: str | None = None
    color_label: str = "#6366f1"
    imap_host: str
    imap_port: int = 993
    imap_use_ssl: bool = True
    smtp_host: str
    smtp_port: int = 587
    smtp_use_tls: bool = True
    password: str  # plaintext — encrypted before storage


class EmailAccountUpdate(BaseModel):
    display_name: str | None = None
    color_label: str | None = None
    imap_host: str | None = None
    imap_port: int | None = None
    imap_use_ssl: bool | None = None
    smtp_host: str | None = None
    smtp_port: int | None = None
    smtp_use_tls: bool | None = None
    password: str | None = None
    is_active: bool | None = None
    poll_interval_secs: int | None = None


class EmailAccountOut(BaseModel):
    id: uuid.UUID
    account_type: str
    display_name: str | None
    email_address: str
    color_label: str
    imap_host: str | None
    imap_port: int
    smtp_host: str | None
    smtp_port: int
    is_active: bool
    last_polled_at: datetime | None
    poll_interval_secs: int
    created_at: datetime

    model_config = {"from_attributes": True}
