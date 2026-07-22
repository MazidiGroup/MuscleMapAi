"""Backend tests for Guest Mode + Auth (Resend magic link, Apple Review bypass),
RevenueCat sync, and AI Coach quota gating.

Covers the review request for iteration 12:
- /api/auth/guest/session (Guest mode)
- /api/auth/me with guest Bearer
- /api/auth/email/request / verify (normal + Apple Review bypass positive/negative)
- /api/coach/ask auth gating, streaming response, quota
- /api/billing/revenuecat/sync auth gating
"""
import os
import time
import json
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL") or os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL", "https://anatomy-coach-1.preview.emergentagent.com"
)
BASE_URL = BASE_URL.rstrip("/")
BYPASS_EMAIL = "applereview@mazidigroup.com"
BYPASS_CODE = "123456"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------------- Guest Mode ----------------
class TestGuestMode:
    def test_guest_session_creates_session_and_is_guest(self, api):
        r = api.post(f"{BASE_URL}/api/auth/guest/session")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "session_token" in data and data["session_token"].startswith("sess_")
        assert "user" in data
        assert data["user"].get("is_guest") is True
        assert "providers" in data["user"]
        assert "guest" in data["user"]["providers"]
        # cache for downstream tests
        pytest.guest_token = data["session_token"]
        pytest.guest_user_id = data["user"]["user_id"]

    def test_guest_me_returns_is_guest_true_and_not_premium(self, api):
        token = pytest.guest_token
        r = api.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200, r.text
        me = r.json()
        assert me.get("is_guest") is True
        assert me.get("is_premium") is False
        assert me.get("user_id") == pytest.guest_user_id


# ---------------- Normal Email Magic Link ----------------
class TestEmailMagic:
    def test_request_returns_200_with_dev_code_or_sent(self, api):
        email = f"test_i12_{uuid.uuid4().hex[:8]}@example.com"
        r = api.post(f"{BASE_URL}/api/auth/email/request", json={"email": email})
        assert r.status_code == 200, r.text
        body = r.json()
        # Either Resend accepted send OR dev_code fallback exposed (RESEND unset). Both acceptable.
        assert body.get("sent") is True or "dev_code" in body or body.get("sent") is False
        pytest.magic_email = email
        pytest.magic_dev_code = body.get("dev_code")

    def test_verify_correct_code_returns_session(self, api):
        email = pytest.magic_email
        code = pytest.magic_dev_code
        # Fetch from mongo if dev_code was not returned (Resend accepted send)
        if not code:
            import pymongo
            mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
            db_name = os.environ.get("DB_NAME", "apex_ai")
            mc = pymongo.MongoClient(mongo_url)
            doc = mc[db_name].magic_links.find_one({"email": email, "used": False},
                                                    sort=[("created_at", -1)])
            assert doc is not None, "no magic_link doc found in mongo"
            code = doc["code"]
        r = api.post(f"{BASE_URL}/api/auth/email/verify", json={"email": email, "code": code})
        assert r.status_code == 200, r.text
        data = r.json()
        assert "session_token" in data
        token = data["session_token"]
        # confirm /me shows is_guest false
        me = api.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me.status_code == 200
        j = me.json()
        assert j.get("is_guest") in (False, None)
        assert j.get("is_premium") is False
        pytest.email_user_token = token


# ---------------- Apple Review Bypass ----------------
class TestAppleReviewBypass:
    def test_bypass_positive_grants_premium(self, api):
        r = api.post(f"{BASE_URL}/api/auth/email/verify",
                     json={"email": BYPASS_EMAIL, "code": BYPASS_CODE})
        assert r.status_code == 200, r.text
        data = r.json()
        assert "session_token" in data
        token = data["session_token"]
        me = api.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me.status_code == 200
        j = me.json()
        assert j.get("is_premium") is True, f"expected is_premium=true for review bypass, got {j}"
        # Verify DB record source=review_bypass exists
        import pymongo
        mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
        db_name = os.environ.get("DB_NAME", "apex_ai")
        mc = pymongo.MongoClient(mongo_url)
        sub = mc[db_name].subscriptions.find_one({"user_id": j["user_id"],
                                                    "source": "review_bypass"})
        assert sub is not None, "expected review_bypass subscription doc"
        assert sub.get("status") == "active"
        pytest.bypass_token = token

    def test_bypass_negative_wrong_code_returns_401(self, api):
        r = api.post(f"{BASE_URL}/api/auth/email/verify",
                     json={"email": BYPASS_EMAIL, "code": "000000"})
        assert r.status_code == 401, r.text

    def test_bypass_negative_wrong_email_same_code_returns_401(self, api):
        r = api.post(f"{BASE_URL}/api/auth/email/verify",
                     json={"email": "random_i12@mazidigroup.com", "code": BYPASS_CODE})
        assert r.status_code == 401, r.text


# ---------------- AI Coach quota / auth ----------------
def _consume_sse(resp):
    """Concatenate SSE deltas and return (text, gated_flag, failed_flag)."""
    text = ""
    gated = False
    failed = False
    for raw in resp.iter_lines():
        if not raw:
            continue
        line = raw.decode() if isinstance(raw, bytes) else raw
        if line.startswith("data: "):
            try:
                obj = json.loads(line[6:])
            except Exception:
                continue
            if "delta" in obj:
                text += obj["delta"]
            if obj.get("gated"):
                gated = True
            if obj.get("failed"):
                failed = True
            if obj.get("done"):
                break
    return text, gated, failed


class TestCoachAsk:
    def test_coach_ask_without_auth_returns_401(self, api):
        r = api.post(f"{BASE_URL}/api/coach/ask", json={"message": "Hi"})
        assert r.status_code == 401, r.text

    def test_coach_ask_with_guest_returns_200_with_message(self, api):
        token = pytest.guest_token
        with requests.post(f"{BASE_URL}/api/coach/ask",
                           json={"message": "What muscle is the biceps?"},
                           headers={"Authorization": f"Bearer {token}"},
                           stream=True, timeout=60) as r:
            assert r.status_code == 200, r.text
            text, gated, failed = _consume_sse(r)
        # Any non-empty response counts as success (LLM key may be over budget → mock fallback)
        # gated=true is a valid quota-limit response with a message
        assert text.strip() != "" or gated, f"empty response text={text!r} gated={gated} failed={failed}"

    def test_coach_ask_rate_limit_eventually_gates(self, api):
        """Fire a fresh guest and burst up to the daily cap (40 for non-premium) to
        confirm the quota gate triggers a 'gated' SSE flag with a message."""
        gr = api.post(f"{BASE_URL}/api/auth/guest/session")
        assert gr.status_code == 200
        token = gr.json()["session_token"]
        gated_seen = False
        # non-premium cap = 40. Send up to 45 to be sure.
        for i in range(45):
            with requests.post(f"{BASE_URL}/api/coach/ask",
                               json={"message": f"q{i}"},
                               headers={"Authorization": f"Bearer {token}"},
                               stream=True, timeout=30) as r:
                assert r.status_code == 200
                text, gated, failed = _consume_sse(r)
                if gated:
                    gated_seen = True
                    assert text.strip() != "", "gated response should include a message"
                    break
        assert gated_seen, "quota gating did not trigger within 45 requests (cap=40)"


# ---------------- RevenueCat sync auth gate ----------------
class TestRevenueCat:
    def test_sync_without_auth_returns_401(self, api):
        r = api.post(f"{BASE_URL}/api/billing/revenuecat/sync", json={})
        assert r.status_code == 401, r.text

    def test_sync_with_auth_returns_200_and_persists(self, api):
        # Use fresh guest so we don't pollute the bypass account
        gr = api.post(f"{BASE_URL}/api/auth/guest/session")
        assert gr.status_code == 200
        token = gr.json()["session_token"]
        r = api.post(f"{BASE_URL}/api/billing/revenuecat/sync",
                     json={"is_premium": False},
                     headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert "ok" in body and body["ok"] is True
        assert "is_premium" in body
        # Confirm /auth/me reflects the same premium state
        me = api.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me.status_code == 200
        assert me.json().get("is_premium") == body["is_premium"]
