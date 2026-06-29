# Apex AI — V1.1 (Iteration 2)

## What changed in this iteration
This iteration delivered the 7 priority fixes from user feedback.

### Priority 1 — AI Coach Reliability ✅
- Backend `/coach/chat` now retries Claude up to 3 attempts with exponential backoff (0.4s, 0.8s, 1.2s).
- On total failure, emits `{failed: true}` (never raw API errors).
- Free users gated at 5 chats/day with `{gated: true}` → frontend shows in-bubble upgrade button.
- Frontend Coach screen shows animated **ThinkingDots** (pulsing 3 dots) while waiting for first token.
- On failure shows friendly message + **Retry** button; never exposes raw API errors.
- Session memory: backend includes last 8 conversation turns in system context (RECENT CONVERSATION block).

### Priority 2 — Weekly Workout Planner ✅
- New `GET /api/plan/week` returns 7-day Mon..Sun timeline with status: today / completed / missed / upcoming / rest.
- Includes `exercise_count` and `workout_id` per day.
- New **WeeklyPlanner** component (horizontal scrollable, chip row never wraps).
- Today highlighted with electric blue glow; missed = red dot; completed = green checkmark.
- Visible on both **Home** (`home-weekly-planner`) and **Progress** (`progress-weekly-planner`).
- Tapping a day opens that workout (if completed) or starts today's session.

### Priority 3 — Premium Feature Gating ✅
- `/auth/me` now returns `is_premium`, `subscription_tier`, `subscription_interval`.
- **Free users** get:
  - 5 AI Coach chats/day, basic logging, top 3 PRs
- **Premium unlocks**:
  - Unlimited AI Coach
  - Weekly Coach Report (locked screen with **PremiumLock** card for free users)
  - Full PR & history dashboard
  - All progressive overload + recovery insights
  - Coach header shows "Premium · Unlimited"
- New **PremiumLock** component for elegant upgrade prompts.

### Priority 4 — Authentication ✅
- Google Sign-In via Emergent Auth (already worked; persistent sessions stored via secure storage).
- Apple Sign-In button (routes via Google in V1 sandbox; ready for native build).
- Email passwordless (V1 sandbox).
- Demo account for instant access.
- 7-day session expiry with auto-renewal on `/auth/me` calls.

### Priority 5 — Payment System ✅
- Monthly £9.99 + **Annual £79.99 (SAVE 33% badge)** with toggle on Subscribe screen.
- `/billing/create-checkout` accepts `interval: 'month' | 'year'`.
- `/billing/cancel` and `/billing/restore` endpoints.
- Profile shows **Cancel subscription** row for premium users.
- Restore Purchases button on Subscribe screen.
- Subscription status returned from `/auth/me` for entitlement checks.

### Priority 6 — AI Memory ✅
- Coach prompt now includes:
  - User profile (goal, experience, frequency, equipment, injuries, units, streak)
  - Last 10 completed workouts with top set per exercise
  - **Last 8 conversation turns** (NEW — true memory across messages)
  - Active plan name
- Claude references this naturally: "I see your bench has stalled…" / "Given your shoulder note from earlier…"

### Priority 7 — Polish ✅
- **SkeletonHomeScreen** with shimmering loading state.
- **ThinkingDots** animated reanimated component for coach.
- All raw API errors removed from UI — friendly fallback strings only.
- Coach input shows "Coach is thinking…" placeholder while streaming.

## Backend test coverage
**28/28 passing** in `/app/backend/tests/test_apex_backend.py` (auth, onboarding, plan/week, workouts, log-set, complete, progress, coach SSE+retry+gating+memory, billing checkout/cancel/restore/dev-mark-premium with intervals).

## Mocked / Sandbox notes
- Stripe checkout MOCKED in sandbox (placeholder STRIPE_API_KEY). Frontend automatically falls back to `/api/billing/dev/mark-premium` which now also accepts `interval`.
- Apple Sign-In is shown but routes through Google in V1 (real native Apple Sign-In needs build + Apple Dev config).
