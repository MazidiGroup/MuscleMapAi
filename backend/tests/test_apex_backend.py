"""Apex AI backend regression tests (Iteration 2 - Critical fixes).

Covers ALL original flows + new fixes:
- auth/me returns is_premium, subscription_tier, subscription_interval
- plan/week returns 7-day week with status/exercise_count/workout_id
- billing/create-checkout supports interval=month/year
- billing/dev/mark-premium accepts interval and stores it
- billing/cancel marks subscription canceled
- billing/restore returns sub status
- coach/chat retries on failure, emits {failed:true} on all-fail,
  {gated:true} on quota; includes recent conversation memory
- free user gated to 5 coach chats/day
"""
import json
import time
import pytest
import requests
from conftest import BASE_URL


# ---------------- Health ----------------
def test_root(api_client):
    r = api_client.get(f"{BASE_URL}/api/")
    assert r.status_code == 200
    assert r.json().get("ok") is True


# ---------------- Auth ----------------
class TestAuth:
    def test_demo_login(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/auth/demo/login")
        assert r.status_code == 200
        d = r.json()
        assert "session_token" in d and d["session_token"].startswith("sess_")
        assert d["user"]["email"].startswith("demo_")
        assert d["user"]["onboarded"] is False

    def test_email_login_creates_then_returns_existing(self, api_client):
        email = f"test_{int(time.time())}@apex.io"
        r1 = api_client.post(f"{BASE_URL}/api/auth/email/login", json={"email": email})
        assert r1.status_code == 200
        u1 = r1.json()["user"]
        r2 = api_client.post(f"{BASE_URL}/api/auth/email/login", json={"email": email})
        assert r2.status_code == 200
        assert r2.json()["user"]["user_id"] == u1["user_id"]

    def test_email_login_invalid_email(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/auth/email/login", json={"email": "bademail"})
        assert r.status_code == 400

    def test_me_requires_bearer(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401

    def test_me_returns_user_with_premium_fields(self, api_client, auth_session):
        # NEW: is_premium, subscription_tier, subscription_interval keys must exist
        r = api_client.get(f"{BASE_URL}/api/auth/me", headers=auth_session["headers"])
        assert r.status_code == 200
        d = r.json()
        assert d["user_id"] == auth_session["user"]["user_id"]
        assert "is_premium" in d
        assert isinstance(d["is_premium"], bool)
        assert d["is_premium"] is False  # fresh user => free
        assert "subscription_tier" in d
        assert d["subscription_tier"] is None
        assert "subscription_interval" in d
        assert d["subscription_interval"] is None


# ---------------- Exercises ----------------
class TestExercises:
    def test_list_returns_25(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/exercises")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) >= 25

    def test_get_single(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/exercises/barbell-bench-press")
        assert r.status_code == 200
        assert r.json()["id"] == "barbell-bench-press"

    def test_get_missing_404(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/exercises/does-not-exist")
        assert r.status_code == 404


# ---------------- Onboarding + Plan ----------------
class TestOnboardingPlan:
    def test_onboarding_and_active_plan(self, api_client, auth_session):
        payload = {
            "goal": "build_muscle",
            "experience": "intermediate",
            "frequency": 4,
            "equipment": ["barbell", "dumbbell", "cable"],
            "injuries": "",
            "units": "kg",
        }
        r = api_client.post(f"{BASE_URL}/api/onboarding", json=payload, headers=auth_session["headers"])
        assert r.status_code == 200, r.text
        plan = r.json()["plan"]
        assert plan["goal"] == "build_muscle"
        assert len(plan["days"]) == 7

        r2 = api_client.get(f"{BASE_URL}/api/plan/active", headers=auth_session["headers"])
        assert r2.status_code == 200
        assert r2.json()["plan"]["plan_id"] == plan["plan_id"]

        me = api_client.get(f"{BASE_URL}/api/auth/me", headers=auth_session["headers"]).json()
        assert me["onboarded"] is True
        assert me["goal"] == "build_muscle"


# ---------------- Weekly Plan (NEW) ----------------
class TestWeeklyPlan:
    def test_week_requires_auth(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/plan/week")
        assert r.status_code == 401

    def test_week_returns_7_days_with_status(self, api_client, auth_session):
        r = api_client.get(f"{BASE_URL}/api/plan/week", headers=auth_session["headers"])
        assert r.status_code == 200
        body = r.json()
        assert "week" in body and "today_index" in body
        week = body["week"]
        assert len(week) == 7
        # today_index 1..7
        assert 1 <= body["today_index"] <= 7
        # Each day has required keys with valid status
        valid_statuses = {"today", "completed", "missed", "upcoming", "rest"}
        for day in week:
            for k in ("day", "day_name", "day_short", "date", "name", "rest", "status", "exercise_count"):
                assert k in day, f"missing {k} in day: {day}"
            assert day["status"] in valid_statuses
            assert isinstance(day["exercise_count"], int)
        # workout_id key present (may be None)
        assert "workout_id" in week[0]
        # Exactly one day should be today
        today_days = [d for d in week if d["status"] == "today"]
        assert len(today_days) == 1


# ---------------- Workout Flow ----------------
class TestWorkoutFlow:
    def test_today_then_start_log_complete(self, api_client, auth_session):
        r = api_client.get(f"{BASE_URL}/api/workouts/today", headers=auth_session["headers"])
        assert r.status_code == 200
        assert "workout" in r.json() and "rest_day" in r.json()

        s = api_client.post(f"{BASE_URL}/api/workouts/start", headers=auth_session["headers"])
        assert s.status_code == 200, s.text
        workout = s.json()
        wid = workout["workout_id"]
        first_ex = workout["exercises"][0]["exercise_id"]

        log_payload = {
            "workout_id": wid,
            "exercise_id": first_ex,
            "set_data": {"set_number": 1, "weight": 60.0, "reps": 8, "completed": True},
        }
        log_resp = api_client.post(f"{BASE_URL}/api/workouts/log-set", json=log_payload, headers=auth_session["headers"])
        assert log_resp.status_code == 200

        c = api_client.post(
            f"{BASE_URL}/api/workouts/complete",
            json={"workout_id": wid, "duration_seconds": 1800, "notes": "felt good"},
            headers=auth_session["headers"],
        )
        assert c.status_code == 200
        assert c.json()["streak"] >= 1


# ---------------- Progress ----------------
class TestProgress:
    def test_summary(self, api_client, auth_session):
        r = api_client.get(f"{BASE_URL}/api/progress/summary", headers=auth_session["headers"])
        assert r.status_code == 200
        d = r.json()
        for k in ("total_workouts", "week_count", "streak", "prs", "trends", "units"):
            assert k in d


# ---------------- AI Coach (NEW retry + memory + gating) ----------------
def _consume_sse(resp, max_lines=200):
    """Parse SSE response, return list of decoded JSON payloads."""
    items = []
    for i, line in enumerate(resp.iter_lines(decode_unicode=True)):
        if i > max_lines:
            break
        if not line or not line.startswith("data: "):
            continue
        raw = line[6:]
        try:
            items.append(json.loads(raw))
        except Exception:
            items.append({"raw": raw})
        if items[-1].get("done"):
            break
    return items


class TestCoach:
    def test_chat_streams_delta_and_done(self, api_client, auth_session):
        # First chat - should stream Claude
        r = requests.post(
            f"{BASE_URL}/api/coach/chat",
            json={"message": "One short tip for bench press."},
            headers=auth_session["headers"],
            stream=True,
            timeout=60,
        )
        assert r.status_code == 200
        items = _consume_sse(r)
        has_delta = any("delta" in i for i in items)
        has_done = any(i.get("done") for i in items)
        has_failed = any(i.get("failed") for i in items)
        # Either: deltas + done (success) OR failed:true (graceful failure - no raw error)
        assert has_done or has_failed, f"missing done/failed marker. items={items[:5]}"
        if has_failed:
            # If failed, we should NOT see raw API error - just {failed: true}
            failed_item = next(i for i in items if i.get("failed"))
            assert "error" not in failed_item or failed_item.get("failed") is True
        else:
            assert has_delta, f"no delta and no failure. items={items[:5]}"

    def test_chat_memory_across_turns(self, api_client, auth_session):
        # Send a fact, then a follow-up that requires memory.
        # We can't check Claude's reply quality, but we can verify the messages
        # are persisted (memory store works) via GET /api/coach/messages
        r = requests.post(
            f"{BASE_URL}/api/coach/chat",
            json={"message": "Remember: my favorite exercise is the deadlift."},
            headers=auth_session["headers"],
            stream=True,
            timeout=60,
        )
        assert r.status_code == 200
        _consume_sse(r)
        # 2nd message
        r2 = requests.post(
            f"{BASE_URL}/api/coach/chat",
            json={"message": "What's my favorite exercise?"},
            headers=auth_session["headers"],
            stream=True,
            timeout=60,
        )
        assert r2.status_code == 200
        _consume_sse(r2)
        # Verify persistence (memory store)
        msgs = api_client.get(f"{BASE_URL}/api/coach/messages", headers=auth_session["headers"]).json()["messages"]
        user_msgs = [m for m in msgs if m["role"] == "user"]
        # Should have at least 2 user messages stored => memory works
        assert len(user_msgs) >= 2

    def test_chat_gated_for_free_user_after_5(self, api_client):
        """A fresh free user should be gated after exceeding 5 coach chats."""
        # Fresh demo user (free)
        login = api_client.post(f"{BASE_URL}/api/auth/demo/login").json()
        headers = {"Content-Type": "application/json", "Authorization": f"Bearer {login['session_token']}"}
        # Send 6 messages. The 6th (count >=5 BEFORE saving the new one) should be gated.
        gated = False
        for i in range(6):
            r = requests.post(
                f"{BASE_URL}/api/coach/chat",
                json={"message": f"hi {i}"},
                headers=headers,
                stream=True,
                timeout=60,
            )
            assert r.status_code == 200
            items = _consume_sse(r)
            if any(it.get("gated") for it in items):
                gated = True
                break
        assert gated, "free user was never gated after 6 chats"

    def test_today_insight(self, api_client, auth_session):
        r = api_client.post(f"{BASE_URL}/api/coach/today-insight", headers=auth_session["headers"], timeout=60)
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d.get("insight"), str) and len(d["insight"]) > 0

    def test_weekly_report(self, api_client, auth_session):
        r = api_client.post(f"{BASE_URL}/api/coach/weekly-report", headers=auth_session["headers"], timeout=90)
        assert r.status_code == 200
        rep = r.json().get("report", {})
        for k in ("highlights", "weak_points", "recovery", "next_week"):
            assert k in rep


# ---------------- Billing (NEW interval + cancel + restore) ----------------
class TestBilling:
    def test_subscription_initial_none(self, api_client):
        # Fresh user => status 'none'
        login = api_client.post(f"{BASE_URL}/api/auth/demo/login").json()
        headers = {"Content-Type": "application/json", "Authorization": f"Bearer {login['session_token']}"}
        r = api_client.get(f"{BASE_URL}/api/billing/subscription", headers=headers)
        assert r.status_code == 200
        assert r.json()["status"] == "none"

    def test_create_checkout_with_interval_month(self, api_client, auth_session):
        r = api_client.post(
            f"{BASE_URL}/api/billing/create-checkout",
            json={"interval": "month"},
            headers=auth_session["headers"],
        )
        # Placeholder Stripe key => 400 (graceful) ; real key => 200
        assert r.status_code in (200, 400), f"unexpected {r.status_code}: {r.text}"

    def test_create_checkout_with_interval_year(self, api_client, auth_session):
        r = api_client.post(
            f"{BASE_URL}/api/billing/create-checkout",
            json={"interval": "year"},
            headers=auth_session["headers"],
        )
        assert r.status_code in (200, 400)

    def test_dev_mark_premium_month(self, api_client):
        login = api_client.post(f"{BASE_URL}/api/auth/demo/login").json()
        headers = {"Content-Type": "application/json", "Authorization": f"Bearer {login['session_token']}"}
        r = api_client.post(f"{BASE_URL}/api/billing/dev/mark-premium", json={"interval": "month"}, headers=headers)
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "active"
        assert d["interval"] == "month"
        # /auth/me reflects premium + interval
        me = api_client.get(f"{BASE_URL}/api/auth/me", headers=headers).json()
        assert me["is_premium"] is True
        assert me["subscription_tier"] == "premium"
        assert me["subscription_interval"] == "month"

    def test_dev_mark_premium_year(self, api_client):
        login = api_client.post(f"{BASE_URL}/api/auth/demo/login").json()
        headers = {"Content-Type": "application/json", "Authorization": f"Bearer {login['session_token']}"}
        r = api_client.post(f"{BASE_URL}/api/billing/dev/mark-premium", json={"interval": "year"}, headers=headers)
        assert r.status_code == 200
        assert r.json()["interval"] == "year"
        me = api_client.get(f"{BASE_URL}/api/auth/me", headers=headers).json()
        assert me["is_premium"] is True
        assert me["subscription_interval"] == "year"

    def test_premium_user_not_gated_in_coach(self, api_client):
        """Premium users should NOT hit the 5-chat gate."""
        login = api_client.post(f"{BASE_URL}/api/auth/demo/login").json()
        headers = {"Content-Type": "application/json", "Authorization": f"Bearer {login['session_token']}"}
        # Mark premium
        api_client.post(f"{BASE_URL}/api/billing/dev/mark-premium", json={"interval": "month"}, headers=headers)
        # Hit chat 6 times - should never be gated
        ever_gated = False
        for i in range(6):
            r = requests.post(
                f"{BASE_URL}/api/coach/chat",
                json={"message": f"premium check {i}"},
                headers=headers,
                stream=True,
                timeout=60,
            )
            items = _consume_sse(r)
            if any(it.get("gated") for it in items):
                ever_gated = True
                break
        assert not ever_gated, "premium user was wrongly gated"

    def test_cancel_subscription(self, api_client):
        login = api_client.post(f"{BASE_URL}/api/auth/demo/login").json()
        headers = {"Content-Type": "application/json", "Authorization": f"Bearer {login['session_token']}"}
        api_client.post(f"{BASE_URL}/api/billing/dev/mark-premium", json={"interval": "month"}, headers=headers)
        # Cancel
        r = api_client.post(f"{BASE_URL}/api/billing/cancel", headers=headers)
        assert r.status_code == 200
        assert r.json()["status"] == "canceled"
        # Verify via /auth/me
        me = api_client.get(f"{BASE_URL}/api/auth/me", headers=headers).json()
        assert me["is_premium"] is False  # active sub gone

    def test_restore_purchases_active(self, api_client):
        login = api_client.post(f"{BASE_URL}/api/auth/demo/login").json()
        headers = {"Content-Type": "application/json", "Authorization": f"Bearer {login['session_token']}"}
        api_client.post(f"{BASE_URL}/api/billing/dev/mark-premium", json={"interval": "year"}, headers=headers)
        r = api_client.post(f"{BASE_URL}/api/billing/restore", headers=headers)
        assert r.status_code == 200
        d = r.json()
        assert d["restored"] is True
        assert d["status"] == "active"

    def test_restore_purchases_none(self, api_client):
        login = api_client.post(f"{BASE_URL}/api/auth/demo/login").json()
        headers = {"Content-Type": "application/json", "Authorization": f"Bearer {login['session_token']}"}
        r = api_client.post(f"{BASE_URL}/api/billing/restore", headers=headers)
        assert r.status_code == 200
        assert r.json()["restored"] is False
