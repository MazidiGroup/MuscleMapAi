# Apex AI — AI Gym Companion (PRD)

## Vision
A premium, minimal, AI-powered gym companion that feels like a combination of Apple Fitness, Linear, Notion, and a real personal trainer. The AI Coach is the core differentiator — it learns the user over time and adapts training automatically.

## Tech Stack
- **Frontend**: Expo (React Native + Expo Router), TypeScript, dark-first matte black UI with electric blue accent.
- **Backend**: FastAPI (Python), MongoDB (motor async driver).
- **AI**: Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`) via `emergentintegrations` LlmChat with SSE streaming.
- **Payments**: Stripe Checkout (subscription mode, £9.99/month GBP). Dev fallback (`/api/billing/dev/mark-premium`) used in sandbox when Stripe placeholder key is in use.
- **Auth**: Emergent-managed Google OAuth (deep-link `apexai://` for mobile, hash fragment for web) + Passwordless email login (V1 sandbox) + Demo account.

## V1 Feature Set
### Auth & Onboarding
- Apple / Google / Email / Demo sign-in buttons on login screen.
- 5-step onboarding: goal → experience → frequency → equipment → injuries.
- Plan generation: rule-based template (4-day Upper/Lower or 3-day Full Body) tailored to user's equipment & experience.

### Home Dashboard
- Personalised greeting + day/date.
- Daily AI Insight card (Claude-generated, cached per day).
- Today's workout card with hero image, name, muscle focus, and one-tap "Start workout" CTA.
- Rest day card (shows next workout).
- Stats row (week count, all-time, recovery).
- AI Coach shortcut + Weekly Coach Report link.

### AI Coach (Chat)
- Streamed Claude Sonnet 4.5 responses via SSE.
- System prompt enriched with user profile, recent 10 workouts, plan name, streak, injuries.
- Pre-canned suggestion chips ("I only have 30 minutes", "My shoulder hurts", etc.).
- Full message history persisted in MongoDB.

### Workout Execution
- One-tap set logging.
- Weight stepper (±2.5kg) and reps stepper (±1).
- Auto-suggested weight from previous best.
- Rest timer (90s auto-start after each set, haptic on finish).
- Live elapsed timer.
- Per-set pill view + per-exercise progress.
- Tap exercise info → exercise detail screen.
- Finish workout → updates streak.

### Exercise Detail
- Hero image with category & muscles worked.
- Coach Tips (positive bullets).
- Common Mistakes (negative bullets).
- AI Tip callout card.
- Equipment & category meta.

### Progress
- Total workouts, week count, streak, PR count.
- Personal Records list (top 10).
- Strength trend sparklines (last 4 exercises with data).

### Weekly Coach Report
- AI-generated JSON (highlights, weak_points, recovery, next_week).
- Big hero workout count.

### Subscription (£9.99/month)
- Beautiful paywall with hero blur background.
- Perks list (Unlimited AI, Adaptive plans, Insights, Recovery, Nutrition coming soon).
- Stripe Checkout integration (dev fallback for sandbox).

### Profile
- Avatar, name, email, premium badge.
- Plan summary (goal, experience, frequency, equipment).
- Upgrade card (if free).
- Redo onboarding / weekly report / sign out actions.

## API Endpoints
- `POST /api/auth/google/session` — exchange Emergent session token.
- `POST /api/auth/email/login` — passwordless email V1.
- `POST /api/auth/demo/login` — instant demo user.
- `GET /api/auth/me` — current user.
- `POST /api/auth/logout`.
- `POST /api/onboarding`.
- `GET /api/plan/active`.
- `GET /api/workouts/today`, `/api/workouts/{id}`, `/api/workouts/history`.
- `POST /api/workouts/start`, `/api/workouts/log-set`, `/api/workouts/complete`.
- `GET /api/progress/summary`.
- `POST /api/coach/chat` (SSE), `/api/coach/today-insight`, `/api/coach/weekly-report`.
- `GET /api/coach/messages`.
- `POST /api/billing/create-checkout`, `/api/billing/webhook`, `/api/billing/dev/mark-premium`.
- `GET /api/billing/subscription`.
- `GET /api/exercises`, `/api/exercises/{id}`.

## Mocked / Sandbox Notes
- **STRIPE checkout is MOCKED in sandbox**: placeholder `sk_test_emergent` key returns 401 from real Stripe. Subscribe screen falls back to `/api/billing/dev/mark-premium` so the user can complete the premium flow end-to-end for V1 preview. Replace `STRIPE_API_KEY` with a real test/live key to enable production checkout.
- **Apple Sign-In** is shown as a button on the login screen but currently routes through Emergent Google OAuth in V1 (native Apple Sign-In requires a development build + Apple Developer config).

## Out of V1 Scope
- Social, gamification, form-analysis AI, wearable integrations, nutrition tracking, community feed.
