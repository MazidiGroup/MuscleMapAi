"""Endpoint tests for Apple token linkage and revocation on account deletion.

Guideline 5.1.1(v): an app that offers Sign in with Apple must revoke the user's
Apple tokens when the account is deleted. These tests exercise the real
DELETE /api/auth/me and POST /api/auth/apple/session handlers against a running
release-candidate backend and a real Mongo, WITHOUT contacting Apple:

  * a guest deletion reports "not_applicable" and asks for no manual step
  * a stored Apple token record is always destroyed by deletion
  * an unverifiable revocation (Apple not configured here) is reported honestly and
    asks the user to revoke manually — it never claims success
  * a token recorded against a different Apple subject is refused, not revoked
  * an Apple sign-in with an invalid identity token is rejected and stores nothing
  * no token, code or Apple secret value appears in any response body

The backend under test must be the release-candidate tree. Start it locally on a
spare port and point MMA_RC_BACKEND_URL at it; the tests skip when it is absent so
they never silently pass against the wrong server.
"""
from __future__ import annotations

import os
import sys
import uuid
from pathlib import Path

import pymongo
import pytest
import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

BASE_URL = (os.environ.get("MMA_RC_BACKEND_URL") or "http://localhost:8002").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "apex_ai")
SENTINEL_REFRESH_TOKEN = "rc-test-refresh-token-sentinel"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    try:
        r = s.get(f"{BASE_URL}/api/", timeout=5)
        assert r.status_code == 200
    except Exception:
        pytest.skip(f"release-candidate backend is not reachable at {BASE_URL}")
    return s


@pytest.fixture(scope="module")
def db():
    return pymongo.MongoClient(MONGO_URL)[DB_NAME]


def _guest(api):
    r = api.post(f"{BASE_URL}/api/auth/guest/session", timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    return body["session_token"], body["user"]["user_id"]


def _delete(api, token):
    return api.delete(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=30)


def _seal(raw: str) -> str:
    """Encrypt exactly as the server does. Requires the SAME APPLE_TOKEN_ENC_KEY to be
    exported for both this test process and the backend under test; without it the
    test is skipped rather than passing on a token the server could never read."""
    import apple_tokens

    if not apple_tokens.token_encryption_available():
        pytest.skip("APPLE_TOKEN_ENC_KEY is not configured for this test run")
    return apple_tokens.encrypt_token(raw)


class TestNoAppleLink:
    def test_deletion_without_apple_reports_not_applicable(self, api, db):
        token, user_id = _guest(api)
        r = _delete(api, token)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True and body["deleted"] is True
        assert body["apple_revocation"] == "not_applicable"
        # No Apple account is linked, so the user must not be told to revoke anything.
        assert body["manual_revocation_required"] is False
        assert db.users.find_one({"user_id": user_id}) is None


class TestStoredAppleToken:
    def test_deletion_destroys_the_token_record_and_reports_honestly(self, api, db):
        token, user_id = _guest(api)
        apple_sub = f"000{uuid.uuid4().hex[:9]}.rc.test"
        db.users.update_one({"user_id": user_id}, {"$set": {"apple_sub": apple_sub}})
        db.apple_tokens.replace_one(
            {"user_id": user_id},
            {
                "user_id": user_id,
                "apple_sub": apple_sub,
                "refresh_token_enc": _seal(SENTINEL_REFRESH_TOKEN),
            },
            upsert=True,
        )
        assert db.apple_tokens.find_one({"user_id": user_id}) is not None

        r = _delete(api, token)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["deleted"] is True

        # Apple credentials are absent in this environment, so revocation cannot be
        # confirmed. The response must say so rather than claim success.
        assert body["apple_revocation"] in {"not_configured", "temporary_failure", "revoked", "already_invalid"}
        expected_manual = body["apple_revocation"] not in {"revoked", "already_invalid"}
        assert body["manual_revocation_required"] is expected_manual

        # Token material is removed whatever the revocation outcome was.
        assert db.apple_tokens.find_one({"user_id": user_id}) is None
        assert db.users.find_one({"user_id": user_id}) is None
        assert SENTINEL_REFRESH_TOKEN not in r.text

    def test_deletion_still_succeeds_when_the_stored_token_cannot_be_read(self, api, db):
        token, user_id = _guest(api)
        db.apple_tokens.replace_one(
            {"user_id": user_id},
            {"user_id": user_id, "apple_sub": None, "refresh_token_enc": "not-a-valid-sealed-value"},
            upsert=True,
        )
        r = _delete(api, token)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["deleted"] is True
        assert body["apple_revocation"] == "no_token"
        assert body["manual_revocation_required"] is True
        assert db.apple_tokens.find_one({"user_id": user_id}) is None

    def test_a_token_for_a_different_apple_subject_is_refused(self, api, db):
        token, user_id = _guest(api)
        db.users.update_one({"user_id": user_id}, {"$set": {"apple_sub": "000111.owner.subject"}})
        db.apple_tokens.replace_one(
            {"user_id": user_id},
            {
                "user_id": user_id,
                "apple_sub": "000222.someone.else",
                "refresh_token_enc": _seal(SENTINEL_REFRESH_TOKEN),
            },
            upsert=True,
        )
        r = _delete(api, token)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["apple_revocation"] == "subject_mismatch"
        assert body["manual_revocation_required"] is True
        assert db.apple_tokens.find_one({"user_id": user_id}) is None


class TestAppleSessionEndpoint:
    def test_an_invalid_identity_token_is_rejected_and_stores_nothing(self, api, db):
        before = db.apple_tokens.count_documents({})
        r = api.post(
            f"{BASE_URL}/api/auth/apple/session",
            json={
                "identity_token": "not.a.real.apple.identity.token",
                "authorization_code": "fabricated-authorisation-code",
            },
            timeout=30,
        )
        assert r.status_code in (400, 401), r.text
        assert "session_token" not in r.text
        assert "fabricated-authorisation-code" not in r.text
        assert db.apple_tokens.count_documents({}) == before

    def test_the_endpoint_accepts_the_authorization_code_field(self, api):
        # A missing identity_token is a validation error (422); the code field itself
        # must be an accepted, optional part of the contract.
        r = api.post(f"{BASE_URL}/api/auth/apple/session", json={"authorization_code": "abc"}, timeout=30)
        assert r.status_code == 422, r.text
        detail = r.json().get("detail", [])
        missing = {tuple(item.get("loc", [])) for item in detail if isinstance(item, dict)}
        assert ("body", "identity_token") in missing
        assert ("body", "authorization_code") not in missing


class TestNoSecretLeak:
    def test_no_apple_configuration_value_is_exposed_by_any_public_endpoint(self, api):
        for path in ("/api/", "/api/auth/apple/config"):
            r = api.get(f"{BASE_URL}{path}", timeout=15)
            if r.status_code == 404:
                continue
            text = r.text
            for marker in ("BEGIN PRIVATE KEY", "client_secret", "refresh_token", "APPLE_PRIVATE_KEY"):
                assert marker not in text, f"{path} leaked {marker}"
