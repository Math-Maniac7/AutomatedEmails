import uuid
from datetime import datetime, timezone
from time import time as _time

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, Time
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AutoReplyRule(Base):
    __tablename__ = "auto_reply_rules"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    priority: Mapped[int] = mapped_column(Integer, default=100)

    # Scope: which accounts does this rule apply to? (empty = all accounts)
    applies_to_account_ids: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)

    # Trigger conditions
    trigger_type: Mapped[str] = mapped_column(String(50), nullable=False)
    # keyword | sender_domain | sender_email | subject_contains | any_email | ai_classified

    keywords: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    keywords_match_mode: Mapped[str] = mapped_column(String(10), default="any")  # any | all
    sender_filter: Mapped[str | None] = mapped_column(String(512))
    subject_filter: Mapped[str | None] = mapped_column(Text)
    time_window_start: Mapped[str | None] = mapped_column(String(8))  # "HH:MM:SS"
    time_window_end: Mapped[str | None] = mapped_column(String(8))

    # Action
    action_type: Mapped[str] = mapped_column(String(30), nullable=False)
    # use_template | ai_select_template | ai_generate

    template_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("templates.id", ondelete="SET NULL"))
    ai_instructions: Mapped[str | None] = mapped_column(Text)

    # Rate limiting
    max_replies_per_sender_per_day: Mapped[int] = mapped_column(Integer, default=1)
    cooldown_hours: Mapped[int] = mapped_column(Integer, default=24)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    user: Mapped["User"] = relationship("User", back_populates="auto_reply_rules")  # noqa: F821
    template: Mapped["Template"] = relationship("Template")  # noqa: F821
