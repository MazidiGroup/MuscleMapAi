"""Apple Sign-in token lifecycle: client-secret creation, authorisation-code
exchange, encrypted refresh-token storage and revocation.

Apple requires apps offering Sign in with Apple to revoke the user's tokens when
the account is deleted (App Store Guideline 5.1.1(v)). That needs a refresh token,
which only comes from exchanging the one-time authorisation code at sign-in.

Security contract enforced here:
  * the Apple client secret is generated on the server only, never sent to the app;
  * refresh tokens are encrypted at rest with a separately managed server secret;
  * no token, code or secret value is ever logged, returned or raised in a message;
  * missing configuration fails closed and is reported as a status, never guessed.

Server-only configuration (no EXPO_PUBLIC_* variable is ever used for these):
  APPLE_TEAM_ID          Apple Developer team id
  APPLE_KEY_ID           key id of the Sign in with Apple private key
  APPLE_PRIVATE_KEY      contents of the .p8 private key (PEM; \\n escapes allowed)
  APPLE_CLIENT_ID        client id for the token endpoint (defaults to APPLE_BUNDLE_ID)
  APPLE_TOKEN_ENC_KEY    urlsafe base64 Fernet key used to encrypt refresh tokens
"""

from __future__ import annotations

import base64
import logging
import os
import time
from typing import Any, Dict, Optional

import httpx
import jwt as _jwt
from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)

APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token"
APPLE_REVOKE_URL = "https://appleid.apple.com/auth/revoke"

# Bounded best-effort: account deletion must never hang on Apple.
APPLE_HTTP_TIMEOUT = 8.0
APPLE_ATTEMPTS = 2


def _cfg(name: str) -> str:
    return (os.environ.get(name) or "").strip()


def apple_client_id(default_bundle_id: str) -> str:
    return _cfg("APPLE_CLIENT_ID") or default_bundle_id


def apple_config_status(default_bundle_id: str) -> Dict[str, bool]:
    """Presence-only view of the Apple server configuration. Never values."""
    return {
        "team_id": bool(_cfg("APPLE_TEAM_ID")),
        "key_id": bool(_cfg("APPLE_KEY_ID")),
        "private_key": bool(_cfg("APPLE_PRIVATE_KEY")),
        "client_id": bool(apple_client_id(default_bundle_id)),
        "encryption_key": bool(_cfg("APPLE_TOKEN_ENC_KEY")),
    }


def apple_token_flow_configured(default_bundle_id: str) -> bool:
    status = apple_config_status(default_bundle_id)
    return all(status[k] for k in ("team_id", "key_id", "private_key", "client_id"))


def _private_key_pem() -> str:
    # Deployment platforms commonly flatten newlines in a single-line variable.
    return _cfg("APPLE_PRIVATE_KEY").replace("\\n", "\n")


def build_client_secret(default_bundle_id: str, now: Optional[int] = None) -> str:
    """Apple client secret: an ES256 JWT signed with the .p8 key. Server-only."""
    if not apple_token_flow_configured(default_bundle_id):
        raise RuntimeError("apple_token_flow_not_configured")
    issued = int(now if now is not None else time.time())
    return _jwt.encode(
        {
            "iss": _cfg("APPLE_TEAM_ID"),
            "iat": issued,
            "exp": issued + 15777000,  # Apple's maximum: ~6 months
            "aud": "https://appleid.apple.com",
            "sub": apple_client_id(default_bundle_id),
        },
        _private_key_pem(),
        algorithm="ES256",
        headers={"kid": _cfg("APPLE_KEY_ID")},
    )


# --------------------------------------------------------------------------- #
# Encryption at rest
# --------------------------------------------------------------------------- #

def token_encryption_available() -> bool:
    return bool(_cfg("APPLE_TOKEN_ENC_KEY"))


def _fernet() -> Fernet:
    key = _cfg("APPLE_TOKEN_ENC_KEY")
    if not key:
        raise RuntimeError("apple_token_encryption_not_configured")
    # Accept a raw 32-byte secret as well as a ready Fernet key.
    try:
        return Fernet(key.encode())
    except Exception:
        digest = base64.urlsafe_b64encode(key.encode().ljust(32, b"0")[:32])
        return Fernet(digest)


def encrypt_token(raw: str) -> str:
    return _fernet().encrypt(raw.encode()).decode()


def decrypt_token(stored: str) -> Optional[str]:
    try:
        return _fernet().decrypt(stored.encode()).decode()
    except (InvalidToken, RuntimeError, Exception):
        return None


# --------------------------------------------------------------------------- #
# Apple endpoints
# --------------------------------------------------------------------------- #

async def exchange_authorization_code(code: str, default_bundle_id: str) -> Dict[str, Any]:
    """Exchange the one-time authorisation code for tokens.

    Returns {"ok": bool, "status": str, "refresh_token": str|None, "sub": str|None}.
    No token value is ever logged.
    """
    if not code or not code.strip():
        return {"ok": False, "status": "no_code", "refresh_token": None, "sub": None}
    if not apple_token_flow_configured(default_bundle_id):
        return {"ok": False, "status": "not_configured", "refresh_token": None, "sub": None}

    try:
        secret = build_client_secret(default_bundle_id)
    except Exception:
        return {"ok": False, "status": "not_configured", "refresh_token": None, "sub": None}

    data = {
        "client_id": apple_client_id(default_bundle_id),
        "client_secret": secret,
        "code": code.strip(),
        "grant_type": "authorization_code",
    }
    try:
        async with httpx.AsyncClient(timeout=APPLE_HTTP_TIMEOUT) as client:
            r = await client.post(APPLE_TOKEN_URL, data=data)
    except Exception:
        logger.warning("apple token exchange transport failure")
        return {"ok": False, "status": "temporary_failure", "refresh_token": None, "sub": None}

    if r.status_code != 200:
        # Apple returns {"error": "invalid_grant"} etc. Log the class, never the body.
        logger.warning("apple token exchange rejected: http %s", r.status_code)
        return {"ok": False, "status": "rejected", "refresh_token": None, "sub": None}

    body = r.json()
    refresh = body.get("refresh_token")
    sub = None
    id_token = body.get("id_token")
    if id_token:
        try:
            sub = _jwt.decode(id_token, options={"verify_signature": False}).get("sub")
        except Exception:
            sub = None
    if not refresh:
        return {"ok": False, "status": "no_refresh_token", "refresh_token": None, "sub": sub}
    return {"ok": True, "status": "exchanged", "refresh_token": refresh, "sub": sub}


async def revoke_refresh_token(refresh_token: str, default_bundle_id: str) -> str:
    """Bounded best-effort revocation. Returns a non-sensitive status string:
    revoked | already_invalid | temporary_failure | not_configured | no_token
    """
    if not refresh_token:
        return "no_token"
    if not apple_token_flow_configured(default_bundle_id):
        return "not_configured"
    try:
        secret = build_client_secret(default_bundle_id)
    except Exception:
        return "not_configured"

    data = {
        "client_id": apple_client_id(default_bundle_id),
        "client_secret": secret,
        "token": refresh_token,
        "token_type_hint": "refresh_token",
    }
    last = "temporary_failure"
    for _ in range(APPLE_ATTEMPTS):  # bounded: never an indefinite loop
        try:
            async with httpx.AsyncClient(timeout=APPLE_HTTP_TIMEOUT) as client:
                r = await client.post(APPLE_REVOKE_URL, data=data)
        except Exception:
            last = "temporary_failure"
            continue
        if r.status_code == 200:
            return "revoked"
        if r.status_code == 400:
            # Apple reports an unknown/expired token as invalid_grant: already gone.
            return "already_invalid"
        last = "temporary_failure"
    logger.warning("apple revocation not verified: %s", last)
    return last


# Statuses that honestly mean "we confirmed Apple access is gone".
VERIFIED_REVOCATION_STATUSES = {"revoked", "already_invalid"}


def revocation_guidance_needed(status: str) -> bool:
    """True when the user must be told to revoke access manually in iOS Settings."""
    return status not in VERIFIED_REVOCATION_STATUSES
