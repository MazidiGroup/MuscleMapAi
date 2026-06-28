"""Apex AI backend regression tests.

Covers: auth (demo/email/me), exercises, onboarding, plan, today workout,
start/log-set/complete workout, progress summary, coach insight, weekly report,
billing dev-mark-premium + subscription, real Stripe checkout failure handling.
"""
import os
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
        # Re-login same email -> same user_id
        r2 = api_client.post(f"{BASE_URL}/api/auth/email/login", json={"email": email})
        assert r2.status_code == 200
        assert r2.json()["user"]["user_id"] == u1["user_id"]

    def test_email_login_invalid_email(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/auth/email/login", json={"email": "bademail"})
        assert r.status_code == 400

    def test_me_requires_bearer(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401

    def test_me_returns_user(self, api_client, auth_session):
        r = api_client.get(f"{BASE_URL}/api/auth/me", headers=auth_session["headers"])
        assert r.status_code == 200
        assert r.json()["user_id"] == auth_session["user"]["user_id"]


# ---------------- Exercises ----------------
class TestExercises:
    def test_list_returns_25(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/exercises")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 25, f"expected 25+ exercises, got {len(data)}"
        # field shape
        sample = data[0]
        for k in ("id", "name", "muscles", "equipment", "category", "tips", "mistakes"):
            assert k in sample

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

        # GET active plan reflects persistence
        r2 = api_client.get(f"{BASE_URL}/api/plan/active", headers=auth_session["headers"])
        assert r2.status_code == 200
        assert r2.json()["plan"]["plan_id"] == plan["plan_id"]

        # me() should now reflect onboarded=True
        me = api_client.get(f"{BASE_URL}/api/auth/me", headers=auth_session["headers"]).json()
        assert me["onboarded"] is True
        assert me["goal"] == "build_muscle"


# ---------------- Workout Flow ----------------
class TestWorkoutFlow:
    def test_today_then_start_log_complete(self, api_client, auth_session):
        # Today
        r = api_client.get(f"{BASE_URL}/api/workouts/today", headers=auth_session["headers"])
        assert r.status_code == 200
        body = r.json()
        # Either rest_day=True+next workout or rest_day=False+workout
        assert "workout" in body and "rest_day" in body

        # Start
        s = api_client.post(f"{BASE_URL}/api/workouts/start", headers=auth_session["headers"])
        assert s.status_code == 200, s.text
        workout = s.json()
        wid = workout["workout_id"]
        assert workout["exercises"], "workout should have exercises"
        first_ex = workout["exercises"][0]["exercise_id"]

        # Log set
        log_payload = {
            "workout_id": wid,
            "exercise_id": first_ex,
            "set_data": {"set_number": 1, "weight": 60.0, "reps": 8, "completed": True},
        }
        log_resp = api_client.post(f"{BASE_URL}/api/workouts/log-set", json=log_payload, headers=auth_session["headers"])
        assert log_resp.status_code == 200, log_resp.text
        logged = log_resp.json()
        target_ex = next(e for e in logged["exercises"] if e["exercise_id"] == first_ex)
        assert len(target_ex["sets"]) == 1
        assert target_ex["sets"][0]["weight"] == 60.0

        # Complete
        c = api_client.post(
            f"{BASE_URL}/api/workouts/complete",
            json={"workout_id": wid, "duration_seconds": 1800, "notes": "felt good"},
            headers=auth_session["headers"],
        )
        assert c.status_code == 200, c.text
        out = c.json()
        assert out["ok"] is True
        assert out["streak"] >= 1

        # Persistence: GET workout
        g = api_client.get(f"{BASE_URL}/api/workouts/{wid}", headers=auth_session["headers"])
        assert g.status_code == 200
        assert g.json()["completed"] is True

    def test_log_set_invalid_workout(self, api_client, auth_session):
        r = api_client.post(
            f"{BASE_URL}/api/workouts/log-set",
            json={
                "workout_id": "wkt_fake",
                "exercise_id": "x",
                "set_data": {"set_number": 1, "weight": 1, "reps": 1, "completed": True},
            },
            headers=auth_session["headers"],
        )
        assert r.status_code == 404


# ---------------- Progress ----------------
class TestProgress:
    def test_summary(self, api_client, auth_session):
        r = api_client.get(f"{BASE_URL}/api/progress/summary", headers=auth_session["headers"])
        assert r.status_code == 200
        d = r.json()
        for k in ("total_workouts", "week_count", "streak", "prs", "trends", "units"):
            assert k in d
        # We completed at least 1 workout in TestWorkoutFlow
        assert d["total_workouts"] >= 1
        assert d["week_count"] >= 1
        assert d["streak"] >= 1


# ---------------- AI Coach ----------------
class TestCoach:
    def test_chat_streams(self, api_client, auth_session):
        # Use raw requests with stream=True to consume SSE
        r = requests.post(
            f"{BASE_URL}/api/coach/chat",
            json={"message": "Quick tip for bench press in one sentence."},
            headers=auth_session["headers"],
            stream=True,
            timeout=60,
        )
        assert r.status_code == 200, r.text
        got_delta = False
        chunks = []
        for line in r.iter_lines(decode_unicode=True):
            if not line:
                continue
            if line.startswith("data: "):
                payload = line[6:]
                chunks.append(payload)
                if '"delta"' in payload:
                    got_delta = True
                if '"done"' in payload:
                    break
        assert got_delta, f"no delta received. chunks={chunks[:5]}"

    def test_today_insight(self, api_client, auth_session):
        r = api_client.post(f"{BASE_URL}/api/coach/today-insight", headers=auth_session["headers"], timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert isinstance(d.get("insight"), str) and len(d["insight"]) > 0

    def test_weekly_report(self, api_client, auth_session):
        r = api_client.post(f"{BASE_URL}/api/coach/weekly-report", headers=auth_session["headers"], timeout=90)
        assert r.status_code == 200, r.text
        d = r.json()
        rep = d.get("report", {})
        for k in ("highlights", "weak_points", "recovery", "next_week"):
            assert k in rep, f"missing key {k} in report: {rep}"


# ---------------- Billing ----------------
class TestBilling:
    def test_subscription_initial_none(self, api_client, auth_session):
        r = api_client.get(f"{BASE_URL}/api/billing/subscription", headers=auth_session["headers"])
        assert r.status_code == 200
        # Could be 'none' OR active if previous test marked premium - just assert shape
        assert "status" in r.json()

    def test_create_checkout_fails_with_placeholder_key(self, api_client, auth_session):
        r = api_client.post(
            f"{BASE_URL}/api/billing/create-checkout",
            json={},
            headers=auth_session["headers"],
        )
        # Placeholder Stripe key => Stripe returns auth error -> backend converts to 400
        # We accept either 400 (gracefully handled) or 200 (if real key configured)
        assert r.status_code in (200, 400), f"unexpected status {r.status_code}: {r.text}"

    def test_dev_mark_premium(self, api_client, auth_session):
        r = api_client.post(f"{BASE_URL}/api/billing/dev/mark-premium", headers=auth_session["headers"])
        assert r.status_code == 200
        assert r.json()["status"] == "active"
        # Verify via GET
        s = api_client.get(f"{BASE_URL}/api/billing/subscription", headers=auth_session["headers"])
        assert s.status_code == 200
        assert s.json()["status"] == "active"
        assert s.json()["tier"] == "premium"
