"""
Auth flow tests — email magic link/code, RevenueCat sync, account linking, logout.
Backend under review: /app/backend/server.py
"""
import os
import uuid
import pytest
import requests
from pymongo import MongoClient
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://batch5-features.preview.emergentagent.com").rstrip("/")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

_mongo = MongoClient(MONGO_URL)
_db = _mongo[DB_NAME]


def _uniq_email() -> str:
    return f"TEST_auth_{uuid.uuid4().hex[:10]}@example.com"


# ---------- Email request ----------
class TestEmailRequest:
    def test_request_dev_mode_returns_code(self):
        email = _uniq_email()
        r = requests.post(f"{BASE_URL}/api/auth/email/request", json={"email": email}, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("sent") is False, f"expected dev mode (sent=False), got {data}"
        assert "dev_code" in data and len(data["dev_code"]) == 6

    def test_request_invalid_email_400(self):
        r = requests.post(f"{BASE_URL}/api/auth/email/request", json={"email": "not-an-email"}, timeout=20)
        assert r.status_code == 400

    def test_request_empty_email_400(self):
        r = requests.post(f"{BASE_URL}/api/auth/email/request", json={"email": ""}, timeout=20)
        assert r.status_code == 400


# ---------- Email verify ----------
class TestEmailVerify:
    def test_verify_returns_session_and_user(self):
        email = _uniq_email()
        r = requests.post(f"{BASE_URL}/api/auth/email/request", json={"email": email}, timeout=20)
        code = r.json()["dev_code"]

        v = requests.post(f"{BASE_URL}/api/auth/email/verify", json={"email": email, "code": code}, timeout=20)
        assert v.status_code == 200, v.text
        d = v.json()
        assert d["session_token"].startswith("sess_")
        assert d["user"]["email"] == email.lower()
        assert "user_id" in d["user"]

    def test_verify_wrong_code_401(self):
        email = _uniq_email()
        requests.post(f"{BASE_URL}/api/auth/email/request", json={"email": email}, timeout=20)
        v = requests.post(f"{BASE_URL}/api/auth/email/verify", json={"email": email, "code": "000000"}, timeout=20)
        assert v.status_code == 401

    def test_verify_reused_code_401(self):
        email = _uniq_email()
        r = requests.post(f"{BASE_URL}/api/auth/email/request", json={"email": email}, timeout=20)
        code = r.json()["dev_code"]
        v1 = requests.post(f"{BASE_URL}/api/auth/email/verify", json={"email": email, "code": code}, timeout=20)
        assert v1.status_code == 200
        v2 = requests.post(f"{BASE_URL}/api/auth/email/verify", json={"email": email, "code": code}, timeout=20)
        assert v2.status_code == 401


# ---------- /auth/me ----------
class TestAuthMe:
    @pytest.fixture(scope="class")
    def session(self):
        email = _uniq_email()
        r = requests.post(f"{BASE_URL}/api/auth/email/request", json={"email": email}, timeout=20)
        code = r.json()["dev_code"]
        v = requests.post(f"{BASE_URL}/api/auth/email/verify", json={"email": email, "code": code}, timeout=20)
        d = v.json()
        return {"token": d["session_token"], "email": email, "user_id": d["user"]["user_id"]}

    def test_me_with_valid_token(self, session):
        r = requests.get(f"{BASE_URL}/api/auth/me",
                         headers={"Authorization": f"Bearer {session['token']}"}, timeout=20)
        assert r.status_code == 200, r.text
        u = r.json()
        assert u["email"] == session["email"].lower()
        assert "is_premium" in u
        assert u["is_premium"] is False  # fresh user, no subscription

    def test_me_no_token_401(self):
        r = requests.get(f"{BASE_URL}/api/auth/me", timeout=20)
        assert r.status_code == 401

    def test_me_bad_token_401(self):
        r = requests.get(f"{BASE_URL}/api/auth/me",
                         headers={"Authorization": "Bearer sess_badbadbad"}, timeout=20)
        assert r.status_code == 401


# ---------- Magic link HTML ----------
class TestMagicLinkHtml:
    def test_magic_link_first_open_html_signed_in(self):
        email = _uniq_email()
        requests.post(f"{BASE_URL}/api/auth/email/request", json={"email": email}, timeout=20)
        # Grab the token from mongo
        ml = _db.magic_links.find_one({"email": email.lower(), "used": False})
        assert ml is not None, "magic link not found in DB"
        token = ml["token"]

        r = requests.get(f"{BASE_URL}/api/auth/magic/{token}", timeout=20, allow_redirects=False)
        assert r.status_code == 200
        assert "signed in" in r.text.lower() or "you're signed in" in r.text.lower()

        # Second use → 401 expired page
        r2 = requests.get(f"{BASE_URL}/api/auth/magic/{token}", timeout=20)
        assert r2.status_code == 401
        assert "expired" in r2.text.lower() or "invalid" in r2.text.lower()


# ---------- RevenueCat sync ----------
class TestRevenueCatSync:
    @pytest.fixture(scope="class")
    def session(self):
        email = _uniq_email()
        r = requests.post(f"{BASE_URL}/api/auth/email/request", json={"email": email}, timeout=20)
        code = r.json()["dev_code"]
        v = requests.post(f"{BASE_URL}/api/auth/email/verify", json={"email": email, "code": code}, timeout=20)
        return {"token": v.json()["session_token"], "email": email}

    def test_sync_premium_true_updates_me(self, session):
        h = {"Authorization": f"Bearer {session['token']}"}
        r = requests.post(f"{BASE_URL}/api/billing/revenuecat/sync",
                          json={"is_premium": True, "product_id": "test_monthly"},
                          headers=h, timeout=20)
        assert r.status_code == 200, r.text
        assert r.json()["is_premium"] is True

        me = requests.get(f"{BASE_URL}/api/auth/me", headers=h, timeout=20).json()
        assert me["is_premium"] is True

    def test_sync_premium_false_updates_me(self, session):
        h = {"Authorization": f"Bearer {session['token']}"}
        # First set true
        requests.post(f"{BASE_URL}/api/billing/revenuecat/sync",
                      json={"is_premium": True, "product_id": "x"}, headers=h, timeout=20)
        # Then false
        r = requests.post(f"{BASE_URL}/api/billing/revenuecat/sync",
                          json={"is_premium": False}, headers=h, timeout=20)
        assert r.status_code == 200
        assert r.json()["is_premium"] is False
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=h, timeout=20).json()
        assert me["is_premium"] is False

    def test_sync_no_auth_401(self):
        r = requests.post(f"{BASE_URL}/api/billing/revenuecat/sync",
                         json={"is_premium": True}, timeout=20)
        assert r.status_code == 401


# ---------- Account linking ----------
class TestAccountLinking:
    def test_same_email_returns_same_user_id(self):
        email = _uniq_email()
        # First login
        r = requests.post(f"{BASE_URL}/api/auth/email/request", json={"email": email}, timeout=20)
        v = requests.post(f"{BASE_URL}/api/auth/email/verify",
                          json={"email": email, "code": r.json()["dev_code"]}, timeout=20)
        uid_1 = v.json()["user"]["user_id"]

        # Second login (different code, same email)
        r2 = requests.post(f"{BASE_URL}/api/auth/email/request", json={"email": email}, timeout=20)
        v2 = requests.post(f"{BASE_URL}/api/auth/email/verify",
                           json={"email": email, "code": r2.json()["dev_code"]}, timeout=20)
        uid_2 = v2.json()["user"]["user_id"]

        assert uid_1 == uid_2, "same email must resolve to a single user_id"

        # Verify DB has exactly one user for this email
        cnt = _db.users.count_documents({"email": email.lower()})
        assert cnt == 1, f"expected 1 user, found {cnt}"


# ---------- Logout ----------
class TestLogout:
    def test_logout_invalidates_token(self):
        email = _uniq_email()
        r = requests.post(f"{BASE_URL}/api/auth/email/request", json={"email": email}, timeout=20)
        v = requests.post(f"{BASE_URL}/api/auth/email/verify",
                          json={"email": email, "code": r.json()["dev_code"]}, timeout=20)
        token = v.json()["session_token"]
        h = {"Authorization": f"Bearer {token}"}

        me = requests.get(f"{BASE_URL}/api/auth/me", headers=h, timeout=20)
        assert me.status_code == 200

        lo = requests.post(f"{BASE_URL}/api/auth/logout", headers=h, timeout=20)
        assert lo.status_code == 200

        me2 = requests.get(f"{BASE_URL}/api/auth/me", headers=h, timeout=20)
        assert me2.status_code == 401
