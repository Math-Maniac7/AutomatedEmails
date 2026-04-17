import aiosmtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.models.email_account import EmailAccount
from app.services.encryption_service import encryption_service


async def send_email(
    account: EmailAccount,
    to_addresses: list[str],
    subject: str,
    body_text: str,
    body_html: str | None = None,
    reply_to_message_id: str | None = None,
    in_reply_to: str | None = None,
) -> None:
    """Send an email via SMTP using the account's (decrypted) credentials."""
    password = encryption_service.decrypt(account.encrypted_password)

    msg = MIMEMultipart("alternative") if body_html else MIMEText(body_text, "plain")
    msg["From"] = account.email_address
    msg["To"] = ", ".join(to_addresses)
    msg["Subject"] = subject

    if in_reply_to:
        msg["In-Reply-To"] = in_reply_to
        msg["References"] = in_reply_to

    if body_html:
        msg.attach(MIMEText(body_text, "plain"))
        msg.attach(MIMEText(body_html, "html"))

    await aiosmtplib.send(
        msg,
        hostname=account.smtp_host,
        port=account.smtp_port,
        username=account.email_address,
        password=password,
        start_tls=account.smtp_use_tls,
    )
