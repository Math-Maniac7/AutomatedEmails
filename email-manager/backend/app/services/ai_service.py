"""Anthropic Claude API integration for template selection and reply generation."""
import anthropic
from fastapi import HTTPException

from app.config import settings


class AIService:
    def __init__(self):
        self.model = "claude-sonnet-4-6"
        self._client: anthropic.Anthropic | None = None

    def _get_client(self) -> anthropic.Anthropic:
        if self._client is not None:
            return self._client
        if not settings.anthropic_api_key:
            raise HTTPException(
                status_code=400,
                detail="ANTHROPIC_API_KEY is required for AI-powered auto replies",
            )
        self._client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        return self._client

    def select_best_template(self, email_snippet: str, templates: list[dict]) -> tuple[str, int, int]:
        """
        Pick the best-matching template UUID for the given email.
        Returns (template_id_str, prompt_tokens, completion_tokens).
        """
        template_list = "\n".join(
            f"ID: {t['id']} | Name: {t['name']} | Tags: {', '.join(t.get('tags', []))} | Description: {t.get('description', '')}"
            for t in templates
        )
        message = self._get_client().messages.create(
            model=self.model,
            max_tokens=50,
            messages=[{
                "role": "user",
                "content": (
                    f"Email received:\n{email_snippet}\n\n"
                    f"Available templates:\n{template_list}\n\n"
                    "Reply with ONLY the UUID of the best-matching template, nothing else."
                ),
            }],
        )
        template_id = message.content[0].text.strip()
        return template_id, message.usage.input_tokens, message.usage.output_tokens

    def generate_reply(
        self,
        original_email: str,
        sender_name: str,
        instructions: str,
    ) -> tuple[str, int, int]:
        """
        Generate a full reply for the given email.
        Returns (reply_body, prompt_tokens, completion_tokens).
        """
        message = self._get_client().messages.create(
            model=self.model,
            max_tokens=1024,
            system="You are a professional email assistant. Write concise, polite, and helpful email replies.",
            messages=[{
                "role": "user",
                "content": (
                    f"Instructions: {instructions}\n\n"
                    f"Original email from {sender_name}:\n{original_email}\n\n"
                    "Write only the reply body text, no subject line."
                ),
            }],
        )
        reply = message.content[0].text.strip()
        return reply, message.usage.input_tokens, message.usage.output_tokens

    def classify_email(self, email_snippet: str, categories: list[str]) -> str:
        """
        Classify an email into one of the provided categories.
        Returns the category name string.
        """
        categories_str = "\n".join(f"- {c}" for c in categories)
        message = self._get_client().messages.create(
            model=self.model,
            max_tokens=30,
            messages=[{
                "role": "user",
                "content": (
                    f"Classify this email into exactly one of these categories:\n{categories_str}\n\n"
                    f"Email:\n{email_snippet}\n\n"
                    "Reply with ONLY the category name, nothing else."
                ),
            }],
        )
        return message.content[0].text.strip()


ai_service = AIService()
