"""
Apex AI - AI Gym Companion - Backend
FastAPI + MongoDB + Claude Sonnet 4.5 + Stripe + Emergent Google Auth
"""
from fastapi import FastAPI, APIRouter, HTTPException, Header, Request, Depends
from fastapi.responses import StreamingResponse, HTMLResponse, JSONResponse, FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import json
import uuid
import logging
import asyncio
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Literal, Dict, Any
from datetime import datetime, timezone, timedelta
import httpx
import stripe

from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# ------------------ Config ------------------
MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')
STRIPE_API_KEY = os.environ.get('STRIPE_API_KEY', 'sk_test_emergent')
PUBLIC_WEB_APP_URL = os.environ.get('PUBLIC_WEB_APP_URL', '')
APP_SCHEME = os.environ.get('APP_SCHEME', 'apexai')

stripe.api_key = STRIPE_API_KEY

CLAUDE_MODEL = "claude-sonnet-4-5-20250929"

# ------------------ DB ------------------
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# ------------------ App ------------------
app = FastAPI(title="Apex AI Backend")
api_router = APIRouter(prefix="/api")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("apex")


# ------------------ Models ------------------
class GoogleSessionRequest(BaseModel):
    session_token: str


class OnboardingPayload(BaseModel):
    goal: Literal['build_muscle', 'lose_fat', 'strength', 'general_fitness']
    experience: Literal['beginner', 'intermediate', 'advanced']
    frequency: int  # days per week
    equipment: List[str]
    injuries: Optional[str] = ''
    units: Literal['kg', 'lbs'] = 'kg'


class SetLog(BaseModel):
    set_number: int
    weight: float
    reps: int
    completed: bool = True
    rpe: Optional[int] = None


class LogSetRequest(BaseModel):
    workout_id: str
    exercise_id: str
    set_data: SetLog


class CompleteWorkoutRequest(BaseModel):
    workout_id: str
    duration_seconds: int
    notes: Optional[str] = ''


class ChatRequest(BaseModel):
    message: str


class CreateCheckoutRequest(BaseModel):
    success_url: Optional[str] = None
    cancel_url: Optional[str] = None
    interval: Literal['month', 'year'] = 'month'


# ------------------ Auth ------------------
async def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    token = authorization.replace("Bearer ", "").strip()
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")

    expires_at = session.get("expires_at")
    if expires_at:
        if isinstance(expires_at, datetime) and expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            raise HTTPException(status_code=401, detail="Session expired")

    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# ------------------ Auth Routes ------------------
@api_router.post("/auth/google/session")
async def create_google_session(payload: GoogleSessionRequest):
    """Exchange Emergent session_token for our app session."""
    try:
        async with httpx.AsyncClient(timeout=15.0) as http:
            r = await http.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": payload.session_token},
            )
        if r.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session token")
        data = r.json()
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Auth provider error: {e}")

    email = data.get("email")
    name = data.get("name", email or "User")
    picture = data.get("picture", "")
    session_token = data.get("session_token", payload.session_token)

    # Upsert user
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if user:
        user_id = user["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": name, "picture": picture, "last_login": datetime.now(timezone.utc)}},
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user = {
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "onboarded": False,
            "created_at": datetime.now(timezone.utc),
            "last_login": datetime.now(timezone.utc),
        }
        await db.users.insert_one(dict(user))

    # Store session
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.update_one(
        {"session_token": session_token},
        {"$set": {
            "session_token": session_token,
            "user_id": user_id,
            "expires_at": expires_at,
            "created_at": datetime.now(timezone.utc),
        }},
        upsert=True,
    )

    fresh = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    fresh["created_at"] = fresh["created_at"].isoformat() if isinstance(fresh.get("created_at"), datetime) else fresh.get("created_at")
    fresh["last_login"] = fresh["last_login"].isoformat() if isinstance(fresh.get("last_login"), datetime) else fresh.get("last_login")
    return {"session_token": session_token, "user": fresh}


@api_router.get("/auth/me")
async def me(user=Depends(get_current_user)):
    user["created_at"] = user["created_at"].isoformat() if isinstance(user.get("created_at"), datetime) else user.get("created_at")
    user["last_login"] = user["last_login"].isoformat() if isinstance(user.get("last_login"), datetime) else user.get("last_login")
    sub = await db.subscriptions.find_one({"user_id": user["user_id"], "status": "active"}, {"_id": 0})
    user["is_premium"] = sub is not None
    user["subscription_tier"] = sub.get("tier") if sub else None
    user["subscription_interval"] = sub.get("interval") if sub else None
    return user


@api_router.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.replace("Bearer ", "").strip()
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


class EmailLoginRequest(BaseModel):
    email: str
    name: Optional[str] = None


@api_router.post("/auth/email/login")
async def email_login(payload: EmailLoginRequest):
    """Passwordless email login (V1 sandbox flow). Creates or logs in user by email."""
    email = payload.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Valid email required")

    user = await db.users.find_one({"email": email}, {"_id": 0})
    if user:
        user_id = user["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"last_login": datetime.now(timezone.utc)}},
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": payload.name or email.split("@")[0].title(),
            "picture": "",
            "onboarded": False,
            "created_at": datetime.now(timezone.utc),
            "last_login": datetime.now(timezone.utc),
        })

    session_token = f"sess_{uuid.uuid4().hex}"
    await db.user_sessions.insert_one({
        "session_token": session_token,
        "user_id": user_id,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
        "created_at": datetime.now(timezone.utc),
    })
    fresh = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    fresh["created_at"] = fresh["created_at"].isoformat() if isinstance(fresh.get("created_at"), datetime) else fresh.get("created_at")
    fresh["last_login"] = fresh["last_login"].isoformat() if isinstance(fresh.get("last_login"), datetime) else fresh.get("last_login")
    return {"session_token": session_token, "user": fresh}


@api_router.post("/auth/demo/login")
async def demo_login():
    """Quick demo account for sandbox testing."""
    return await email_login(EmailLoginRequest(email=f"demo_{uuid.uuid4().hex[:6]}@apexai.app", name="Demo Athlete"))



# ------------------ Exercise Library (seeded) ------------------
EXERCISE_LIBRARY: List[Dict[str, Any]] = [
    {"id": "barbell-bench-press", "name": "Barbell Bench Press", "muscles": ["Chest", "Triceps", "Shoulders"], "equipment": "barbell", "category": "push",
     "tips": ["Retract scapula", "Bar path slightly diagonal", "Drive feet into floor"],
     "mistakes": ["Flaring elbows 90 degrees", "Bouncing off chest", "Lifting hips off bench"]},
    {"id": "incline-dumbbell-press", "name": "Incline Dumbbell Press", "muscles": ["Upper Chest", "Shoulders", "Triceps"], "equipment": "dumbbell", "category": "push",
     "tips": ["30-45 degree bench angle", "Press dumbbells together at top", "Control eccentric"],
     "mistakes": ["Bench too steep", "Locking out elbows aggressively"]},
    {"id": "overhead-press", "name": "Overhead Press", "muscles": ["Shoulders", "Triceps", "Core"], "equipment": "barbell", "category": "push",
     "tips": ["Squeeze glutes", "Bar over mid-foot", "Press head through"],
     "mistakes": ["Hyperextending lower back", "Pressing in front"]},
    {"id": "dumbbell-lateral-raise", "name": "Dumbbell Lateral Raise", "muscles": ["Side Delts"], "equipment": "dumbbell", "category": "push",
     "tips": ["Lead with elbows", "Slight forward lean", "Pause at top"],
     "mistakes": ["Swinging weight", "Going above shoulder level"]},
    {"id": "tricep-pushdown", "name": "Tricep Pushdown", "muscles": ["Triceps"], "equipment": "cable", "category": "push",
     "tips": ["Lock elbows at sides", "Full extension", "Squeeze at bottom"],
     "mistakes": ["Using shoulders", "Partial range"]},
    {"id": "pull-up", "name": "Pull-Up", "muscles": ["Lats", "Biceps", "Upper Back"], "equipment": "bodyweight", "category": "pull",
     "tips": ["Engage scapula first", "Chest up", "Control descent"],
     "mistakes": ["Kipping unnecessarily", "Partial range of motion"]},
    {"id": "barbell-row", "name": "Barbell Row", "muscles": ["Lats", "Mid Back", "Biceps"], "equipment": "barbell", "category": "pull",
     "tips": ["Hinge at hips", "Pull to lower chest", "Squeeze shoulder blades"],
     "mistakes": ["Standing too upright", "Using momentum"]},
    {"id": "lat-pulldown", "name": "Lat Pulldown", "muscles": ["Lats", "Biceps"], "equipment": "cable", "category": "pull",
     "tips": ["Lean back slightly", "Pull to upper chest", "Drive elbows down"],
     "mistakes": ["Pulling behind neck", "Using too much body english"]},
    {"id": "dumbbell-curl", "name": "Dumbbell Curl", "muscles": ["Biceps"], "equipment": "dumbbell", "category": "pull",
     "tips": ["Elbows pinned", "Full supination", "Slow eccentric"],
     "mistakes": ["Swinging", "Half reps"]},
    {"id": "face-pull", "name": "Face Pull", "muscles": ["Rear Delts", "Upper Back"], "equipment": "cable", "category": "pull",
     "tips": ["Pull to face level", "External rotation at end", "High elbows"],
     "mistakes": ["Pulling too heavy", "Letting elbows drop"]},
    {"id": "barbell-back-squat", "name": "Barbell Back Squat", "muscles": ["Quads", "Glutes", "Core"], "equipment": "barbell", "category": "legs",
     "tips": ["Brace core hard", "Knees track over toes", "Hit depth"],
     "mistakes": ["Knee cave", "Heel lift", "Rounding lower back"]},
    {"id": "romanian-deadlift", "name": "Romanian Deadlift", "muscles": ["Hamstrings", "Glutes", "Lower Back"], "equipment": "barbell", "category": "legs",
     "tips": ["Hinge from hips", "Slight knee bend", "Bar close to body"],
     "mistakes": ["Rounding back", "Squatting the lift"]},
    {"id": "leg-press", "name": "Leg Press", "muscles": ["Quads", "Glutes"], "equipment": "machine", "category": "legs",
     "tips": ["Feet shoulder width", "Full ROM safely", "Don't lock knees"],
     "mistakes": ["Lifting hips off seat", "Hyperextending knees"]},
    {"id": "walking-lunge", "name": "Walking Lunge", "muscles": ["Quads", "Glutes", "Hamstrings"], "equipment": "dumbbell", "category": "legs",
     "tips": ["Long stride", "Vertical torso", "Drive through front heel"],
     "mistakes": ["Stride too short", "Knee caving in"]},
    {"id": "leg-curl", "name": "Lying Leg Curl", "muscles": ["Hamstrings"], "equipment": "machine", "category": "legs",
     "tips": ["Full ROM", "Slow eccentric", "Pause at peak"],
     "mistakes": ["Lifting hips", "Bouncing reps"]},
    {"id": "calf-raise", "name": "Standing Calf Raise", "muscles": ["Calves"], "equipment": "machine", "category": "legs",
     "tips": ["Full stretch", "Pause at top", "Slow tempo"],
     "mistakes": ["Bouncing", "Partial range"]},
    {"id": "seated-calf-raise", "name": "Seated Calf Raise", "muscles": ["Calves"], "equipment": "machine", "category": "legs",
     "tips": ["Knees at 90°", "Full ROM", "Squeeze hard at top"],
     "mistakes": ["Half reps", "Using momentum"]},
    {"id": "single-leg-calf-raise", "name": "Single-Leg Calf Raise", "muscles": ["Calves"], "equipment": "bodyweight", "category": "legs",
     "tips": ["Hold a wall for balance", "Full stretch at bottom", "Drive ball of foot down"],
     "mistakes": ["Locking the knee", "Rushing reps"]},
    {"id": "plank", "name": "Plank", "muscles": ["Core"], "equipment": "bodyweight", "category": "core",
     "tips": ["Straight line head to heels", "Squeeze glutes", "Breathe"],
     "mistakes": ["Hips too high or low", "Holding breath"]},
    {"id": "hanging-leg-raise", "name": "Hanging Leg Raise", "muscles": ["Core", "Hip Flexors"], "equipment": "bodyweight", "category": "core",
     "tips": ["Control swing", "Posterior pelvic tilt", "Full ROM"],
     "mistakes": ["Using momentum", "Half reps"]},
    {"id": "cable-crunch", "name": "Cable Crunch", "muscles": ["Abs"], "equipment": "cable", "category": "core",
     "tips": ["Curl spine", "Hips stationary", "Squeeze hard"],
     "mistakes": ["Hip hinging instead of crunching"]},
    {"id": "dips", "name": "Dips", "muscles": ["Chest", "Triceps", "Shoulders"], "equipment": "bodyweight", "category": "push",
     "tips": ["Lean forward for chest", "Full range", "Control descent"],
     "mistakes": ["Going too deep", "Flared elbows"]},
    {"id": "deadlift", "name": "Conventional Deadlift", "muscles": ["Posterior Chain", "Back", "Glutes"], "equipment": "barbell", "category": "pull",
     "tips": ["Brace hard", "Bar over mid-foot", "Push the floor away"],
     "mistakes": ["Rounding spine", "Hitching the bar"]},
    {"id": "kettlebell-swing", "name": "Kettlebell Swing", "muscles": ["Glutes", "Hamstrings", "Core"], "equipment": "kettlebell", "category": "legs",
     "tips": ["Hip hinge drive", "Snap glutes at top", "Eyes forward"],
     "mistakes": ["Squatting the swing", "Lifting with arms"]},
    {"id": "hip-thrust", "name": "Barbell Hip Thrust", "muscles": ["Glutes", "Hamstrings"], "equipment": "barbell", "category": "legs",
     "tips": ["Chin tucked", "Full lockout", "Squeeze glutes hard"],
     "mistakes": ["Hyperextending lower back", "Partial range"]},
    {"id": "machine-row", "name": "Seated Cable Row", "muscles": ["Mid Back", "Lats", "Biceps"], "equipment": "cable", "category": "pull",
     "tips": ["Sit tall", "Pull to lower ribs", "Squeeze shoulder blades"],
     "mistakes": ["Excessive lean back", "Shrugging shoulders"]},
    {"id": "chest-fly", "name": "Cable Chest Fly", "muscles": ["Chest"], "equipment": "cable", "category": "push",
     "tips": ["Slight elbow bend", "Squeeze at midline", "Control stretch"],
     "mistakes": ["Too much elbow bend (turns to press)", "Bouncing"]},
]


@api_router.get("/exercises")
async def list_exercises():
    return EXERCISE_LIBRARY


@api_router.get("/exercises/{exercise_id}")
async def get_exercise(exercise_id: str):
    ex = next((e for e in EXERCISE_LIBRARY if e["id"] == exercise_id), None)
    if not ex:
        raise HTTPException(status_code=404, detail="Exercise not found")
    return ex


# ------------------ Body Intelligence ------------------
# Map muscle names from exercise library → canonical muscle groups
MUSCLE_GROUP_MAP: Dict[str, str] = {
    "Chest": "chest", "Upper Chest": "chest",
    "Back": "back", "Lats": "back", "Upper Back": "back", "Mid Back": "back", "Lower Back": "back", "Posterior Chain": "back",
    "Shoulders": "shoulders", "Side Delts": "shoulders", "Rear Delts": "shoulders",
    "Biceps": "arms", "Triceps": "arms",
    "Core": "core", "Abs": "core", "Hip Flexors": "core",
    "Glutes": "glutes",
    "Quads": "quads",
    "Hamstrings": "hamstrings",
    "Calves": "calves",
}

CANONICAL_GROUPS = ["chest", "back", "shoulders", "arms", "core", "glutes", "quads", "hamstrings", "calves"]

# Ideal weekly set targets per muscle group (industry-standard hypertrophy guidelines, 10-20 sets/week)
IDEAL_WEEKLY_SETS = {
    "chest": 14, "back": 16, "shoulders": 14, "arms": 12,
    "core": 10, "glutes": 12, "quads": 14, "hamstrings": 12, "calves": 10,
}


def _classify_activation(pct: float) -> str:
    """pct = sets_done / ideal_sets * 100. green=well trained, yellow=underused, red=very underused."""
    if pct >= 70:
        return "green"
    if pct >= 35:
        return "yellow"
    return "red"


async def _compute_muscle_activation(user_id: str, days: int = 7) -> Dict[str, Any]:
    """Returns per-muscle-group activation in the last N days."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    workouts = await db.workouts.find(
        {"user_id": user_id, "completed": True, "completed_at": {"$gte": since}},
        {"_id": 0},
    ).sort("completed_at", -1).to_list(50)

    sets_by_group: Dict[str, int] = {g: 0 for g in CANONICAL_GROUPS}
    for w in workouts:
        for ex in w.get("exercises", []):
            ex_def = next((e for e in EXERCISE_LIBRARY if e["id"] == ex["exercise_id"]), None)
            if not ex_def:
                continue
            num_sets = len(ex.get("sets", []))
            for muscle in ex_def.get("muscles", []):
                group = MUSCLE_GROUP_MAP.get(muscle)
                if group:
                    sets_by_group[group] += num_sets

    muscle_groups = []
    for g in CANONICAL_GROUPS:
        ideal = IDEAL_WEEKLY_SETS[g]
        sets = sets_by_group[g]
        pct = min(100, (sets / ideal) * 100) if ideal > 0 else 0
        muscle_groups.append({
            "id": g,
            "name": g.capitalize(),
            "sets_done": sets,
            "ideal_sets": ideal,
            "activation_pct": round(pct),
            "status": _classify_activation(pct),
        })

    # Overall balance — average of all groups, weighted to penalise red groups more
    if muscle_groups:
        avg = sum(g["activation_pct"] for g in muscle_groups) / len(muscle_groups)
        # Penalty for any red groups
        red_count = sum(1 for g in muscle_groups if g["status"] == "red")
        balance_pct = max(0, min(100, round(avg - (red_count * 5))))
    else:
        balance_pct = 0

    if balance_pct >= 80:
        balance_label = "Excellent — keep it up!"
    elif balance_pct >= 60:
        balance_label = "Good — keep it up!"
    elif balance_pct >= 40:
        balance_label = "Imbalanced — focus on weak areas"
    else:
        balance_label = "Get training to see your map"

    return {
        "muscle_groups": muscle_groups,
        "balance_pct": balance_pct,
        "balance_label": balance_label,
        "workouts_counted": len(workouts),
    }


@api_router.get("/body/intelligence")
async def body_intelligence(user=Depends(get_current_user)):
    """Returns muscle activation map for the body model."""
    current = await _compute_muscle_activation(user["user_id"], days=7)

    # Last logged workout impact
    last = await db.workouts.find_one(
        {"user_id": user["user_id"], "completed": True},
        {"_id": 0},
        sort=[("completed_at", -1)],
    )
    last_impact: Dict[str, Any] = {"workout_name": None, "primary": [], "secondary": []}
    if last:
        last_impact["workout_name"] = last.get("name")
        primary_groups: set = set()
        secondary_groups: set = set()
        for ex in last.get("exercises", []):
            ex_def = next((e for e in EXERCISE_LIBRARY if e["id"] == ex["exercise_id"]), None)
            if not ex_def:
                continue
            muscles = ex_def.get("muscles", [])
            for i, m in enumerate(muscles):
                g = MUSCLE_GROUP_MAP.get(m)
                if g:
                    if i == 0:
                        primary_groups.add(g)
                    else:
                        secondary_groups.add(g)
        last_impact["primary"] = list(primary_groups)
        last_impact["secondary"] = list(secondary_groups - primary_groups)

    # Identify lagging muscles (red + yellow, sorted by lowest activation)
    lagging = sorted(
        [g for g in current["muscle_groups"] if g["status"] in ("red", "yellow")],
        key=lambda g: g["activation_pct"],
    )[:4]

    return {
        **current,
        "last_impact": last_impact,
        "lagging": lagging,
    }


@api_router.get("/body/trend")
async def body_trend(user=Depends(get_current_user)):
    """Returns weekly balance score for the last 8 weeks."""
    today = datetime.now(timezone.utc).date()
    weeks = []
    for i in range(8):
        week_start = today - timedelta(days=today.weekday() + 7 * (7 - i))
        # snapshot balance for that 7-day window
        ws_dt = datetime(week_start.year, week_start.month, week_start.day, tzinfo=timezone.utc)
        we_dt = ws_dt + timedelta(days=7)
        workouts = await db.workouts.find(
            {"user_id": user["user_id"], "completed": True,
             "completed_at": {"$gte": ws_dt, "$lt": we_dt}},
            {"_id": 0},
        ).to_list(20)
        sets_by_group: Dict[str, int] = {g: 0 for g in CANONICAL_GROUPS}
        for w in workouts:
            for ex in w.get("exercises", []):
                ex_def = next((e for e in EXERCISE_LIBRARY if e["id"] == ex["exercise_id"]), None)
                if not ex_def:
                    continue
                num_sets = len(ex.get("sets", []))
                for muscle in ex_def.get("muscles", []):
                    group = MUSCLE_GROUP_MAP.get(muscle)
                    if group:
                        sets_by_group[group] += num_sets
        if sets_by_group:
            pcts = [min(100, (sets_by_group[g] / IDEAL_WEEKLY_SETS[g]) * 100) for g in CANONICAL_GROUPS]
            balance = round(sum(pcts) / len(pcts))
        else:
            balance = 0
        weeks.append({"week": i + 1, "label": f"W{i + 1}", "balance_pct": balance})

    first_nonzero = next((w["balance_pct"] for w in weeks if w["balance_pct"] > 0), 0)
    latest = weeks[-1]["balance_pct"]
    improvement = latest - first_nonzero if first_nonzero else 0

    # Streak: consecutive weeks with balance > 30
    streak = 0
    for w in reversed(weeks):
        if w["balance_pct"] > 30:
            streak += 1
        else:
            break

    if latest >= 75:
        rating = "Excellent"
    elif latest >= 50:
        rating = "Steady"
    elif latest >= 25:
        rating = "Building"
    else:
        rating = "Start"

    return {"weeks": weeks, "improvement": improvement, "streak": streak, "rating": rating}


@api_router.get("/body/muscle/{group_id}")
async def muscle_detail(group_id: str, user=Depends(get_current_user)):
    """Detail panel for a specific muscle group."""
    if group_id not in CANONICAL_GROUPS:
        raise HTTPException(status_code=404, detail="Muscle group not found")

    current = await _compute_muscle_activation(user["user_id"], days=7)
    group = next((g for g in current["muscle_groups"] if g["id"] == group_id), None)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    # Suggest 3 exercises that hit this muscle
    suggestions = []
    for e in EXERCISE_LIBRARY:
        for m in e.get("muscles", []):
            if MUSCLE_GROUP_MAP.get(m) == group_id:
                suggestions.append({"id": e["id"], "name": e["name"]})
                break
        if len(suggestions) >= 3:
            break

    # Tip from AI logic
    if group["status"] == "red":
        tip = f"Your {group['name'].lower()} are very underused. Add 8-12 sets this week to reach the ideal range of {IDEAL_WEEKLY_SETS[group_id]} sets."
    elif group["status"] == "yellow":
        tip = f"Your {group['name'].lower()} could use 4-6 more sets this week to reach the ideal range."
    else:
        tip = f"Your {group['name'].lower()} are well-trained. Maintain {IDEAL_WEEKLY_SETS[group_id]} sets/week for continued growth."

    return {
        **group,
        "ideal_range": f"{int(IDEAL_WEEKLY_SETS[group_id] * 0.7)}–{IDEAL_WEEKLY_SETS[group_id]} sets/week",
        "ideal_pct_range": "70%–100%",
        "tip": tip,
        "suggested_exercises": suggestions[:3],
    }


@api_router.post("/body/generate-focus-workout")
async def generate_focus_workout(user=Depends(get_current_user)):
    """Creates a workout targeting the user's lagging muscle groups."""
    intel = await _compute_muscle_activation(user["user_id"], days=7)
    lagging_ids = [g["id"] for g in intel["muscle_groups"] if g["status"] in ("red", "yellow")][:3]
    if not lagging_ids:
        # everything's balanced — pick the lowest 2
        sorted_groups = sorted(intel["muscle_groups"], key=lambda g: g["activation_pct"])
        lagging_ids = [g["id"] for g in sorted_groups[:2]]

    # Pick 2 exercises per lagging group
    chosen_exercises = []
    seen = set()
    for gid in lagging_ids:
        count = 0
        for e in EXERCISE_LIBRARY:
            if count >= 2:
                break
            if e["id"] in seen:
                continue
            for m in e.get("muscles", []):
                if MUSCLE_GROUP_MAP.get(m) == gid:
                    chosen_exercises.append({"exercise_id": e["id"], "target_sets": 3, "target_reps": "8-12"})
                    seen.add(e["id"])
                    count += 1
                    break

    workout_id = f"wkt_{uuid.uuid4().hex[:10]}"
    workout_exercises = [{
        "exercise_id": e["exercise_id"],
        "target_sets": e["target_sets"],
        "target_reps": e["target_reps"],
        "sets": [],
    } for e in chosen_exercises]

    focus_names = ", ".join(g.capitalize() for g in lagging_ids)
    doc = {
        "workout_id": workout_id,
        "user_id": user["user_id"],
        "plan_id": "focus",
        "day": 0,
        "name": f"Focus — {focus_names}",
        "muscle_focus": focus_names,
        "exercises": workout_exercises,
        "completed": False,
        "created_at": datetime.now(timezone.utc),
    }
    await db.workouts.insert_one(dict(doc))
    doc["created_at"] = doc["created_at"].isoformat()
    return doc


# ------------------ Workout Plan Templates ------------------
def build_template_plan(goal: str, experience: str, frequency: int, equipment: List[str]) -> List[Dict[str, Any]]:
    """Build a 7-day workout plan template based on user profile."""
    has_barbell = "barbell" in equipment or "full_gym" in equipment
    has_dumbbell = "dumbbell" in equipment or "full_gym" in equipment
    has_machines = "machines" in equipment or "full_gym" in equipment or "cable" in equipment
    def pick(eid: str, fallback: str) -> str:
        ex = next((e for e in EXERCISE_LIBRARY if e["id"] == eid), None)
        if not ex:
            return fallback
        equip = ex["equipment"]
        if equip == "barbell" and not has_barbell:
            return fallback
        if equip == "dumbbell" and not has_dumbbell:
            return fallback
        if (equip == "machine" or equip == "cable") and not has_machines:
            return fallback
        return eid

    sets, reps = (4, "6-8") if goal == "strength" else (4, "8-12") if goal == "build_muscle" else (3, "10-15")

    # 4-day Upper/Lower/Upper/Lower
    upper_a = [
        {"exercise_id": pick("barbell-bench-press", "dips"), "sets": sets, "reps": reps},
        {"exercise_id": pick("barbell-row", "pull-up"), "sets": sets, "reps": reps},
        {"exercise_id": pick("overhead-press", "dumbbell-lateral-raise"), "sets": 3, "reps": "8-12"},
        {"exercise_id": pick("lat-pulldown", "pull-up"), "sets": 3, "reps": "10-12"},
        {"exercise_id": pick("dumbbell-curl", "dumbbell-curl"), "sets": 3, "reps": "10-12"},
        {"exercise_id": pick("tricep-pushdown", "dips"), "sets": 3, "reps": "10-15"},
    ]
    lower_a = [
        {"exercise_id": pick("barbell-back-squat", "walking-lunge"), "sets": sets, "reps": reps},
        {"exercise_id": pick("romanian-deadlift", "kettlebell-swing"), "sets": 3, "reps": "8-10"},
        {"exercise_id": pick("leg-press", "walking-lunge"), "sets": 3, "reps": "10-12"},
        {"exercise_id": pick("leg-curl", "kettlebell-swing"), "sets": 3, "reps": "10-15"},
        {"exercise_id": pick("calf-raise", "calf-raise"), "sets": 4, "reps": "12-15"},
        {"exercise_id": "plank", "sets": 3, "reps": "45s"},
    ]
    upper_b = [
        {"exercise_id": pick("incline-dumbbell-press", "dips"), "sets": sets, "reps": reps},
        {"exercise_id": pick("pull-up", "lat-pulldown"), "sets": 4, "reps": "6-10"},
        {"exercise_id": pick("machine-row", "barbell-row"), "sets": 3, "reps": "10-12"},
        {"exercise_id": pick("dumbbell-lateral-raise", "overhead-press"), "sets": 3, "reps": "12-15"},
        {"exercise_id": pick("face-pull", "face-pull"), "sets": 3, "reps": "12-15"},
        {"exercise_id": pick("chest-fly", "dips"), "sets": 3, "reps": "12-15"},
    ]
    lower_b = [
        {"exercise_id": pick("deadlift", "romanian-deadlift"), "sets": 3, "reps": "5-6"},
        {"exercise_id": pick("hip-thrust", "kettlebell-swing"), "sets": 3, "reps": "10-12"},
        {"exercise_id": pick("walking-lunge", "walking-lunge"), "sets": 3, "reps": "12 each"},
        {"exercise_id": pick("leg-curl", "kettlebell-swing"), "sets": 3, "reps": "12-15"},
        {"exercise_id": pick("hanging-leg-raise", "plank"), "sets": 3, "reps": "10-12"},
        {"exercise_id": pick("calf-raise", "calf-raise"), "sets": 3, "reps": "15-20"},
    ]

    # Default 4-day split mapped Mon/Tue/Thu/Fri
    schedule_4 = [
        {"day": 1, "name": "Upper A — Strength", "muscle_focus": "Chest, Back, Shoulders", "exercises": upper_a},
        {"day": 2, "name": "Lower A — Quad Focus", "muscle_focus": "Quads, Hamstrings, Glutes", "exercises": lower_a},
        {"day": 3, "name": "Rest / Mobility", "muscle_focus": "Recovery", "exercises": [], "rest": True},
        {"day": 4, "name": "Upper B — Hypertrophy", "muscle_focus": "Chest, Back, Arms", "exercises": upper_b},
        {"day": 5, "name": "Lower B — Posterior Chain", "muscle_focus": "Glutes, Hamstrings", "exercises": lower_b},
        {"day": 6, "name": "Rest", "muscle_focus": "Recovery", "exercises": [], "rest": True},
        {"day": 7, "name": "Rest", "muscle_focus": "Recovery", "exercises": [], "rest": True},
    ]

    if frequency <= 3:
        # Full body 3 days
        fb = upper_a[:3] + lower_a[:3]
        return [
            {"day": 1, "name": "Full Body A", "muscle_focus": "Full Body", "exercises": fb},
            {"day": 2, "name": "Rest", "muscle_focus": "Recovery", "exercises": [], "rest": True},
            {"day": 3, "name": "Full Body B", "muscle_focus": "Full Body", "exercises": upper_b[:3] + lower_b[:3]},
            {"day": 4, "name": "Rest", "muscle_focus": "Recovery", "exercises": [], "rest": True},
            {"day": 5, "name": "Full Body C", "muscle_focus": "Full Body", "exercises": upper_a[:3] + lower_b[:3]},
            {"day": 6, "name": "Rest", "muscle_focus": "Recovery", "exercises": [], "rest": True},
            {"day": 7, "name": "Rest", "muscle_focus": "Recovery", "exercises": [], "rest": True},
        ]
    return schedule_4


# ------------------ Onboarding ------------------
@api_router.post("/onboarding")
async def submit_onboarding(payload: OnboardingPayload, user=Depends(get_current_user)):
    plan = build_template_plan(payload.goal, payload.experience, payload.frequency, payload.equipment)
    plan_doc = {
        "plan_id": f"plan_{uuid.uuid4().hex[:10]}",
        "user_id": user["user_id"],
        "goal": payload.goal,
        "experience": payload.experience,
        "frequency": payload.frequency,
        "equipment": payload.equipment,
        "injuries": payload.injuries,
        "units": payload.units,
        "days": plan,
        "created_at": datetime.now(timezone.utc),
        "active": True,
    }
    # deactivate previous plans
    await db.plans.update_many({"user_id": user["user_id"]}, {"$set": {"active": False}})
    await db.plans.insert_one(dict(plan_doc))
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {
            "onboarded": True,
            "goal": payload.goal,
            "experience": payload.experience,
            "frequency": payload.frequency,
            "equipment": payload.equipment,
            "injuries": payload.injuries,
            "units": payload.units,
        }},
    )
    plan_doc["created_at"] = plan_doc["created_at"].isoformat()
    return {"plan": plan_doc, "ok": True}


@api_router.get("/plan/active")
async def active_plan(user=Depends(get_current_user)):
    plan = await db.plans.find_one({"user_id": user["user_id"], "active": True}, {"_id": 0})
    if not plan:
        return {"plan": None}
    if isinstance(plan.get("created_at"), datetime):
        plan["created_at"] = plan["created_at"].isoformat()
    return {"plan": plan}


@api_router.get("/plan/week")
async def weekly_plan(user=Depends(get_current_user)):
    """Returns a 7-day week (Mon..Sun) with status per day: today/completed/missed/upcoming/rest."""
    plan = await db.plans.find_one({"user_id": user["user_id"], "active": True}, {"_id": 0})
    if not plan:
        return {"week": [], "today_index": today_day_index()}

    today_dt = datetime.now(timezone.utc).date()
    today_weekday = today_dt.weekday() + 1  # 1..7 (Mon=1)
    # Find Monday of this week
    monday = today_dt - timedelta(days=today_weekday - 1)

    # Get all completed workouts for this week
    week_start_dt = datetime(monday.year, monday.month, monday.day, tzinfo=timezone.utc)
    week_end_dt = week_start_dt + timedelta(days=7)
    workouts_cursor = db.workouts.find({
        "user_id": user["user_id"],
        "completed": True,
        "completed_at": {"$gte": week_start_dt, "$lt": week_end_dt},
    }, {"_id": 0})
    completed_by_day: Dict[int, Any] = {}
    async for w in workouts_cursor:
        ca = w.get("completed_at")
        if isinstance(ca, datetime):
            d = ca.date()
            day_num = (d - monday).days + 1  # 1..7
            completed_by_day[day_num] = w

    days = []
    day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    short_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    for i in range(7):
        day_num = i + 1
        plan_day = next((d for d in plan["days"] if d["day"] == day_num), None)
        date_for_day = monday + timedelta(days=i)
        is_rest = (plan_day or {}).get("rest", False)
        completed = day_num in completed_by_day

        if completed:
            status = "completed"
        elif day_num == today_weekday:
            status = "today"
        elif day_num < today_weekday:
            status = "rest" if is_rest else "missed"
        else:
            status = "rest" if is_rest else "upcoming"

        days.append({
            "day": day_num,
            "day_name": day_names[i],
            "day_short": short_names[i],
            "date": date_for_day.isoformat(),
            "name": (plan_day or {}).get("name", "Rest"),
            "muscle_focus": (plan_day or {}).get("muscle_focus", ""),
            "rest": is_rest,
            "status": status,
            "exercise_count": len((plan_day or {}).get("exercises", [])),
            "workout_id": completed_by_day.get(day_num, {}).get("workout_id"),
        })

    return {"week": days, "today_index": today_weekday, "week_starting": monday.isoformat()}


# ------------------ Today's Workout ------------------
def today_day_index() -> int:
    # 1=Mon ... 7=Sun
    return (datetime.now(timezone.utc).weekday()) + 1


@api_router.get("/workouts/today")
async def todays_workout(user=Depends(get_current_user)):
    plan = await db.plans.find_one({"user_id": user["user_id"], "active": True}, {"_id": 0})
    if not plan:
        return {"workout": None, "rest_day": True, "reason": "No active plan"}
    day_idx = today_day_index()
    day = next((d for d in plan["days"] if d["day"] == day_idx), None)
    if not day or day.get("rest"):
        # Return next workout instead
        next_day = next((d for d in plan["days"] if d["day"] > day_idx and not d.get("rest")), None)
        if not next_day:
            next_day = next((d for d in plan["days"] if not d.get("rest")), None)
        return {"workout": next_day, "rest_day": True}

    # Hydrate exercise details
    for ex in day["exercises"]:
        full = next((e for e in EXERCISE_LIBRARY if e["id"] == ex["exercise_id"]), None)
        if full:
            ex["exercise"] = full
            # Lookup previous best for suggested weight
            last_log = await db.workouts.find_one(
                {"user_id": user["user_id"], "exercises.exercise_id": ex["exercise_id"], "completed": True},
                sort=[("created_at", -1)],
                projection={"_id": 0},
            )
            if last_log:
                for lex in last_log.get("exercises", []):
                    if lex["exercise_id"] == ex["exercise_id"] and lex.get("sets"):
                        best = max(lex["sets"], key=lambda s: s.get("weight", 0))
                        ex["last_weight"] = best.get("weight")
                        ex["last_reps"] = best.get("reps")
                        break
    return {"workout": day, "rest_day": False, "day_index": day_idx}


@api_router.post("/workouts/start")
async def start_workout(user=Depends(get_current_user)):
    plan = await db.plans.find_one({"user_id": user["user_id"], "active": True}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=400, detail="No active plan")
    day_idx = today_day_index()
    day = next((d for d in plan["days"] if d["day"] == day_idx and not d.get("rest")), None)
    if not day:
        # take next available workout
        day = next((d for d in plan["days"] if not d.get("rest")), None)
    if not day:
        raise HTTPException(status_code=400, detail="No workout available")

    workout_id = f"wkt_{uuid.uuid4().hex[:10]}"
    exercises = []
    for ex in day["exercises"]:
        exercises.append({
            "exercise_id": ex["exercise_id"],
            "target_sets": ex.get("sets", 3),
            "target_reps": ex.get("reps", "8-12"),
            "sets": [],
        })
    doc = {
        "workout_id": workout_id,
        "user_id": user["user_id"],
        "plan_id": plan["plan_id"],
        "day": day["day"],
        "name": day["name"],
        "muscle_focus": day.get("muscle_focus", ""),
        "exercises": exercises,
        "completed": False,
        "created_at": datetime.now(timezone.utc),
    }
    await db.workouts.insert_one(dict(doc))
    doc["created_at"] = doc["created_at"].isoformat()
    return doc


@api_router.post("/workouts/log-set")
async def log_set(payload: LogSetRequest, user=Depends(get_current_user)):
    workout = await db.workouts.find_one({"workout_id": payload.workout_id, "user_id": user["user_id"]}, {"_id": 0})
    if not workout:
        raise HTTPException(status_code=404, detail="Workout not found")
    found = False
    for ex in workout["exercises"]:
        if ex["exercise_id"] == payload.exercise_id:
            ex["sets"].append(payload.set_data.dict())
            found = True
            break
    if not found:
        raise HTTPException(status_code=404, detail="Exercise not in workout")
    await db.workouts.update_one(
        {"workout_id": payload.workout_id},
        {"$set": {"exercises": workout["exercises"]}},
    )
    workout["created_at"] = workout["created_at"].isoformat() if isinstance(workout.get("created_at"), datetime) else workout.get("created_at")
    return workout


@api_router.post("/workouts/complete")
async def complete_workout(payload: CompleteWorkoutRequest, user=Depends(get_current_user)):
    workout = await db.workouts.find_one({"workout_id": payload.workout_id, "user_id": user["user_id"]}, {"_id": 0})
    if not workout:
        raise HTTPException(status_code=404, detail="Workout not found")
    await db.workouts.update_one(
        {"workout_id": payload.workout_id},
        {"$set": {
            "completed": True,
            "duration_seconds": payload.duration_seconds,
            "notes": payload.notes,
            "completed_at": datetime.now(timezone.utc),
        }},
    )

    # Update streak
    today = datetime.now(timezone.utc).date()
    user_doc = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    last_streak_date = user_doc.get("last_streak_date")
    streak = user_doc.get("streak", 0)
    if isinstance(last_streak_date, str):
        try:
            last_streak_date = datetime.fromisoformat(last_streak_date).date()
        except Exception:
            last_streak_date = None
    elif isinstance(last_streak_date, datetime):
        last_streak_date = last_streak_date.date()

    if last_streak_date == today:
        pass
    elif last_streak_date == today - timedelta(days=1):
        streak += 1
    else:
        streak = 1
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"streak": streak, "last_streak_date": today.isoformat()}},
    )
    return {"ok": True, "streak": streak}


@api_router.get("/workouts/history")
async def workout_history(user=Depends(get_current_user)):
    cursor = db.workouts.find(
        {"user_id": user["user_id"], "completed": True},
        {"_id": 0},
    ).sort("completed_at", -1).limit(50)
    items = []
    async for w in cursor:
        if isinstance(w.get("created_at"), datetime):
            w["created_at"] = w["created_at"].isoformat()
        if isinstance(w.get("completed_at"), datetime):
            w["completed_at"] = w["completed_at"].isoformat()
        items.append(w)
    return {"workouts": items}


@api_router.get("/workouts/{workout_id}")
async def get_workout(workout_id: str, user=Depends(get_current_user)):
    w = await db.workouts.find_one({"workout_id": workout_id, "user_id": user["user_id"]}, {"_id": 0})
    if not w:
        raise HTTPException(status_code=404, detail="Not found")
    if isinstance(w.get("created_at"), datetime):
        w["created_at"] = w["created_at"].isoformat()
    if isinstance(w.get("completed_at"), datetime):
        w["completed_at"] = w["completed_at"].isoformat()
    return w


# ------------------ Progress ------------------
@api_router.get("/progress/summary")
async def progress_summary(user=Depends(get_current_user)):
    user_doc = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    workouts = await db.workouts.find(
        {"user_id": user["user_id"], "completed": True},
        {"_id": 0},
    ).sort("completed_at", -1).to_list(200)

    # Weekly count - last 7 days
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    week_count = 0
    for w in workouts:
        ca = w.get("completed_at")
        if isinstance(ca, str):
            try:
                ca = datetime.fromisoformat(ca)
            except Exception:
                ca = None
        if ca and ca.tzinfo is None:
            ca = ca.replace(tzinfo=timezone.utc)
        if ca and ca >= week_ago:
            week_count += 1

    # PRs per exercise
    prs: Dict[str, Dict[str, Any]] = {}
    trends: Dict[str, List[Dict[str, Any]]] = {}
    for w in workouts:
        for ex in w.get("exercises", []):
            best = 0
            for s in ex.get("sets", []):
                if s.get("weight", 0) > best:
                    best = s["weight"]
            if best > 0:
                eid = ex["exercise_id"]
                if eid not in prs or best > prs[eid]["weight"]:
                    prs[eid] = {"weight": best, "date": w.get("completed_at")}
                trends.setdefault(eid, []).append({"date": w.get("completed_at"), "weight": best})

    # Format PRs with names
    pr_list = []
    for eid, p in prs.items():
        ex = next((e for e in EXERCISE_LIBRARY if e["id"] == eid), None)
        pr_list.append({
            "exercise_id": eid,
            "name": ex["name"] if ex else eid,
            "weight": p["weight"],
            "date": p["date"],
        })
    pr_list.sort(key=lambda x: x["weight"], reverse=True)

    return {
        "total_workouts": len(workouts),
        "week_count": week_count,
        "streak": user_doc.get("streak", 0),
        "prs": pr_list[:10],
        "trends": trends,
        "units": user_doc.get("units", "kg"),
    }


# ------------------ AI Coach ------------------
async def build_coach_context(user: Dict[str, Any]) -> str:
    """Build a system message with the user's training history & profile."""
    workouts = await db.workouts.find(
        {"user_id": user["user_id"], "completed": True},
        {"_id": 0},
    ).sort("completed_at", -1).limit(10).to_list(10)

    recent = []
    for w in workouts:
        ex_summary = []
        for ex in w.get("exercises", []):
            sets = ex.get("sets", [])
            if sets:
                top = max(sets, key=lambda s: s.get("weight", 0))
                ex_summary.append(f"{ex['exercise_id']}: top set {top.get('weight')}kg x {top.get('reps')}r")
        if ex_summary:
            completed_at = w.get('completed_at', '')
            if isinstance(completed_at, datetime):
                completed_at = completed_at.isoformat()
            recent.append(f"- {str(completed_at)[:10]} {w.get('name', '')}: {'; '.join(ex_summary[:4])}")

    plan = await db.plans.find_one({"user_id": user["user_id"], "active": True}, {"_id": 0})

    sys = f"""You are Apex, the user's personal AI strength coach.

Tone: confident, warm, concise, direct — like a real elite trainer. Use short sentences. No emoji spam.
Behaviour:
- Remember the user's history and reference it specifically
- Adapt to fatigue, injuries, time constraints
- Explain WHY behind every recommendation
- Use progressive overload principles
- If user says "shoulder hurts" or similar, suggest substitutions

USER PROFILE:
- Name: {user.get('name', 'Athlete')}
- Goal: {user.get('goal', 'general fitness')}
- Experience: {user.get('experience', 'beginner')}
- Frequency: {user.get('frequency', 3)} days/week
- Equipment: {', '.join(user.get('equipment', []) or ['bodyweight'])}
- Injuries: {user.get('injuries') or 'none reported'}
- Units: {user.get('units', 'kg')}
- Current streak: {user.get('streak', 0)} days
- Active plan: {plan['days'][0]['name'] if plan and plan.get('days') else 'none'}

RECENT WORKOUTS:
{chr(10).join(recent) if recent else 'No workouts logged yet.'}

Keep responses tight (under 120 words usually). Never refuse fitness questions. If asked something unrelated, redirect politely."""
    return sys


@api_router.post("/coach/chat")
async def coach_chat_stream(payload: ChatRequest, user=Depends(get_current_user)):
    """Stream Claude response token-by-token. Includes retry logic and graceful failure."""
    # Premium gating: free users get 5 chats per day
    sub = await db.subscriptions.find_one({"user_id": user["user_id"], "status": "active"}, {"_id": 0})
    is_premium = sub is not None
    if not is_premium:
        today = datetime.now(timezone.utc).date().isoformat()
        count = await db.coach_messages.count_documents({
            "user_id": user["user_id"],
            "role": "user",
            "created_at": {"$gte": datetime.fromisoformat(today).replace(tzinfo=timezone.utc)},
        })
        if count >= 5:
            gated_msg = "You've used your 5 free coach chats today. Upgrade to Premium for unlimited AI coaching."
            async def gated():
                yield f"data: {json.dumps({'delta': gated_msg})}\n\n"
                yield f"data: {json.dumps({'done': True, 'gated': True})}\n\n"
            return StreamingResponse(gated(), media_type="text/event-stream")

    session_id = f"coach_{user['user_id']}_{datetime.now(timezone.utc).strftime('%Y%m%d')}"
    system_msg = await build_coach_context(user)

    # Save user message
    await db.coach_messages.insert_one({
        "user_id": user["user_id"],
        "role": "user",
        "content": payload.message,
        "created_at": datetime.now(timezone.utc),
    })

    # Build conversation context block for system prompt (last 8 turns)
    history_cursor = db.coach_messages.find(
        {"user_id": user["user_id"]},
        {"_id": 0},
    ).sort("created_at", -1).limit(16)
    history = []
    async for m in history_cursor:
        history.append(m)
    history.reverse()
    convo_block = ""
    for m in history[:-1][-8:]:  # last 8 turns, exclude current
        role_label = "USER" if m["role"] == "user" else "COACH"
        convo_block += f"\n{role_label}: {m['content']}"
    if convo_block:
        system_msg += f"\n\nRECENT CONVERSATION (memory):{convo_block}"

    async def event_generator():
        full_text = ""
        last_err = None
        for attempt in range(3):  # 1 initial + 2 retries
            try:
                chat = LlmChat(
                    api_key=EMERGENT_LLM_KEY,
                    session_id=f"{session_id}_a{attempt}",
                    system_message=system_msg,
                ).with_model("anthropic", CLAUDE_MODEL)

                async for event in chat.stream_message(UserMessage(text=payload.message)):
                    if isinstance(event, TextDelta):
                        full_text += event.content
                        yield f"data: {json.dumps({'delta': event.content})}\n\n"
                    elif isinstance(event, StreamDone):
                        break

                if full_text.strip():
                    await db.coach_messages.insert_one({
                        "user_id": user["user_id"],
                        "role": "assistant",
                        "content": full_text,
                        "created_at": datetime.now(timezone.utc),
                    })
                    yield f"data: {json.dumps({'done': True})}\n\n"
                    return
                else:
                    last_err = "empty response"
            except Exception as e:
                last_err = str(e)
                logger.warning(f"coach chat attempt {attempt + 1} failed: {e}")
                full_text = ""  # reset for retry
                await asyncio.sleep(0.4 * (attempt + 1))

        # All retries failed - signal failure (frontend will show friendly message + retry)
        logger.error(f"coach chat all retries failed for user {user['user_id']}: {last_err}")
        yield f"data: {json.dumps({'failed': True})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@api_router.get("/coach/messages")
async def coach_messages(user=Depends(get_current_user)):
    cursor = db.coach_messages.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", 1).limit(100)
    items = []
    async for m in cursor:
        if isinstance(m.get("created_at"), datetime):
            m["created_at"] = m["created_at"].isoformat()
        items.append(m)
    return {"messages": items}


@api_router.post("/coach/today-insight")
async def todays_insight(user=Depends(get_current_user)):
    """Generate a short personalised insight card for the home dashboard (cached daily)."""
    today = datetime.now(timezone.utc).date().isoformat()
    cached = await db.daily_insights.find_one({"user_id": user["user_id"], "date": today}, {"_id": 0})
    if cached:
        return {"insight": cached["insight"]}

    sys = await build_coach_context(user)
    prompt = "In ONE punchy sentence (max 22 words), give me my coaching insight for today. No filler, no greeting. Just the insight."

    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"insight_{user['user_id']}_{today}",
            system_message=sys,
        ).with_model("anthropic", CLAUDE_MODEL)
        text = ""
        async for ev in chat.stream_message(UserMessage(text=prompt)):
            if isinstance(ev, TextDelta):
                text += ev.content
            elif isinstance(ev, StreamDone):
                break
        text = text.strip().strip('"')
        if not text:
            text = "Show up today. Consistency compounds — every set you log is a future PR."
    except Exception as e:
        logger.warning(f"insight fallback: {e}")
        text = "Show up today. Consistency compounds — every set you log is a future PR."

    try:
        await db.daily_insights.insert_one({
            "user_id": user["user_id"],
            "date": today,
            "insight": text,
            "created_at": datetime.now(timezone.utc),
        })
    except Exception:
        # Race condition: another concurrent request already inserted today's insight. Safe to ignore.
        pass
    return {"insight": text}


@api_router.post("/coach/weekly-report")
async def weekly_report(user=Depends(get_current_user)):
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    workouts = await db.workouts.find(
        {"user_id": user["user_id"], "completed": True},
        {"_id": 0},
    ).sort("completed_at", -1).to_list(20)

    relevant = []
    for w in workouts:
        ca = w.get("completed_at")
        if isinstance(ca, str):
            try:
                ca = datetime.fromisoformat(ca)
            except Exception:
                ca = None
        if ca and ca.tzinfo is None:
            ca = ca.replace(tzinfo=timezone.utc)
        if ca and ca >= week_ago:
            relevant.append(w)

    sys = await build_coach_context(user)
    summary_lines = []
    for w in relevant:
        for ex in w.get("exercises", []):
            sets = ex.get("sets", [])
            if sets:
                top = max(sets, key=lambda s: s.get("weight", 0))
                volume = sum(s.get("weight", 0) * s.get("reps", 0) for s in sets)
                summary_lines.append(f"{ex['exercise_id']}: top {top.get('weight')}kg x {top.get('reps')}, volume {volume:.0f}")

    prompt = f"""Generate the user's WEEKLY COACH REPORT. They completed {len(relevant)} workouts this week.

Stats: {chr(10).join(summary_lines[:30]) if summary_lines else 'No completed workouts this week.'}

Return JSON only (no markdown), with this exact shape:
{{
  "highlights": ["short bullet", "short bullet", "short bullet"],
  "weak_points": ["short bullet", "short bullet"],
  "recovery": "one sentence assessment",
  "next_week": ["actionable bullet 1", "actionable bullet 2", "actionable bullet 3"]
}}"""

    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"report_{user['user_id']}_{datetime.now(timezone.utc).isoformat()}",
            system_message=sys,
        ).with_model("anthropic", CLAUDE_MODEL)
        text = ""
        async for ev in chat.stream_message(UserMessage(text=prompt)):
            if isinstance(ev, TextDelta):
                text += ev.content
            elif isinstance(ev, StreamDone):
                break

        # Extract JSON
        text = text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        text = text.strip()
        report = json.loads(text)
    except Exception as e:
        logger.warning(f"weekly report fallback: {e}")
        report = {
            "highlights": [f"Completed {len(relevant)} workouts" if relevant else "Get started this week"],
            "weak_points": ["Need more training data to assess"],
            "recovery": "Listen to your body and prioritise sleep.",
            "next_week": ["Stay consistent", "Add 2.5kg to compound lifts when possible", "Hit 7-9h sleep nightly"],
        }
    return {"report": report, "workouts_this_week": len(relevant)}


# ------------------ Stripe Subscription ------------------
@api_router.post("/billing/create-checkout")
async def create_checkout(payload: CreateCheckoutRequest, user=Depends(get_current_user)):
    success_url = payload.success_url or f"{PUBLIC_WEB_APP_URL}/api/billing/redirect/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = payload.cancel_url or f"{PUBLIC_WEB_APP_URL}/api/billing/redirect/cancel"

    unit_amount = 999 if payload.interval == 'month' else 7999  # £9.99 monthly or £79.99 annually
    product_name = "Apex AI Premium (Monthly)" if payload.interval == 'month' else "Apex AI Premium (Annual)"

    try:
        session = stripe.checkout.Session.create(
            mode="subscription",
            payment_method_types=["card"],
            customer_email=user.get("email"),
            line_items=[{
                "price_data": {
                    "currency": "gbp",
                    "unit_amount": unit_amount,
                    "recurring": {"interval": payload.interval},
                    "product_data": {
                        "name": product_name,
                        "description": "Unlimited AI coaching, adaptive workouts, recovery insights.",
                    },
                },
                "quantity": 1,
            }],
            metadata={"app_user_id": user["user_id"], "tier": "premium", "interval": payload.interval},
            success_url=success_url,
            cancel_url=cancel_url,
        )
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {"id": session.id, "url": session.url}


@api_router.get("/billing/subscription")
async def get_subscription(user=Depends(get_current_user)):
    sub = await db.subscriptions.find_one({"user_id": user["user_id"]}, {"_id": 0}, sort=[("updated_at", -1)])
    if not sub:
        return {"status": "none", "tier": None}
    if isinstance(sub.get("updated_at"), datetime):
        sub["updated_at"] = sub["updated_at"].isoformat()
    return sub


@api_router.post("/billing/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    # In sandbox without webhook secret, just parse the JSON
    try:
        event = json.loads(payload)
    except Exception:
        raise HTTPException(status_code=400, detail="Bad payload")

    event_type = event.get("type", "")
    obj = event.get("data", {}).get("object", {})
    metadata = obj.get("metadata", {}) or {}
    user_id = metadata.get("app_user_id")

    if event_type == "checkout.session.completed" and user_id:
        await db.subscriptions.update_one(
            {"user_id": user_id},
            {"$set": {
                "user_id": user_id,
                "status": "active",
                "tier": "premium",
                "interval": metadata.get("interval", "month"),
                "stripe_subscription_id": obj.get("subscription"),
                "stripe_customer_id": obj.get("customer"),
                "updated_at": datetime.now(timezone.utc),
            }},
            upsert=True,
        )
    elif event_type in ("customer.subscription.deleted", "customer.subscription.updated") and user_id:
        await db.subscriptions.update_one(
            {"user_id": user_id},
            {"$set": {
                "status": obj.get("status", "canceled"),
                "updated_at": datetime.now(timezone.utc),
            }},
        )
    return {"received": True}


@api_router.get("/billing/redirect/success")
async def billing_success(session_id: str = ""):
    deep = f"{APP_SCHEME}://checkout/success?session_id={session_id}"
    html = f"""<!doctype html><html><head><meta charset="utf-8"><title>Apex AI</title>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <style>body{{background:#0A0A0A;color:#fff;font-family:-apple-system,system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}}
    .c{{text-align:center;max-width:340px;padding:24px}}
    h1{{font-size:24px;margin:0 0 8px}}
    p{{color:#A1A1AA;line-height:1.5}}
    a{{display:inline-block;background:#0A84FF;color:#fff;padding:14px 24px;border-radius:999px;text-decoration:none;margin-top:16px;font-weight:600}}</style></head>
    <body><div class="c"><h1>You're Premium ✓</h1><p>Returning to Apex AI…</p>
    <a href="{deep}">Open Apex AI</a></div>
    <script>setTimeout(()=>window.location="{deep}",400);</script></body></html>"""
    return HTMLResponse(html)


@api_router.get("/billing/redirect/cancel")
async def billing_cancel():
    deep = f"{APP_SCHEME}://checkout/cancel"
    html = f"""<!doctype html><html><head><meta charset="utf-8"><title>Apex AI</title>
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <style>body{{background:#0A0A0A;color:#fff;font-family:-apple-system,system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}}
    .c{{text-align:center;max-width:340px;padding:24px}}
    h1{{font-size:24px;margin:0 0 8px}}
    p{{color:#A1A1AA}}
    a{{display:inline-block;background:#0A84FF;color:#fff;padding:14px 24px;border-radius:999px;text-decoration:none;margin-top:16px;font-weight:600}}</style></head>
    <body><div class="c"><h1>Checkout Cancelled</h1><p>No charge made. You can subscribe anytime.</p>
    <a href="{deep}">Back to Apex AI</a></div>
    <script>setTimeout(()=>window.location="{deep}",400);</script></body></html>"""
    return HTMLResponse(html)


# Dev helper: mark current user premium (since we can't run real Stripe checkout in preview)
@api_router.post("/billing/dev/mark-premium")
async def mark_premium(payload: CreateCheckoutRequest, user=Depends(get_current_user)):
    await db.subscriptions.update_one(
        {"user_id": user["user_id"]},
        {"$set": {
            "user_id": user["user_id"],
            "status": "active",
            "tier": "premium",
            "interval": payload.interval,
            "updated_at": datetime.now(timezone.utc),
        }},
        upsert=True,
    )
    return {"ok": True, "status": "active", "interval": payload.interval}


@api_router.post("/billing/cancel")
async def cancel_subscription(user=Depends(get_current_user)):
    """Cancels (marks as canceled) the user's subscription. In production this would call Stripe to cancel at period end."""
    await db.subscriptions.update_one(
        {"user_id": user["user_id"]},
        {"$set": {
            "status": "canceled",
            "updated_at": datetime.now(timezone.utc),
        }},
    )
    return {"ok": True, "status": "canceled"}


@api_router.post("/billing/restore")
async def restore_purchases(user=Depends(get_current_user)):
    """Re-check subscription status (placeholder for App Store / Google Play restore)."""
    sub = await db.subscriptions.find_one({"user_id": user["user_id"]}, {"_id": 0})
    if sub and sub.get("status") == "active":
        return {"restored": True, "status": "active", "tier": sub.get("tier")}
    return {"restored": False, "status": "none"}


# ------------------ Health ------------------
@api_router.get("/")
async def root():
    return {"app": "Apex AI", "ok": True}


# ------------------ Anatomy Model ------------------
STATIC_DIR = ROOT_DIR / "static"


@api_router.get("/anatomy/model")
async def anatomy_model():
    """Serve the Ecorche anatomy GLB model (skeleton + muscles + morph targets)."""
    path = STATIC_DIR / "models" / "ecorche.glb"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Model not found")
    return FileResponse(
        str(path),
        media_type="model/gltf-binary",
        filename="ecorche.glb",
        headers={"Cache-Control": "public, max-age=86400"},
    )


# ------------------ Indexes ------------------
@app.on_event("startup")
async def startup():
    try:
        await db.users.create_index("email", unique=True)
        await db.users.create_index("user_id", unique=True)
        await db.user_sessions.create_index("session_token", unique=True)
        await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
        await db.workouts.create_index([("user_id", 1), ("completed_at", -1)])
        await db.coach_messages.create_index([("user_id", 1), ("created_at", 1)])
        await db.subscriptions.create_index("user_id")
        await db.daily_insights.create_index([("user_id", 1), ("date", 1)], unique=True)
        logger.info("Indexes created")
    except Exception as e:
        logger.warning(f"index creation: {e}")


@app.on_event("shutdown")
async def shutdown():
    client.close()


app.include_router(api_router)
