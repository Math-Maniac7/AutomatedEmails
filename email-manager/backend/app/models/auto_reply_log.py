import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AutoReplyLog(Base):
    __tablename__ = "auto_reply_log"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rule_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("auto_reply_rules.id", ondelete="SET NULL"), index=True)
    message_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("email_messages.id", ondelete="SET NULL"))
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    email_account_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("email_accounts.id", ondelete="SET NULL"))

    recipient_email: Mapped[str | None] = mapped_column(String(512))
    template_used_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("templates.id", ondelete="SET NULL"))
    ai_model_used: Mapped[str | None] = mapped_column(String(100))
    ai_prompt_tokens: Mapped[int | None] = mapped_column(Integer)
    ai_completion_tokens: Mapped[int | None] = mapped_column(Integer)
    reply_body_preview: Mapped[str | None] = mapped_column(String(512))

    status: Mapped[str] = mapped_column(String(20), default="sent")  # sent | failed | skipped
    error_message: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)
