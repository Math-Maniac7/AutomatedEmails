import hashlib
import logging
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.config import settings

logger = logging.getLogger(__name__)


class EncryptionService:
    """AES-256-GCM authenticated encryption for sensitive credential storage."""

    def __init__(self, key: bytes):
        # key must be exactly 32 bytes (256-bit)
        if len(key) != 32:
            raise ValueError("Encryption key must be 32 bytes (256-bit)")
        self.aesgcm = AESGCM(key)

    def encrypt(self, plaintext: str) -> bytes:
        """Encrypt a string. Returns nonce (12 bytes) + ciphertext + auth tag."""
        nonce = os.urandom(12)  # 96-bit nonce, unique per encryption
        ct = self.aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
        return nonce + ct

    def decrypt(self, data: bytes) -> str:
        """Decrypt bytes produced by encrypt(). Raises on tampered data."""
        nonce, ct = data[:12], data[12:]
        return self.aesgcm.decrypt(nonce, ct, None).decode("utf-8")


class LazyEncryptionService:
    """Delay key validation until the service is actually used."""

    def __init__(self):
        self._service: EncryptionService | None = None

    def _resolve_key(self) -> bytes:
        if settings.encryption_key:
            return settings.encryption_key_bytes

        logger.warning(
            "ENCRYPTION_KEY is not set; deriving a development-only key from JWT_SECRET_KEY."
        )
        return hashlib.sha256(settings.jwt_secret_key.encode("utf-8")).digest()

    def _get_service(self) -> EncryptionService:
        if self._service is None:
            self._service = EncryptionService(self._resolve_key())
        return self._service

    def encrypt(self, plaintext: str) -> bytes:
        return self._get_service().encrypt(plaintext)

    def decrypt(self, data: bytes) -> str:
        return self._get_service().decrypt(data)


encryption_service = LazyEncryptionService()
