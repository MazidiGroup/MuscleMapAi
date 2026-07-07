"""
Muscle Map Ai - AI Gym Companion - Backend
FastAPI + MongoDB + Claude Sonnet 4.5 + Stripe + Emergent Google Auth
"""
from fastapi import FastAPI, APIRouter, HTTPException, Header, Request, Depends
from fastapi.responses import StreamingResponse, HTMLResponse, JSONResponse, FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import certifi
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
import random
import jwt as _jwt
from jwt import PyJWKClient

from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')
MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')
PUBLIC_WEB_APP_URL = os.environ.get('PUBLIC_WEB_APP_URL', '')
APP_SCHEME = os.environ.get('APP_SCHEME', 'apexai')
RESEND_API_KEY = os.environ.get('RESEND_API_KEY', '')
RESEND_SENDER = os.environ.get('RESEND_SENDER', 'Muscle Map Ai <onboarding@resend.dev>')
APPLE_BUNDLE_ID = os.environ.get('APPLE_BUNDLE_ID', 'com.mazidigroup.apexai')
APPLE_ALLOW_EXPO_GO = os.environ.get('APPLE_ALLOW_EXPO_GO', '1') == '1'
REVENUECAT_SECRET_KEY = os.environ.get('REVENUECAT_SECRET_KEY', '')

CLAUDE_MODEL = "claude-sonnet-4-5-20250929"

# ------------------ DB ------------------
# For MongoDB Atlas (mongodb+srv / TLS) the deploy container needs an explicit,
# up-to-date CA bundle or the TLS handshake fails with TLSV1_ALERT_INTERNAL_ERROR.
# certifi provides one. These options are ignored for the local non-TLS sandbox Mongo.
_mongo_kwargs: dict = {"serverSelectionTimeoutMS": 20000}
if MONGO_URL.startswith("mongodb+srv://") or "mongodb.net" in MONGO_URL or "tls=true" in MONGO_URL.lower() or "ssl=true" in MONGO_URL.lower():
    _mongo_kwargs["tls"] = True
    _mongo_kwargs["tlsCAFile"] = certifi.where()
client = AsyncIOMotorClient(MONGO_URL, **_mongo_kwargs)
db = client[DB_NAME]

# ------------------ App ------------------
app = FastAPI(title="Muscle Map Ai Backend")
api_router = APIRouter(prefix="/api")

# CORS
# CORS — mobile apps send no Origin header and we authenticate with Bearer tokens
# (not cookies), so credentials are not needed. Disabling allow_credentials makes the
# wildcard origin safe.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("apex")


@app.on_event("startup")
async def _ensure_indexes():
    try:
        await db.users.create_index("user_id", unique=True)
        await db.users.create_index("email", unique=True)
        await db.user_sessions.create_index("session_token", unique=True)
        await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
        await db.magic_links.create_index("expires_at", expireAfterSeconds=0)
        await db.coach_ask_usage.create_index("created_at", expireAfterSeconds=172800)
    except Exception as e:
        logger.warning(f"index creation skipped: {e}")


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

    # Upsert user (account linking by email — one account per email)
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if user:
        user_id = user["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": name, "picture": picture, "last_login": datetime.now(timezone.utc)},
             "$addToSet": {"providers": "google"}},
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user = {
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "providers": ["google"],
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


# NOTE: The unverified /auth/email/login and /auth/demo/login endpoints were removed
# (security: they issued a session for any email with no verification → account takeover).
# Email sign-in now requires the emailed code via /auth/email/verify.


# ------------------ Shared auth helpers ------------------
def _user_out(u: Dict[str, Any]) -> Dict[str, Any]:
    for k in ("created_at", "last_login"):
        if isinstance(u.get(k), datetime):
            u[k] = u[k].isoformat()
    return u


async def _upsert_user(email: str, name: Optional[str] = None, picture: Optional[str] = None,
                       provider: Optional[str] = None, apple_sub: Optional[str] = None) -> Dict[str, Any]:
    """Upsert a user by email — the single identity key so Google/Apple/email logins
    with the same address resolve to ONE account."""
    email = email.strip().lower()
    now = datetime.now(timezone.utc)
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        sets: Dict[str, Any] = {"last_login": now}
        # Never clobber an existing profile with a derived/partial one
        if name and not existing.get("name"):
            sets["name"] = name
        if picture and not existing.get("picture"):
            sets["picture"] = picture
        if apple_sub:
            sets["apple_sub"] = apple_sub
        update: Dict[str, Any] = {"$set": sets}
        if provider:
            update["$addToSet"] = {"providers": provider}
        await db.users.update_one({"user_id": user_id}, update)
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        doc: Dict[str, Any] = {
            "user_id": user_id,
            "email": email,
            "name": name or email.split("@")[0].title(),
            "picture": picture or "",
            "providers": [provider] if provider else [],
            "onboarded": False,
            "created_at": now,
            "last_login": now,
        }
        if apple_sub:
            doc["apple_sub"] = apple_sub
        await db.users.insert_one(dict(doc))
    return await db.users.find_one({"user_id": user_id}, {"_id": 0})


async def _new_session(user_id: str) -> str:
    token = f"sess_{uuid.uuid4().hex}"
    now = datetime.now(timezone.utc)
    await db.user_sessions.insert_one({
        "session_token": token,
        "user_id": user_id,
        "expires_at": now + timedelta(days=7),
        "created_at": now,
    })
    return token


# ------------------ Apple Sign-In ------------------
_apple_jwks = PyJWKClient("https://appleid.apple.com/auth/keys")


class AppleSessionRequest(BaseModel):
    identity_token: str
    full_name: Optional[str] = None


def _verify_apple_token(identity_token: str) -> Dict[str, Any]:
    signing_key = _apple_jwks.get_signing_key_from_jwt(identity_token)
    last_err: Exception = ValueError("audience check failed")
    # Accept the production bundle id; optionally allow Expo Go's client id in dev only
    # (APPLE_ALLOW_EXPO_GO=0 in production to reject non-release audiences).
    audiences = [APPLE_BUNDLE_ID]
    if APPLE_ALLOW_EXPO_GO:
        audiences.append("host.exp.Exponent")
    for aud in audiences:
        try:
            return _jwt.decode(
                identity_token, signing_key.key, algorithms=["RS256"],
                audience=aud, issuer="https://appleid.apple.com",
            )
        except _jwt.InvalidAudienceError as e:
            last_err = e
    raise last_err


@api_router.post("/auth/apple/session")
async def apple_session(payload: AppleSessionRequest):
    """Verify Apple identity token, link/create the account by email, return app session."""
    try:
        claims = await asyncio.to_thread(_verify_apple_token, payload.identity_token)
    except Exception as e:
        logger.warning(f"apple token verify failed: {e}")
        raise HTTPException(status_code=401, detail="Invalid Apple identity token")

    apple_sub = claims.get("sub")
    email = (claims.get("email") or "").strip().lower()
    if not email:
        # Apple only shares email on first authorization — fall back to sub lookup
        existing = await db.users.find_one({"apple_sub": apple_sub}, {"_id": 0})
        if not existing:
            raise HTTPException(status_code=400, detail="Apple didn't share your email. Please sign in with Google or email link first.")
        email = existing["email"]

    user = await _upsert_user(email, name=(payload.full_name or None), provider="apple", apple_sub=apple_sub)
    token = await _new_session(user["user_id"])
    return {"session_token": token, "user": _user_out(user)}


# ------------------ Email Magic Link (Resend) ------------------
class MagicRequestPayload(BaseModel):
    email: str


class MagicVerifyPayload(BaseModel):
    email: str
    code: str


async def _send_magic_email(email: str, code: str, link: str) -> bool:
    if not RESEND_API_KEY:
        return False
    html = f"""<!doctype html><html><body style="margin:0;background:#0A0A0A;padding:32px 16px;font-family:-apple-system,system-ui,sans-serif">
    <div style="max-width:440px;margin:0 auto;background:#141414;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:32px;text-align:center">
      <h1 style="color:#fff;font-size:20px;margin:0 0 6px">Muscle Map Ai</h1>
      <p style="color:#A1A1AA;font-size:14px;margin:0 0 24px">Use this code to sign in. It expires in 15 minutes.</p>
      <div style="background:#1C1C1C;border-radius:12px;padding:18px;margin-bottom:24px">
        <span style="color:#fff;font-size:32px;font-weight:700;letter-spacing:10px">{code}</span>
      </div>
      <a href="{link}" style="display:inline-block;background:#0A84FF;color:#fff;padding:14px 28px;border-radius:999px;text-decoration:none;font-weight:600;font-size:15px">Sign in with one tap</a>
      <p style="color:#71717A;font-size:12px;margin-top:24px">If you didn't request this, you can safely ignore this email.</p>
    </div></body></html>"""
    try:
        async with httpx.AsyncClient(timeout=15.0) as http:
            r = await http.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
                json={
                    "from": RESEND_SENDER,
                    "to": [email],
                    "subject": f"Your Muscle Map Ai login code: {code}",
                    "html": html,
                },
            )
        if r.status_code in (200, 201):
            return True
        # Log status only — avoid capturing recipient/PII from the provider body.
        logger.warning(f"resend send failed: HTTP {r.status_code}")
        return False
    except Exception as e:
        logger.warning(f"resend send error: {e}")
        return False


@api_router.post("/auth/email/request")
async def request_magic_link(payload: MagicRequestPayload):
    """Send a passwordless login code + magic link to the user's email."""
    email = payload.email.strip().lower()
    if not email or "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=400, detail="Please enter a valid email address")

    # Throttle: max 5 requests per email per 15 minutes (anti email-bomb / abuse)
    window_start = datetime.now(timezone.utc) - timedelta(minutes=15)
    recent = await db.magic_links.count_documents({"email": email, "created_at": {"$gte": window_start}})
    if recent >= 5:
        raise HTTPException(status_code=429, detail="Too many requests. Please wait a few minutes and try again.")

    code = f"{random.randint(0, 999999):06d}"
    token = uuid.uuid4().hex
    now = datetime.now(timezone.utc)
    await db.magic_links.delete_many({"email": email, "used": False})
    await db.magic_links.insert_one({
        "email": email,
        "code": code,
        "token": token,
        "used": False,
        "attempts": 0,
        "expires_at": now + timedelta(minutes=15),
        "created_at": now,
    })

    link = f"{PUBLIC_WEB_APP_URL}/api/auth/magic/{token}"
    sent = await _send_magic_email(email, code, link)
    resp: Dict[str, Any] = {"sent": sent}
    # SECURITY: only expose the code when Resend is NOT configured (local dev). Never
    # leak it in production, even on send failure — that would allow account takeover.
    if not sent and not RESEND_API_KEY:
        resp["dev_code"] = code
    return resp


async def _consume_magic_link(query: Dict[str, Any]) -> Dict[str, Any]:
    ml = await db.magic_links.find_one({**query, "used": False}, {"_id": 0})
    if not ml:
        raise HTTPException(status_code=401, detail="Invalid or expired code. Please request a new one.")
    expires_at = ml["expires_at"]
    if isinstance(expires_at, datetime) and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="That code has expired. Please request a new one.")
    await db.magic_links.update_one({"token": ml["token"]}, {"$set": {"used": True}})
    return ml


@api_router.post("/auth/email/verify")
async def verify_magic_code(payload: MagicVerifyPayload):
    email = payload.email.strip().lower()
    code = payload.code.strip()
    # Look up the active (unused, unexpired) link for this email, then check the code
    # with a bounded attempt counter to prevent brute-forcing the 6-digit code.
    ml = await db.magic_links.find_one({"email": email, "used": False}, {"_id": 0}, sort=[("created_at", -1)])
    if not ml:
        raise HTTPException(status_code=401, detail="Invalid or expired code. Please request a new one.")

    expires_at = ml["expires_at"]
    if isinstance(expires_at, datetime) and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="That code has expired. Please request a new one.")

    if ml.get("attempts", 0) >= 5:
        await db.magic_links.update_one({"token": ml["token"]}, {"$set": {"used": True}})
        raise HTTPException(status_code=429, detail="Too many attempts. Please request a new code.")

    if code != ml["code"]:
        await db.magic_links.update_one({"token": ml["token"]}, {"$inc": {"attempts": 1}})
        raise HTTPException(status_code=401, detail="Invalid code. Please try again.")

    await db.magic_links.update_one({"token": ml["token"]}, {"$set": {"used": True}})
    user = await _upsert_user(ml["email"], provider="email")
    token = await _new_session(user["user_id"])
    return {"session_token": token, "user": _user_out(user)}


@api_router.get("/auth/magic/{token}")
async def magic_link_open(token: str):
    """One-tap magic link target — creates a session and hands it to the app."""
    try:
        ml = await _consume_magic_link({"token": token})
    except HTTPException:
        html = """<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Muscle Map Ai</title>
        <style>body{background:#0A0A0A;color:#fff;font-family:-apple-system,system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
        .c{text-align:center;max-width:340px;padding:24px}h1{font-size:22px}p{color:#A1A1AA;line-height:1.5}</style></head>
        <body><div class="c"><h1>Link expired</h1><p>This sign-in link is invalid or has expired. Please open the app and request a new one.</p></div></body></html>"""
        return HTMLResponse(html, status_code=401)

    user = await _upsert_user(ml["email"], provider="email")
    session_token = await _new_session(user["user_id"])
    deep = f"{APP_SCHEME}://auth#session_token={session_token}"
    web = f"{PUBLIC_WEB_APP_URL}/?app_session={session_token}"
    html = f"""<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Muscle Map Ai</title>
    <style>body{{background:#0A0A0A;color:#fff;font-family:-apple-system,system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}}
    .c{{text-align:center;max-width:340px;padding:24px}}h1{{font-size:22px;margin:0 0 8px}}p{{color:#A1A1AA;line-height:1.5}}
    a{{display:inline-block;background:#0A84FF;color:#fff;padding:14px 24px;border-radius:999px;text-decoration:none;margin-top:14px;font-weight:600}}
    a.alt{{background:transparent;border:1px solid rgba(255,255,255,0.2)}}</style></head>
    <body><div class="c"><h1>You're signed in ✓</h1><p>Opening Muscle Map Ai…</p>
    <a href="{deep}">Open the app</a><br><a class="alt" href="{web}">Continue on web</a></div>
    <script>setTimeout(()=>window.location="{deep}",400);</script></body></html>"""
    return HTMLResponse(html)


# ------------------ RevenueCat entitlement sync (server-validated) ------------------
class RevenueCatSyncPayload(BaseModel):
    # Client hints are accepted but NOT trusted — entitlement is verified server-side
    # against the RevenueCat REST API using our secret key.
    is_premium: Optional[bool] = None
    product_id: Optional[str] = None
    expires_at: Optional[str] = None


async def _validate_revenuecat_entitlement(app_user_id: str) -> Dict[str, Any]:
    """Fetch the subscriber from RevenueCat and return the real 'premium' entitlement
    state. The app calls Purchases.logIn(user_id), so the RevenueCat app_user_id == our user_id.
    Returns {active: bool, product_id, expires_at}. Fails closed (active=False) on any error."""
    if not REVENUECAT_SECRET_KEY:
        return {"active": False, "product_id": None, "expires_at": None, "unconfigured": True}
    try:
        async with httpx.AsyncClient(timeout=15.0) as http:
            r = await http.get(
                f"https://api.revenuecat.com/v1/subscribers/{app_user_id}",
                headers={"Authorization": f"Bearer {REVENUECAT_SECRET_KEY}"},
            )
        if r.status_code != 200:
            logger.warning(f"revenuecat lookup {app_user_id} -> {r.status_code}")
            return {"active": False, "product_id": None, "expires_at": None}
        data = r.json()
        ent = (data.get("subscriber", {}).get("entitlements", {}) or {}).get("premium")
        if not ent:
            return {"active": False, "product_id": None, "expires_at": None}
        expires = ent.get("expires_date")  # ISO8601 or null (null = lifetime)
        active = True
        if expires:
            try:
                exp_dt = datetime.fromisoformat(expires.replace("Z", "+00:00"))
                active = exp_dt > datetime.now(timezone.utc)
            except Exception:
                active = True
        return {"active": active, "product_id": ent.get("product_identifier"), "expires_at": expires}
    except Exception as e:
        logger.warning(f"revenuecat validation error: {e}")
        return {"active": False, "product_id": None, "expires_at": None}


@api_router.post("/billing/revenuecat/sync")
async def revenuecat_sync(payload: RevenueCatSyncPayload, user=Depends(get_current_user)):
    """Validate the RevenueCat entitlement SERVER-SIDE and persist it. The client-sent
    is_premium is ignored — we ask RevenueCat directly for the truth."""
    result = await _validate_revenuecat_entitlement(user["user_id"])
    now = datetime.now(timezone.utc)
    if result["active"]:
        await db.subscriptions.update_one(
            {"user_id": user["user_id"], "source": "revenuecat"},
            {"$set": {
                "user_id": user["user_id"],
                "source": "revenuecat",
                "status": "active",
                "tier": "premium",
                "product_id": result["product_id"],
                "expires_at": result["expires_at"],
                "updated_at": now,
            }},
            upsert=True,
        )
    else:
        await db.subscriptions.update_many(
            {"user_id": user["user_id"], "source": "revenuecat", "status": "active"},
            {"$set": {"status": "inactive", "updated_at": now}},
        )
    sub = await db.subscriptions.find_one({"user_id": user["user_id"], "status": "active"}, {"_id": 0})
    return {"ok": True, "is_premium": sub is not None}



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


# ------------------ Subscription (RevenueCat only) ------------------
# NOTE: Stripe checkout/webhook/redirect and the dev mark-premium endpoint were removed.
# Payments go exclusively through RevenueCat (App Store / Play). Entitlements are
# validated server-side against the RevenueCat REST API — never trusted from the client.


@api_router.get("/billing/subscription")
async def get_subscription(user=Depends(get_current_user)):
    sub = await db.subscriptions.find_one({"user_id": user["user_id"]}, {"_id": 0}, sort=[("updated_at", -1)])
    if not sub:
        return {"status": "none", "tier": None}
    if isinstance(sub.get("updated_at"), datetime):
        sub["updated_at"] = sub["updated_at"].isoformat()
    return sub


@api_router.post("/billing/cancel")
async def cancel_subscription(user=Depends(get_current_user)):
    """Marks the RevenueCat subscription record inactive locally. The actual
    subscription is managed by the App Store; a later /billing/revenuecat/sync
    revalidates the real entitlement state from RevenueCat."""
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
    return {"app": "Muscle Map Ai", "ok": True}


# ------------------ Anatomy AI Coach (GPT-5.5) ------------------
ANATOMY_COACH_MODEL = "gpt-5.5"

COACH_SYSTEM = """You are 'Atlas', an expert anatomy & strength-training coach inside a 3D anatomy app.

You help users understand human musculoskeletal anatomy and how to train it. You are warm, clear and concise.

Guidelines:
- Explain anatomy in plain, conversational language; define jargon briefly.
- For training questions, give practical, evidence-based advice (progressive overload, technique cues, rep ranges, recovery).
- When relevant, mention which muscles a movement targets (origin/insertion/function) and antagonist pairs.
- Keep answers tight: usually 3-6 short sentences or a short bullet list. Avoid filler.
- Never give medical diagnoses; for pain/injury suggest seeing a professional.
- Stay on anatomy/fitness topics; politely redirect if asked something unrelated."""


class CoachMsg(BaseModel):
    role: str
    content: str


class CoachAskRequest(BaseModel):
    message: str
    history: Optional[List[CoachMsg]] = []
    context: Optional[str] = None


@api_router.post("/coach/ask")
async def coach_ask(payload: CoachAskRequest, user=Depends(get_current_user)):
    """Streaming anatomy/fitness coach. Requires auth + enforces a per-user daily
    quota to prevent LLM cost abuse (denial-of-wallet)."""
    # Per-user daily quota (prevents unbounded paid LLM calls). Premium = higher cap.
    today = datetime.now(timezone.utc).date().isoformat()
    sub = await db.subscriptions.find_one({"user_id": user["user_id"], "status": "active"}, {"_id": 0})
    daily_cap = 200 if sub else 40
    usage = await db.coach_ask_usage.find_one({"user_id": user["user_id"], "date": today}, {"_id": 0})
    used = usage.get("count", 0) if usage else 0
    if used >= daily_cap:
        limit_msg = "You have reached today's coaching limit. Please try again tomorrow."
        async def limited():
            yield f"data: {json.dumps({'delta': limit_msg})}\n\n"
            yield f"data: {json.dumps({'done': True, 'gated': True})}\n\n"
        return StreamingResponse(limited(), media_type="text/event-stream")
    await db.coach_ask_usage.update_one(
        {"user_id": user["user_id"], "date": today},
        {"$inc": {"count": 1}, "$setOnInsert": {"created_at": datetime.now(timezone.utc)}},
        upsert=True,
    )

    # Cap prompt size to bound token cost / abuse
    if payload.message and len(payload.message) > 2000:
        payload.message = payload.message[:2000]

    system_msg = COACH_SYSTEM
    if payload.context:
        system_msg += f"\n\nCURRENT CONTEXT: The user is currently looking at: {payload.context}. Tailor your answer to this if relevant."

    # Replay recent conversation as memory in the system prompt (last 8 turns).
    history = payload.history or []
    if history:
        convo = ""
        for m in history[-8:]:
            label = "USER" if m.role == "user" else "COACH"
            convo += f"\n{label}: {m.content}"
        system_msg += f"\n\nRECENT CONVERSATION (memory):{convo}"

    async def event_generator():
        full = ""
        last_err = None
        for attempt in range(2):
            try:
                chat = LlmChat(
                    api_key=EMERGENT_LLM_KEY,
                    session_id=f"atlas_{uuid.uuid4().hex[:10]}",
                    system_message=system_msg,
                ).with_model("openai", ANATOMY_COACH_MODEL)
                async for event in chat.stream_message(UserMessage(text=payload.message)):
                    if isinstance(event, TextDelta):
                        full += event.content
                        yield f"data: {json.dumps({'delta': event.content})}\n\n"
                    elif isinstance(event, StreamDone):
                        break
                if full.strip():
                    yield f"data: {json.dumps({'done': True})}\n\n"
                    return
                last_err = "empty response"
            except Exception as e:
                last_err = str(e)
                logger.warning(f"coach ask attempt {attempt + 1} failed: {e}")
                full = ""
                await asyncio.sleep(0.4 * (attempt + 1))
        logger.error(f"coach ask failed: {last_err}")
        yield f"data: {json.dumps({'failed': True})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


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
