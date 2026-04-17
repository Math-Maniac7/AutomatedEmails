import uuid
from datetime import datetime, timezone

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class EmailAccount(Base):
    __tablename__ = "email_accounts"
    __table_args__ = (UniqueConstraint("user_id", "email_address", name="uq_user_email_address"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    account_type: Mapped[str] = mapped_column(String(20), nullable=False)  # imap_smtp | gmail_oauth | outlook_oauth
    display_name: Mapped[str | None] = mapped_column(String(255))
    email_address: Mapped[str] = mapped_column(String(255), nullable=False)
    color_label: Mapped[str] = mapped_column(String(7), default="#6366f1")

    # IMAP/SMTP fields (null for OAuth accounts)
    imap_host: Mapped[str | None] = mapped_column(String(255))
    imap_port: Mapped[int] = mapped_column(Integer, default=993)
    imap_use_ssl: Mapped[bool] = mapped_column(Boolean, default=True)
    smtp_host: Mapped[str | None] = mapped_column(String(255))
    smtp_port: Mapped[int] = mapped_column(Integer, default=587)
    smtp_use_tls: Mapped[bool] = mapped_column(Boolean, default=True)
    encrypted_password: Mapped[bytes | None] = mapped_column()  # AES-256-GCM ciphertext

    # OAuth fields (null for IMAP accounts)
    oauth_access_token: Mapped[bytes | None] = mapped_column()
    oauth_refresh_token: Mapped[bytes | None] = mapped_column()
    oauth_token_expiry: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    oauth_scope: Mapped[str | None] = mapped_column()

    # Polling state
    last_polled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    last_uid_seen: Mapped[int] = mapped_column(BigInteger, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    poll_interval_secs: Mapped[int] = mapped_column(Integer, default=300)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    user: Mapped["User"] = relationship("User", back_populates="email_accounts")  # noqa: F821
    threads: Mapped[list["EmailThread"]] = relationship("EmailThread", back_populates="email_account", cascade="all, delete-orphan")  # noqa: F821
    messages: Mapped[list["EmailMessage"]] = relationship("EmailMessage", back_populates="email_account", cascade="all, delete-orphan")  # noqa: F821
