"""Auto-reply rule engine: match rules, check rate limits, generate and send replies."""
import logging
import re
from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.auto_reply_log import AutoReplyLog
from app.models.auto_reply_rule import AutoReplyRule
from app.models.email_account import EmailAccount
from app.models.email_message import EmailMessage
from app.models.template import Template
from app.routers.templates import substitute_variables
from app.services.ai_service import ai_service
from app.services.smtp_service import send_email

logger = logging.getLogger(__name__)


async def process_message_for_auto_reply(
    db: AsyncSession,
    message: EmailMessage,
    account: EmailAccount,
) -> None:
    """Main entry point: evaluate all rules against a new incoming message."""
    # Don't auto-reply to sent messages or already auto-replied messages
    if message.is_sent or message.auto_replied:
        return

    # Load active rules for this user, ordered by priority
    result = await db.execute(
        select(AutoReplyRule)
        .where(
            AutoReplyRule.user_id == account.user_id,
            AutoReplyRule.is_active == True,  # noqa: E712
        )
        .order_by(AutoReplyRule.priority.asc())
    )
    rules = result.scalars().all()

    matched_rule = None
    for rule in rules:
        if _rule_applies_to_account(rule, account.id) and _evaluate_trigger(rule, message):
            matched_rule = rule
            break

    if not matched_rule:
        return

    # Rate limit check
    if await _is_rate_limited(db, matched_rule, message.from_address, account.user_id):
        await _write_log(db, matched_rule, message, account, status="skipped")
        return

    # Generate and send reply
    try:
        reply_text, template_id, ai_model, prompt_tokens, completion_tokens = await _generate_reply(
            db, matched_rule, message
        )
        if not reply_text:
            return

        subject = f"Re: {message.subject}" if message.subject else "Re: (no subject)"
        await send_email(
            account=account,
            to_addresses=[message.from_address],
            subject=subject,
            body_text=reply_text,
            in_reply_to=message.message_id_header,
        )

        message.auto_replied = True
        message.auto_reply_rule_id = matched_rule.id
        message.auto_replied_at = datetime.now(timezone.utc)

        # Increment template use count
        if template_id:
            tpl_result = await db.execute(select(Template).where(Template.id == template_id))
            tpl = tpl_result.scalar_one_or_none()
            if tpl:
                tpl.use_count += 1

        await _write_log(
            db, matched_rule, message, account,
            status="sent",
            template_id=template_id,
            ai_model=ai_model,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            reply_preview=reply_text[:512],
        )

    except Exception as exc:
        logger.error("Auto-reply send failed: %s", exc)
        await _write_log(db, matched_rule, message, account, status="failed", error=str(exc))


def _rule_applies_to_account(rule: AutoReplyRule, account_id) -> bool:
    if not rule.applies_to_account_ids:
        return True
    return str(account_id) in rule.applies_to_account_ids


def _evaluate_trigger(rule: AutoReplyRule, message: EmailMessage) -> bool:
    t = rule.trigger_type

    if t == "any_email":
        return True

    if t == "sender_email":
        return rule.sender_filter and message.from_address.lower() == rule.sender_filter.lower()

    if t == "sender_domain":
        if not rule.sender_filter:
            return False
        domain = rule.sender_filter.lstrip("@").lower()
        return message.from_address.lower().endswith(f"@{domain}")

    if t == "subject_contains":
        if not rule.subject_filter or not message.subject:
            return False
        return rule.subject_filter.lower() in message.subject.lower()

    if t == "keyword":
        if not rule.keywords:
            return False
        haystack = f"{message.subject or ''} {message.body_text or ''}".lower()
        if rule.keywords_match_mode == "all":
            return all(kw.lower() in haystack for kw in rule.keywords)
        return any(kw.lower() in haystack for kw in rule.keywords)

    if t == "ai_classified":
        # AI classification is handled asynchronously in _generate_reply
        # Return True here; the AI will decide whether to respond in the action step
        return True

    return False


async def _is_rate_limited(db: AsyncSession, rule: AutoReplyRule, sender: str, user_id) -> bool:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=rule.cooldown_hours)
    result = await db.execute(
        select(func.count())
        .select_from(AutoReplyLog)
        .where(
            and_(
                AutoReplyLog.rule_id == rule.id,
                AutoReplyLog.recipient_email == sender,
                AutoReplyLog.status == "sent",
                AutoReplyLog.created_at >= cutoff,
            )
        )
    )
    recent_count = result.scalar_one()
    return recent_count >= rule.max_replies_per_sender_per_day


async def _generate_reply(
    db: AsyncSession,
    rule: AutoReplyRule,
    message: EmailMessage,
) -> tuple[str | None, object, str | None, int | None, int | None]:
    """Returns (reply_text, template_id_or_None, ai_model_or_None, prompt_tokens, completion_tokens)."""

    action = rule.action_type
    snippet = f"Subject: {message.subject or ''}\n\n{(message.body_text or '')[:1000]}"
    sender_name = message.from_name or message.from_address

    if action == "use_template":
        if not rule.template_id:
            return None, None, None, None, None
        tpl_result = await db.execute(select(Template).where(Template.id == rule.template_id))
        template = tpl_result.scalar_one_or_none()
        if not template:
            return None, None, None, None, None
        ctx = {
            "sender_name": sender_name,
            "original_subject": message.subject or "",
            "date": datetime.now(timezone.utc).strftime("%B %d, %Y"),
        }
        reply_text = substitute_variables(template.body_text or template.body_html, ctx)
        return reply_text, rule.template_id, None, None, None

    elif action == "ai_select_template":
        tpl_result = await db.execute(select(Template).where(Template.user_id == rule.user_id))
        templates = tpl_result.scalars().all()
        if not templates:
            return None, None, None, None, None

        template_dicts = [
            {"id": str(t.id), "name": t.name, "tags": t.tags, "description": t.description}
            for t in templates
        ]
        template_id_str, prompt_tokens, completion_tokens = ai_service.select_best_template(snippet, template_dicts)

        # Find the selected template
        selected = next((t for t in templates if str(t.id) == template_id_str), None)
        if not selected:
            return None, None, "claude-sonnet-4-6", prompt_tokens, completion_tokens

        ctx = {
            "sender_name": sender_name,
            "original_subject": message.subject or "",
            "date": datetime.now(timezone.utc).strftime("%B %d, %Y"),
        }
        reply_text = substitute_variables(selected.body_text or selected.body_html, ctx)
        return reply_text, selected.id, "claude-sonnet-4-6", prompt_tokens, completion_tokens

    elif action == "ai_generate":
        instructions = rule.ai_instructions or "Write a helpful and professional reply."
        reply_text, prompt_tokens, completion_tokens = ai_service.generate_reply(
            original_email=snippet,
            sender_name=sender_name,
            instructions=instructions,
        )
        return reply_text, None, "claude-sonnet-4-6", prompt_tokens, completion_tokens

    return None, None, None, None, None


async def _write_log(
    db: AsyncSession,
    rule: AutoReplyRule,
    message: EmailMessage,
    account: EmailAccount,
    status: str,
    template_id=None,
    ai_model: str | None = None,
    prompt_tokens: int | None = None,
    completion_tokens: int | None = None,
    reply_preview: str | None = None,
    error: str | None = None,
) -> None:
    log = AutoReplyLog(
        rule_id=rule.id,
        message_id=message.id,
        user_id=account.user_id,
        email_account_id=account.id,
        recipient_email=message.from_address,
        template_used_id=template_id,
        ai_model_used=ai_model,
        ai_prompt_tokens=prompt_tokens,
        ai_completion_tokens=completion_tokens,
        reply_body_preview=reply_preview,
        status=status,
        error_message=error,
    )
    db.add(log)
    await db.commit()
