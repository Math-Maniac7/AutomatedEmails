import uuid
from datetime import datetime

from pydantic import BaseModel


class TemplateCreate(BaseModel):
    name: str
    description: str | None = None
    subject_line: str | None = None
    body_html: str
    body_text: str | None = None
    variables: list[dict] = []  # [{"key": "name", "default": "there"}]
    tags: list[str] = []


class TemplateUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    subject_line: str | None = None
    body_html: str | None = None
    body_text: str | None = None
    variables: list[dict] | None = None
    tags: list[str] | None = None


class TemplateOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    subject_line: str | None
    body_html: str
    body_text: str | None
    variables: list
    tags: list[str]
    use_count: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TemplatePreviewRequest(BaseModel):
    template_id: uuid.UUID
    variables: dict[str, str] = {}  # {"customer_name": "Alice"}
