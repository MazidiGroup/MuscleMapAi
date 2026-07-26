"""Unit tests for the Apple Sign-in token lifecycle (App Store Guideline 5.1.1(v)).

These tests never contact Apple. Every call to appleid.apple.com is replaced with a
local fake, so the suite is deterministic, offline and needs no Apple credentials.
The private key used here is generated in-process for the test only.

Covered contracts:
  * fail-closed configuration reporting (presence only, never values)
  * ES256 client-secret claims (iss/aud/sub/kid, Apple's 6-month cap)
  * refresh-token encryption at rest, and rejection of a wrong key
  * authorisation-code exchange: success, no code, not configured, Apple rejection,
    transport failure, response without a refresh token
  * revocation: revoked, already_invalid, bounded retry then temporary_failure,
    missing token, unconfigured
  * the honest "did we verify revocation?" rule that drives the user-facing guidance
  * no secret, token or code value appears in any returned value or log record
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import jwt as _jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import apple_tokens  # noqa: E402

BUNDLE_ID = "com.example.testapp"
SECRET_MARKER = "s3cret-refresh-token-value"
CODE_MARKER = "one-time-authorisation-code"

APPLE_VARS = (
    "APPLE_TEAM_ID",
    "APPLE_KEY_ID",
    "APPLE_PRIVATE_KEY",
    "APPLE_CLIENT_ID",
    "APPLE_TOKEN_ENC_KEY",
)


def _test_private_key_pem() -> str:
    key = ec.generate_private_key(ec.SECP256R1())
    return key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()


@pytest.fixture(autouse=True)
def clean_apple_env(monkeypatch):
    for name in APPLE_VARS:
        monkeypatch.delenv(name, raising=False)
    yield


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setenv("APPLE_TEAM_ID", "TEAM123456")
    monkeypatch.setenv("APPLE_KEY_ID", "KEYID12345")
    # Single-line form with escaped newlines: the shape most deployment platforms use.
    monkeypatch.setenv("APPLE_PRIVATE_KEY", _test_private_key_pem().replace("\n", "\\n"))
    monkeypatch.setenv("APPLE_TOKEN_ENC_KEY", "unit-test-encryption-key-value")
    return True


class FakeResponse:
    def __init__(self, status_code: int, payload: dict | None = None):
        self.status_code = status_code
        self._payload = payload or {}

    def json(self):
        return self._payload


class FakeClient:
    """Stands in for httpx.AsyncClient. Records the posted form for assertions."""

    calls: list[tuple[str, dict]] = []

    def __init__(self, responses, *, raise_transport=False):
        self._responses = list(responses)
        self._raise = raise_transport

    def __call__(self, *args, **kwargs):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def post(self, url, data=None):
        FakeClient.calls.append((url, dict(data or {})))
        if self._raise:
            raise RuntimeError("transport down")
        return self._responses.pop(0) if self._responses else FakeResponse(500)


def install_client(monkeypatch, responses=(), raise_transport=False):
    FakeClient.calls = []
    fake = FakeClient(responses, raise_transport=raise_transport)
    monkeypatch.setattr(apple_tokens.httpx, "AsyncClient", fake)
    return fake


# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #

def test_config_status_reports_presence_only_and_never_values(configured):
    status = apple_tokens.apple_config_status(BUNDLE_ID)
    assert status == {
        "team_id": True,
        "key_id": True,
        "private_key": True,
        "client_id": True,
        "encryption_key": True,
    }
    assert all(isinstance(v, bool) for v in status.values())


def test_unconfigured_fails_closed():
    assert apple_tokens.apple_token_flow_configured(BUNDLE_ID) is False
    status = apple_tokens.apple_config_status(BUNDLE_ID)
    assert status["team_id"] is False and status["private_key"] is False
    # The bundle id is the client-id fallback, so identity is still derivable.
    assert status["client_id"] is True


def test_encryption_key_is_not_required_for_the_token_flow(monkeypatch, configured):
    monkeypatch.delenv("APPLE_TOKEN_ENC_KEY")
    assert apple_tokens.apple_token_flow_configured(BUNDLE_ID) is True
    assert apple_tokens.token_encryption_available() is False


def test_explicit_client_id_overrides_the_bundle_id(monkeypatch, configured):
    monkeypatch.setenv("APPLE_CLIENT_ID", "com.example.service")
    assert apple_tokens.apple_client_id(BUNDLE_ID) == "com.example.service"


# --------------------------------------------------------------------------- #
# Client secret
# --------------------------------------------------------------------------- #

def test_client_secret_is_an_es256_jwt_with_apple_required_claims(configured):
    token = apple_tokens.build_client_secret(BUNDLE_ID, now=1_700_000_000)
    header = _jwt.get_unverified_header(token)
    assert header["alg"] == "ES256"
    assert header["kid"] == "KEYID12345"
    claims = _jwt.decode(token, options={"verify_signature": False}, audience="https://appleid.apple.com")
    assert claims["iss"] == "TEAM123456"
    assert claims["sub"] == BUNDLE_ID
    assert claims["aud"] == "https://appleid.apple.com"
    assert claims["iat"] == 1_700_000_000
    # Apple rejects a client secret valid for more than six months.
    assert claims["exp"] - claims["iat"] == 15777000


def test_client_secret_refuses_to_guess_missing_configuration():
    with pytest.raises(RuntimeError) as err:
        apple_tokens.build_client_secret(BUNDLE_ID)
    assert str(err.value) == "apple_token_flow_not_configured"


# --------------------------------------------------------------------------- #
# Encryption at rest
# --------------------------------------------------------------------------- #

def test_refresh_token_round_trips_through_encryption(configured):
    sealed = apple_tokens.encrypt_token(SECRET_MARKER)
    assert SECRET_MARKER not in sealed
    assert apple_tokens.decrypt_token(sealed) == SECRET_MARKER


def test_decryption_with_a_different_key_returns_none_instead_of_raising(monkeypatch, configured):
    sealed = apple_tokens.encrypt_token(SECRET_MARKER)
    monkeypatch.setenv("APPLE_TOKEN_ENC_KEY", "a-completely-different-key-value")
    assert apple_tokens.decrypt_token(sealed) is None


def test_decryption_without_a_key_returns_none(monkeypatch, configured):
    sealed = apple_tokens.encrypt_token(SECRET_MARKER)
    monkeypatch.delenv("APPLE_TOKEN_ENC_KEY")
    assert apple_tokens.decrypt_token(sealed) is None


def test_encryption_without_a_key_fails_closed(monkeypatch):
    with pytest.raises(RuntimeError):
        apple_tokens.encrypt_token(SECRET_MARKER)


# --------------------------------------------------------------------------- #
# Authorisation-code exchange
# --------------------------------------------------------------------------- #

@pytest.mark.asyncio
async def test_exchange_success_returns_refresh_token_and_subject(monkeypatch, configured):
    id_token = _jwt.encode({"sub": "000123.apple.subject"}, "unit-test-signing-key-not-verified-here", algorithm="HS256")
    install_client(
        monkeypatch,
        [FakeResponse(200, {"refresh_token": SECRET_MARKER, "id_token": id_token})],
    )
    result = await apple_tokens.exchange_authorization_code(CODE_MARKER, BUNDLE_ID)
    assert result["ok"] is True
    assert result["status"] == "exchanged"
    assert result["refresh_token"] == SECRET_MARKER
    assert result["sub"] == "000123.apple.subject"

    url, form = FakeClient.calls[0]
    assert url == apple_tokens.APPLE_TOKEN_URL
    assert form["grant_type"] == "authorization_code"
    assert form["client_id"] == BUNDLE_ID
    assert form["code"] == CODE_MARKER
    assert form["client_secret"]  # generated server-side, never supplied by the client


@pytest.mark.asyncio
async def test_exchange_without_a_code_makes_no_network_call(monkeypatch, configured):
    install_client(monkeypatch, [])
    result = await apple_tokens.exchange_authorization_code("   ", BUNDLE_ID)
    assert result == {"ok": False, "status": "no_code", "refresh_token": None, "sub": None}
    assert FakeClient.calls == []


@pytest.mark.asyncio
async def test_exchange_when_unconfigured_makes_no_network_call(monkeypatch):
    install_client(monkeypatch, [])
    result = await apple_tokens.exchange_authorization_code(CODE_MARKER, BUNDLE_ID)
    assert result["status"] == "not_configured"
    assert result["ok"] is False
    assert FakeClient.calls == []


@pytest.mark.asyncio
async def test_exchange_rejected_by_apple_is_reported_without_the_body(monkeypatch, configured, caplog):
    install_client(monkeypatch, [FakeResponse(400, {"error": "invalid_grant"})])
    with caplog.at_level("WARNING"):
        result = await apple_tokens.exchange_authorization_code(CODE_MARKER, BUNDLE_ID)
    assert result["status"] == "rejected"
    assert result["refresh_token"] is None
    logged = " ".join(r.getMessage() for r in caplog.records)
    assert "invalid_grant" not in logged
    assert CODE_MARKER not in logged


@pytest.mark.asyncio
async def test_exchange_transport_failure_is_a_temporary_failure(monkeypatch, configured):
    install_client(monkeypatch, [], raise_transport=True)
    result = await apple_tokens.exchange_authorization_code(CODE_MARKER, BUNDLE_ID)
    assert result["status"] == "temporary_failure"
    assert result["ok"] is False


@pytest.mark.asyncio
async def test_exchange_response_without_a_refresh_token_is_reported_explicitly(monkeypatch, configured):
    id_token = _jwt.encode({"sub": "000999.apple.subject"}, "unit-test-signing-key-not-verified-here", algorithm="HS256")
    install_client(monkeypatch, [FakeResponse(200, {"id_token": id_token})])
    result = await apple_tokens.exchange_authorization_code(CODE_MARKER, BUNDLE_ID)
    assert result["ok"] is False
    assert result["status"] == "no_refresh_token"
    # The subject is still surfaced so the caller can detect a mismatch.
    assert result["sub"] == "000999.apple.subject"


@pytest.mark.asyncio
async def test_exchange_tolerates_an_unreadable_id_token(monkeypatch, configured):
    install_client(monkeypatch, [FakeResponse(200, {"refresh_token": SECRET_MARKER, "id_token": "not-a-jwt"})])
    result = await apple_tokens.exchange_authorization_code(CODE_MARKER, BUNDLE_ID)
    assert result["ok"] is True
    assert result["sub"] is None


# --------------------------------------------------------------------------- #
# Revocation
# --------------------------------------------------------------------------- #

@pytest.mark.asyncio
async def test_revocation_success(monkeypatch, configured):
    install_client(monkeypatch, [FakeResponse(200)])
    assert await apple_tokens.revoke_refresh_token(SECRET_MARKER, BUNDLE_ID) == "revoked"
    url, form = FakeClient.calls[0]
    assert url == apple_tokens.APPLE_REVOKE_URL
    assert form["token_type_hint"] == "refresh_token"
    assert form["token"] == SECRET_MARKER
    assert len(FakeClient.calls) == 1  # no pointless retry after success


@pytest.mark.asyncio
async def test_revocation_of_an_unknown_token_is_treated_as_already_gone(monkeypatch, configured):
    install_client(monkeypatch, [FakeResponse(400, {"error": "invalid_grant"})])
    assert await apple_tokens.revoke_refresh_token(SECRET_MARKER, BUNDLE_ID) == "already_invalid"
    assert len(FakeClient.calls) == 1


@pytest.mark.asyncio
async def test_revocation_retries_are_bounded_then_report_temporary_failure(monkeypatch, configured):
    install_client(monkeypatch, [FakeResponse(503), FakeResponse(503), FakeResponse(503)])
    assert await apple_tokens.revoke_refresh_token(SECRET_MARKER, BUNDLE_ID) == "temporary_failure"
    assert len(FakeClient.calls) == apple_tokens.APPLE_ATTEMPTS == 2


@pytest.mark.asyncio
async def test_revocation_recovers_on_the_second_attempt(monkeypatch, configured):
    install_client(monkeypatch, [FakeResponse(503), FakeResponse(200)])
    assert await apple_tokens.revoke_refresh_token(SECRET_MARKER, BUNDLE_ID) == "revoked"
    assert len(FakeClient.calls) == 2


@pytest.mark.asyncio
async def test_revocation_transport_failure_never_raises(monkeypatch, configured):
    install_client(monkeypatch, [], raise_transport=True)
    assert await apple_tokens.revoke_refresh_token(SECRET_MARKER, BUNDLE_ID) == "temporary_failure"


@pytest.mark.asyncio
async def test_revocation_without_a_token_makes_no_network_call(monkeypatch, configured):
    install_client(monkeypatch, [])
    assert await apple_tokens.revoke_refresh_token("", BUNDLE_ID) == "no_token"
    assert FakeClient.calls == []


@pytest.mark.asyncio
async def test_revocation_when_unconfigured_makes_no_network_call(monkeypatch):
    install_client(monkeypatch, [])
    assert await apple_tokens.revoke_refresh_token(SECRET_MARKER, BUNDLE_ID) == "not_configured"
    assert FakeClient.calls == []


@pytest.mark.asyncio
async def test_no_token_value_is_ever_logged_on_failure(monkeypatch, configured, caplog):
    install_client(monkeypatch, [FakeResponse(503), FakeResponse(503)])
    with caplog.at_level("WARNING"):
        await apple_tokens.revoke_refresh_token(SECRET_MARKER, BUNDLE_ID)
    logged = " ".join(r.getMessage() for r in caplog.records)
    assert logged  # the failure IS reported
    assert SECRET_MARKER not in logged


# --------------------------------------------------------------------------- #
# Honest user-facing guidance
# --------------------------------------------------------------------------- #

def test_only_confirmed_outcomes_count_as_verified_revocation():
    assert apple_tokens.VERIFIED_REVOCATION_STATUSES == {"revoked", "already_invalid"}
    for status in ("revoked", "already_invalid"):
        assert apple_tokens.revocation_guidance_needed(status) is False
    for status in ("temporary_failure", "not_configured", "no_token", "subject_mismatch", ""):
        assert apple_tokens.revocation_guidance_needed(status) is True
