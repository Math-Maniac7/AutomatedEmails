import uuid
from datetime import datetime

from pydantic import BaseModel


class EmailAddressItem(BaseModel):
    email: str
    name: str = ""


class EmailMessageOut(BaseModel):
    id: uuid.UUID
    thread_id: uuid.UUID
    email_account_id: uuid.UUID
    from_address: str
    from_name: str | None
    to_addresses: list
    cc_addresses: list
    subject: str | None
    snippet: str | None
    received_at: datetime
    is_read: bool
    is_sent: bool
    has_attachments: bool
    auto_replied: bool

    model_config = {"from_attributes": True}


class EmailMessageDetail(EmailMessageOut):
    body_text: str | None
    body_html: str | None
    reply_to: str | None
    message_id_header: str | None


class ComposeEmail(BaseModel):
    account_id: uuid.UUID
    to_addresses: list[str]
    subject: str
    body_text: str
    body_html: str | None = None


class ReplyEmail(BaseModel):
    body_text: str
    body_html: str | None = None
