# Apex AI — V1.2 (Iteration 3 · Body Intelligence)

## NEW: 3D Body Intelligence Tab

The **core unique feature** of Apex AI — a beautiful anatomical body visualisation with AI-powered muscle balance tracking.

### What was built
- **New `/body` tab** in the bottom navigation (between Coach and Progress).
- **Anatomical SVG body diagram** (`BodyDiagram.tsx`) — rendered as detailed muscle polygons (pecs, delts, biceps, triceps, abs, obliques, quads, hamstrings, glutes, calves, lats, traps, lower-back, forearms).
- **Front / Back / Side view toggle** — three view buttons on the right.
- **Colour-coded muscle status**: 🟢 Green (≥70% activation) · 🟡 Yellow (35-69%) · 🔴 Red (<35%).
- **Overall Muscle Balance** percentage + progress bar + dynamic label ("Excellent / Good / Imbalanced / Get training").
- **Muscle Groups panel** — all 9 canonical groups (Chest, Back, Shoulders, Arms, Core, Glutes, Quads, Hamstrings, Calves) with progress bars coloured by status.
- **Muscle Balance Over Time chart** — 8-week SVG line graph with Improvement / Streak / Progress rating below.
- **Last Workout Impact** — front + back body thumbnails highlighting primary (green) and secondary (yellow) muscles of the last logged workout.
- **AI Muscle Focus Recommendation card** — lists lagging muscles with VERY LOW / LOW status tags + **"Generate focus workout" button** that creates a workout targeting weak areas and opens it immediately.
- **Muscle Detail Modal** (bottom sheet) — opens when user taps a muscle on the body or in the list. Shows front+back mini diagrams of that muscle, activation %, ideal range (e.g. "9–14 sets/week"), AI coach tip, and 3 suggested exercises (tap → exercise detail).

### Backend endpoints
| Endpoint | Purpose |
|---|---|
| `GET /api/body/intelligence` | Current muscle activation map + lagging + last workout impact |
| `GET /api/body/trend` | 8-week balance score + improvement + streak + rating |
| `GET /api/body/muscle/{group_id}` | Muscle detail (activation, ideal range, AI tip, 3 suggested exercises) |
| `POST /api/body/generate-focus-workout` | Creates workout targeting lagging muscles + returns `workout_id` |

### Activation math
- Counts sets completed per muscle group (last 7 days) vs `IDEAL_WEEKLY_SETS` (industry hypertrophy targets: chest 14, back 16, shoulders 14, arms 12, core 10, glutes 12, quads 14, hamstrings 12, calves 10).
- `activation_pct = min(100, sets_done / ideal * 100)`.
- `balance_pct = avg(all groups) - (red_groups × 5)` (penalises imbalance).

### Bug fixes in this iteration
- Fixed `/coach/today-insight` 500 error on `DuplicateKeyError` (concurrent home loads).
- Fixed React duplicate-key warning in workout screen when generated focus workout had duplicate exercises (now uses `${exercise_id}-${idx}`).
- Added `Abs` → `core` muscle mapping.
- Added `Seated Calf Raise` and `Single-Leg Calf Raise` to exercise library so every muscle group has ≥3 suggested exercises.

### Testing
- **Backend**: 14/14 new tests + 28/28 regression all PASS.
- **Frontend**: All 13 priority test IDs verified on real preview (body-screen, body-legend, body-diagram, view-front/back/side, overall-balance, muscle-groups-panel, balance-chart, focus-recommendation, generate-focus-workout-btn, muscle-detail-modal, group-row-*).
- End-to-end: demo login → onboarding → tab-body → tap muscle → modal opens → tap exercise → exercise detail. Generate focus workout creates new workout and navigates correctly.

## Carry-over from earlier iterations
(See V1.1 PRD for full details on AI Coach retry/memory, weekly planner, premium gating, monthly/annual subscription, etc.)

## Mocked / sandbox notes
- Stripe checkout still placeholder; UI falls back to `dev/mark-premium`.
- Body diagram is rendered via SVG (industry-standard for fitness apps). True WebGL 3D would need a custom GLB anatomy model and offer no UX benefit at V1.

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
