import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.core.exceptions import forbidden_exception, not_found_exception
from app.database import get_db
from app.models.auto_reply_log import AutoReplyLog
from app.models.auto_reply_rule import AutoReplyRule
from app.models.email_message import EmailMessage
from app.models.user import User
from app.schemas.auto_reply_rule import (
    AutoReplyLogOut,
    AutoReplyRuleCreate,
    AutoReplyRuleOut,
    AutoReplyRuleUpdate,
    TestRuleRequest,
)
from app.services.auto_reply_service import _evaluate_trigger

router = APIRouter(prefix="/auto-replies", tags=["auto-replies"])


@router.get("", response_model=list[AutoReplyRuleOut])
async def list_rules(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AutoReplyRule)
        .where(AutoReplyRule.user_id == current_user.id)
        .order_by(AutoReplyRule.priority.asc())
    )
    return result.scalars().all()


@router.post("", response_model=AutoReplyRuleOut, status_code=status.HTTP_201_CREATED)
async def create_rule(
    body: AutoReplyRuleCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rule = AutoReplyRule(user_id=current_user.id, **body.model_dump())
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule


@router.get("/log", response_model=list[AutoReplyLogOut])
async def get_reply_log(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    offset = (page - 1) * page_size
    result = await db.execute(
        select(AutoReplyLog)
        .where(AutoReplyLog.user_id == current_user.id)
        .order_by(AutoReplyLog.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    return result.scalars().all()


@router.get("/{rule_id}", response_model=AutoReplyRuleOut)
async def get_rule(
    rule_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _get_rule(rule_id, current_user.id, db)


@router.put("/{rule_id}", response_model=AutoReplyRuleOut)
async def update_rule(
    rule_id: uuid.UUID,
    body: AutoReplyRuleUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rule = await _get_rule(rule_id, current_user.id, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(rule, field, value)
    await db.commit()
    await db.refresh(rule)
    return rule


@router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rule(
    rule_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rule = await _get_rule(rule_id, current_user.id, db)
    await db.delete(rule)
    await db.commit()


@router.patch("/{rule_id}/toggle", response_model=AutoReplyRuleOut)
async def toggle_rule(
    rule_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rule = await _get_rule(rule_id, current_user.id, db)
    rule.is_active = not rule.is_active
    await db.commit()
    await db.refresh(rule)
    return rule


@router.post("/test")
async def test_rule(
    body: TestRuleRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rule = await _get_rule(body.rule_id, current_user.id, db)

    # Build a fake EmailMessage for evaluation
    fake_message = EmailMessage(
        from_address=body.sample_from,
        from_name=body.sample_from_name,
        subject=body.sample_subject,
        body_text=body.sample_body,
        to_addresses=[],
    )

    matched = _evaluate_trigger(rule, fake_message)
    return {
        "matched": matched,
        "rule_name": rule.name,
        "trigger_type": rule.trigger_type,
        "action_type": rule.action_type,
    }


async def _get_rule(rule_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession) -> AutoReplyRule:
    result = await db.execute(select(AutoReplyRule).where(AutoReplyRule.id == rule_id))
    rule = result.scalar_one_or_none()
    if not rule:
        raise not_found_exception
    if rule.user_id != user_id:
        raise forbidden_exception
    return rule
