"""Backend tests for Apple 5.1.1(v) account deletion — DELETE /api/auth/me.

Iteration 13 scope:
- DELETE /api/auth/me without Authorization -> 401
- DELETE /api/auth/me with a valid guest Bearer -> 200 {ok:true, deleted:true}
- After DELETE, the same token on GET /api/auth/me -> 401 (session revoked)
- After DELETE, Mongo docs for that user_id are gone across every collection
  (users, user_sessions, subscriptions, coach_messages, coach_ask_usage, workouts,
  workout_sessions, workout_logs, status_checks) and magic_links for that email
- DELETE works identically for a normal (email-verified) user
- DELETE works for the Apple Review bypass account and cleans up its
  review_bypass subscription doc
"""
import json
import os
import uuid

import pymongo
import pytest
import requests

BASE_URL = (os.environ.get("EXPO_BACKEND_URL") or
            "https://batch5-features.preview.emergentagent.com").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "apex_ai")
BYPASS_EMAIL = "applereview@mazidigroup.com"
BYPASS_CODE = "123456"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def db():
    mc = pymongo.MongoClient(MONGO_URL)
    return mc[DB_NAME]


def _new_guest(api):
    r = api.post(f"{BASE_URL}/api/auth/guest/session")
    assert r.status_code == 200, r.text
    data = r.json()
    return data["session_token"], data["user"]["user_id"]


def _verify_email_code(api, db, email):
    """Request magic code + verify. Returns (token, user_id)."""
    r = api.post(f"{BASE_URL}/api/auth/email/request", json={"email": email})
    assert r.status_code == 200, r.text
    body = r.json()
    code = body.get("dev_code")
    if not code:
        # Resend accepted — read from mongo
        doc = db.magic_links.find_one({"email": email, "used": False},
                                      sort=[("created_at", -1)])
        assert doc is not None, "no magic_link doc"
        code = doc["code"]
    r2 = api.post(f"{BASE_URL}/api/auth/email/verify",
                  json={"email": email, "code": code})
    assert r2.status_code == 200, r2.text
    j = r2.json()
    return j["session_token"], j["user"]["user_id"]


class TestDeleteAuthNegative:
    def test_delete_without_auth_returns_401(self, api):
        r = api.delete(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401, r.text

    def test_delete_with_bogus_token_returns_401(self, api):
        r = api.delete(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": "Bearer sess_deadbeef_not_a_real_session"},
        )
        assert r.status_code == 401, r.text


class TestDeleteGuestAccount:
    def test_delete_guest_returns_ok_true(self, api, db):
        token, user_id = _new_guest(api)

        # Seed one workout doc + one coach_ask_usage doc for this user so we can
        # confirm cascade cleanup covers ancillary collections.
        db.workouts.insert_one({
            "workout_id": f"wkt_test_{uuid.uuid4().hex[:8]}",
            "user_id": user_id,
            "name": "TEST_workout",
            "completed": False,
            "exercises": [],
        })
        db.coach_ask_usage.insert_one({
            "user_id": user_id,
            "date": "2026-01-01",
            "count": 3,
        })

        r = api.delete(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body.get("deleted") is True

        # Same token must now be invalid
        me = api.get(f"{BASE_URL}/api/auth/me",
                     headers={"Authorization": f"Bearer {token}"})
        assert me.status_code == 401, me.text

        # Mongo cleanup across every collection referenced in server.py:245-254
        assert db.users.find_one({"user_id": user_id}) is None
        assert db.user_sessions.find_one({"user_id": user_id}) is None
        assert db.subscriptions.find_one({"user_id": user_id}) is None
        assert db.coach_messages.find_one({"user_id": user_id}) is None
        assert db.coach_ask_usage.find_one({"user_id": user_id}) is None
        assert db.workouts.find_one({"user_id": user_id}) is None
        assert db.workout_sessions.find_one({"user_id": user_id}) is None
        assert db.workout_logs.find_one({"user_id": user_id}) is None
        assert db.status_checks.find_one({"user_id": user_id}) is None


class TestDeleteEmailVerifiedAccount:
    def test_delete_normal_email_user(self, api, db):
        email = f"test_i13_del_{uuid.uuid4().hex[:8]}@example.com"
        token, user_id = _verify_email_code(api, db, email)
        # sanity — user exists before deletion
        assert db.users.find_one({"user_id": user_id}) is not None

        r = api.delete(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body.get("deleted") is True
        # Apple is not linked for an email account: no manual step must be asked for.
        assert body.get("apple_revocation") == "not_applicable"
        assert body.get("manual_revocation_required") is False

        # Session revoked
        me = api.get(f"{BASE_URL}/api/auth/me",
                     headers={"Authorization": f"Bearer {token}"})
        assert me.status_code == 401

        # User + session + email magic-links removed
        assert db.users.find_one({"user_id": user_id}) is None
        assert db.user_sessions.find_one({"user_id": user_id}) is None
        assert db.magic_links.find_one({"email": email}) is None


class TestDeleteReviewBypassAccount:
    def test_delete_bypass_user_removes_review_subscription(self, api, db):
        # Login the reviewer account fresh — this recreates the user and the
        # review_bypass subscription.
        r = api.post(
            f"{BASE_URL}/api/auth/email/verify",
            json={"email": BYPASS_EMAIL, "code": BYPASS_CODE},
        )
        assert r.status_code == 200, r.text
        j = r.json()
        token = j["session_token"]
        user_id = j["user"]["user_id"]

        # Sanity: bypass sub exists
        assert db.subscriptions.find_one({
            "user_id": user_id, "source": "review_bypass"
        }) is not None

        # DELETE
        d = api.delete(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert d.status_code == 200, d.text
        d_body = d.json()
        assert d_body.get("ok") is True and d_body.get("deleted") is True
        assert d_body.get("apple_revocation") == "not_applicable"
        assert d_body.get("manual_revocation_required") is False

        # Session revoked
        me = api.get(f"{BASE_URL}/api/auth/me",
                     headers={"Authorization": f"Bearer {token}"})
        assert me.status_code == 401

        # Full cleanup — including the review_bypass subscription
        assert db.users.find_one({"user_id": user_id}) is None
        assert db.user_sessions.find_one({"user_id": user_id}) is None
        assert db.subscriptions.find_one({
            "user_id": user_id, "source": "review_bypass"
        }) is None
        assert db.magic_links.find_one({"email": BYPASS_EMAIL}) is None

    def test_bypass_login_still_works_after_deletion(self, api, db):
        """Reviewer must be able to sign back in after account deletion (Apple 5.1.1(v)
        does NOT require the account be permanently blocked)."""
        r = api.post(
            f"{BASE_URL}/api/auth/email/verify",
            json={"email": BYPASS_EMAIL, "code": BYPASS_CODE},
        )
        assert r.status_code == 200, r.text
        j = r.json()
        # Recreated fresh
        me = api.get(f"{BASE_URL}/api/auth/me",
                     headers={"Authorization": f"Bearer {j['session_token']}"})
        assert me.status_code == 200
        assert me.json().get("is_premium") is True
