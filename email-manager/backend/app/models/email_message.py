import uuid
from datetime import datetime, timezone

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Index, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import String

from app.database import Base


class EmailMessage(Base):
    __tablename__ = "email_messages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    thread_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("email_threads.id", ondelete="CASCADE"), nullable=False, index=True)
    email_account_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("email_accounts.id", ondelete="CASCADE"), nullable=False, index=True)

    message_id_header: Mapped[str | None] = mapped_column(String(512), unique=True)
    imap_uid: Mapped[int | None] = mapped_column(BigInteger)
    imap_folder: Mapped[str] = mapped_column(String(255), default="INBOX")

    from_address: Mapped[str] = mapped_column(String(512), nullable=False)
    from_name: Mapped[str | None] = mapped_column(String(255))
    to_addresses: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    cc_addresses: Mapped[list] = mapped_column(JSONB, default=list)
    bcc_addresses: Mapped[list] = mapped_column(JSONB, default=list)
    reply_to: Mapped[str | None] = mapped_column(String(512))

    subject: Mapped[str | None] = mapped_column(Text)
    body_text: Mapped[str | None] = mapped_column(Text)
    body_html: Mapped[str | None] = mapped_column(Text)
    snippet: Mapped[str | None] = mapped_column(String(512))

    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    is_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    is_draft: Mapped[bool] = mapped_column(Boolean, default=False)
    has_attachments: Mapped[bool] = mapped_column(Boolean, default=False)

    auto_replied: Mapped[bool] = mapped_column(Boolean, default=False)
    auto_reply_rule_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("auto_reply_rules.id", ondelete="SET NULL"))
    auto_replied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    thread: Mapped["EmailThread"] = relationship("EmailThread", back_populates="messages")  # noqa: F821
    email_account: Mapped["EmailAccount"] = relationship("EmailAccount", back_populates="messages")  # noqa: F821
    attachments: Mapped[list["EmailAttachment"]] = relationship("EmailAttachment", back_populates="message", cascade="all, delete-orphan")  # noqa: F821

    __table_args__ = (
        Index(
            "idx_messages_fts",
            "subject",
            "body_text",
            postgresql_using="gin",
            postgresql_ops={"subject": "gin_trgm_ops", "body_text": "gin_trgm_ops"},
        ),
    )
