import uuid
from datetime import datetime

from pydantic import BaseModel


class AutoReplyRuleCreate(BaseModel):
    name: str
    description: str | None = None
    is_active: bool = True
    priority: int = 100
    applies_to_account_ids: list[str] = []
    trigger_type: str  # keyword | sender_domain | sender_email | subject_contains | any_email | ai_classified
    keywords: list[str] = []
    keywords_match_mode: str = "any"
    sender_filter: str | None = None
    subject_filter: str | None = None
    time_window_start: str | None = None
    time_window_end: str | None = None
    action_type: str  # use_template | ai_select_template | ai_generate
    template_id: uuid.UUID | None = None
    ai_instructions: str | None = None
    max_replies_per_sender_per_day: int = 1
    cooldown_hours: int = 24


class AutoReplyRuleUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    is_active: bool | None = None
    priority: int | None = None
    applies_to_account_ids: list[str] | None = None
    trigger_type: str | None = None
    keywords: list[str] | None = None
    keywords_match_mode: str | None = None
    sender_filter: str | None = None
    subject_filter: str | None = None
    action_type: str | None = None
    template_id: uuid.UUID | None = None
    ai_instructions: str | None = None
    max_replies_per_sender_per_day: int | None = None
    cooldown_hours: int | None = None


class AutoReplyRuleOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    is_active: bool
    priority: int
    trigger_type: str
    keywords: list[str]
    keywords_match_mode: str
    sender_filter: str | None
    subject_filter: str | None
    action_type: str
    template_id: uuid.UUID | None
    ai_instructions: str | None
    max_replies_per_sender_per_day: int
    cooldown_hours: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AutoReplyLogOut(BaseModel):
    id: uuid.UUID
    rule_id: uuid.UUID | None
    recipient_email: str | None
    template_used_id: uuid.UUID | None
    ai_model_used: str | None
    status: str
    error_message: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class TestRuleRequest(BaseModel):
    rule_id: uuid.UUID
    sample_subject: str = ""
    sample_body: str = ""
    sample_from: str = "test@example.com"
    sample_from_name: str = "Test Sender"
