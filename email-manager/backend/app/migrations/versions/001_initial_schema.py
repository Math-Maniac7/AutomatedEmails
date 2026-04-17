"""Initial schema

Revision ID: 001
Revises:
Create Date: 2026-04-17

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Enable pg_trgm for full-text search
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("display_name", sa.String(255)),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean, default=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_users_email", "users", ["email"])

    op.create_table(
        "refresh_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(512), unique=True, nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked", sa.Boolean, default=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])
    op.create_index("ix_refresh_tokens_expires_at", "refresh_tokens", ["expires_at"])

    op.create_table(
        "templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("subject_line", sa.Text),
        sa.Column("body_html", sa.Text, nullable=False),
        sa.Column("body_text", sa.Text),
        sa.Column("variables", postgresql.JSONB, server_default="[]"),
        sa.Column("tags", postgresql.ARRAY(sa.String), server_default="{}"),
        sa.Column("use_count", sa.Integer, default=0),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_templates_user_id", "templates", ["user_id"])

    op.create_table(
        "auto_reply_rules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("is_active", sa.Boolean, default=True),
        sa.Column("priority", sa.Integer, default=100),
        sa.Column("applies_to_account_ids", postgresql.ARRAY(sa.String), server_default="{}"),
        sa.Column("trigger_type", sa.String(50), nullable=False),
        sa.Column("keywords", postgresql.ARRAY(sa.String), server_default="{}"),
        sa.Column("keywords_match_mode", sa.String(10), default="any"),
        sa.Column("sender_filter", sa.String(512)),
        sa.Column("subject_filter", sa.Text),
        sa.Column("time_window_start", sa.String(8)),
        sa.Column("time_window_end", sa.String(8)),
        sa.Column("action_type", sa.String(30), nullable=False),
        sa.Column("template_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("templates.id", ondelete="SET NULL")),
        sa.Column("ai_instructions", sa.Text),
        sa.Column("max_replies_per_sender_per_day", sa.Integer, default=1),
        sa.Column("cooldown_hours", sa.Integer, default=24),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_auto_reply_rules_user_id", "auto_reply_rules", ["user_id"])
    op.create_index("ix_auto_reply_rules_active", "auto_reply_rules", ["is_active", "priority"])

    op.create_table(
        "email_accounts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("account_type", sa.String(20), nullable=False),
        sa.Column("display_name", sa.String(255)),
        sa.Column("email_address", sa.String(255), nullable=False),
        sa.Column("color_label", sa.String(7), default="#6366f1"),
        sa.Column("imap_host", sa.String(255)),
        sa.Column("imap_port", sa.Integer, default=993),
        sa.Column("imap_use_ssl", sa.Boolean, default=True),
        sa.Column("smtp_host", sa.String(255)),
        sa.Column("smtp_port", sa.Integer, default=587),
        sa.Column("smtp_use_tls", sa.Boolean, default=True),
        sa.Column("encrypted_password", sa.LargeBinary),
        sa.Column("oauth_access_token", sa.LargeBinary),
        sa.Column("oauth_refresh_token", sa.LargeBinary),
        sa.Column("oauth_token_expiry", sa.DateTime(timezone=True)),
        sa.Column("oauth_scope", sa.Text),
        sa.Column("last_polled_at", sa.DateTime(timezone=True)),
        sa.Column("last_uid_seen", sa.BigInteger, default=0),
        sa.Column("is_active", sa.Boolean, default=True),
        sa.Column("poll_interval_secs", sa.Integer, default=300),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "email_address", name="uq_user_email_address"),
    )
    op.create_index("ix_email_accounts_user_id", "email_accounts", ["user_id"])
    op.create_index("ix_email_accounts_last_polled_at", "email_accounts", ["last_polled_at"])

    op.create_table(
        "email_threads",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email_account_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("email_accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("thread_subject", sa.Text),
        sa.Column("participant_emails", postgresql.ARRAY(sa.String), server_default="{}"),
        sa.Column("last_message_at", sa.DateTime(timezone=True)),
        sa.Column("message_count", sa.Integer, default=0),
        sa.Column("is_read", sa.Boolean, default=False),
        sa.Column("is_starred", sa.Boolean, default=False),
        sa.Column("is_archived", sa.Boolean, default=False),
        sa.Column("labels", postgresql.ARRAY(sa.String), server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_email_threads_account_id", "email_threads", ["email_account_id"])
    op.create_index("ix_email_threads_last_message_at", "email_threads", ["last_message_at"])

    op.create_table(
        "email_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("thread_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("email_threads.id", ondelete="CASCADE"), nullable=False),
        sa.Column("email_account_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("email_accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("message_id_header", sa.String(512), unique=True),
        sa.Column("imap_uid", sa.BigInteger),
        sa.Column("imap_folder", sa.String(255), default="INBOX"),
        sa.Column("from_address", sa.String(512), nullable=False),
        sa.Column("from_name", sa.String(255)),
        sa.Column("to_addresses", postgresql.JSONB, nullable=False),
        sa.Column("cc_addresses", postgresql.JSONB, server_default="[]"),
        sa.Column("bcc_addresses", postgresql.JSONB, server_default="[]"),
        sa.Column("reply_to", sa.String(512)),
        sa.Column("subject", sa.Text),
        sa.Column("body_text", sa.Text),
        sa.Column("body_html", sa.Text),
        sa.Column("snippet", sa.String(512)),
        sa.Column("sent_at", sa.DateTime(timezone=True)),
        sa.Column("received_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("is_read", sa.Boolean, default=False),
        sa.Column("is_sent", sa.Boolean, default=False),
        sa.Column("is_draft", sa.Boolean, default=False),
        sa.Column("has_attachments", sa.Boolean, default=False),
        sa.Column("auto_replied", sa.Boolean, default=False),
        sa.Column("auto_reply_rule_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("auto_reply_rules.id", ondelete="SET NULL")),
        sa.Column("auto_replied_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_email_messages_thread_id", "email_messages", ["thread_id"])
    op.create_index("ix_email_messages_account_id", "email_messages", ["email_account_id"])
    op.create_index("ix_email_messages_received_at", "email_messages", ["received_at"])
    op.create_index("ix_email_messages_message_id_header", "email_messages", ["message_id_header"])
    # Full-text search using pg_trgm
    op.execute(
        "CREATE INDEX idx_messages_subject_trgm ON email_messages USING gin(subject gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX idx_messages_body_trgm ON email_messages USING gin(body_text gin_trgm_ops)"
    )

    op.create_table(
        "email_attachments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("message_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("email_messages.id", ondelete="CASCADE"), nullable=False),
        sa.Column("filename", sa.String(512)),
        sa.Column("content_type", sa.String(255)),
        sa.Column("size_bytes", sa.BigInteger),
        sa.Column("storage_path", sa.String(1024)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_email_attachments_message_id", "email_attachments", ["message_id"])

    op.create_table(
        "auto_reply_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("rule_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("auto_reply_rules.id", ondelete="SET NULL")),
        sa.Column("message_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("email_messages.id", ondelete="SET NULL")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("email_account_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("email_accounts.id", ondelete="SET NULL")),
        sa.Column("recipient_email", sa.String(512)),
        sa.Column("template_used_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("templates.id", ondelete="SET NULL")),
        sa.Column("ai_model_used", sa.String(100)),
        sa.Column("ai_prompt_tokens", sa.Integer),
        sa.Column("ai_completion_tokens", sa.Integer),
        sa.Column("reply_body_preview", sa.String(512)),
        sa.Column("status", sa.String(20), default="sent"),
        sa.Column("error_message", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_auto_reply_log_user_id", "auto_reply_log", ["user_id"])
    op.create_index("ix_auto_reply_log_rule_id", "auto_reply_log", ["rule_id"])
    op.create_index("ix_auto_reply_log_created_at", "auto_reply_log", ["created_at"])


def downgrade() -> None:
    op.drop_table("auto_reply_log")
    op.drop_table("email_attachments")
    op.drop_table("email_messages")
    op.drop_table("email_threads")
    op.drop_table("email_accounts")
    op.drop_table("auto_reply_rules")
    op.drop_table("templates")
    op.drop_table("refresh_tokens")
    op.drop_table("users")
    op.execute("DROP EXTENSION IF EXISTS pg_trgm")
