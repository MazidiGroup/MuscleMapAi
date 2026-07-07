# Fitness Anatomy Trainer — V1 (3D Écorché)

A mobile + web 3D skeletal & muscular anatomy learning app. Replaced the previous "Apex AI"
fitness coach. Built with Expo + expo-gl + three.js (WebGL), FastAPI backend serving the model.

## The 3D model
- Source: user-supplied `Ecorche_by_AlexLashko.fbx` (binary FBX, 4.78MB).
- Converted FBX → GLB with `assimp export` (preserves hierarchy + morph targets).
- Result: `ecorche.glb` (5.6MB) — **270 named anatomical objects** (skeleton + every major muscle),
  **79 morph targets** (the "Shrunken Muscle View"), 1 animation, 3 base materials.
- No 8K textures were bundled in the FBX → all colouring is **programmatic / engine-driven**.
- Served from backend: `GET /api/anatomy/model` (FileResponse, `model/gltf-binary`).
  Stored at `/app/backend/static/models/ecorche.glb`.

## Architecture
- `src/anatomy/engine.ts` — three.js engine. Binds `THREE.WebGLRenderer` directly to the
  expo-gl context via a minimal fake canvas (version-independent; avoids expo-three which pins three ^0.166).
  Handles spherical orbit camera, per-mesh material recolour, visibility (hide/isolate),
  morph-target scrub, and raycast picking.
- `src/anatomy/AnatomyViewer.tsx` — GLView + PanResponder (drag=rotate, pinch=zoom+pan,
  tap=raycast select) + on-screen zoom/reset buttons. Caches the downloaded GLB buffer across mounts.
- `src/anatomy/groups.ts` — explorer hierarchy (containers: Bones_*, Muscles_*) + gym muscle groups + name prettifier.
- `src/anatomy/muscleData.ts` — curated DB for ~35 key gym muscles (function/origin/insertion/antagonist/exercises).
- `src/anatomy/exercises.ts` — 32 exercises mapped to primary/secondary muscle node names.
- `src/anatomy/MuscleSheet.tsx`, `ScrubSlider.tsx`, `ui.ts` — shared UI.

## Screens (tabs: Explore · Workout · Muscle Info · Settings)
- **Explore** — full-screen 3D viewer. Tap a muscle → detail sheet. "Layers" panel = hierarchical
  explorer (tap region to isolate+frame, eye toggle to hide a whole system, long-press chip to hide a region,
  Show Full Body to reset). "Shrink View" panel = morph scrub slider + Normal/Fully-Shrunken buttons.
- **Workout** — viewer in workout mode; pick an exercise (Push/Pull/Legs/Core) → primary muscles glow red,
  secondary amber, rest dimmed; shows cue + muscle chips.
- **Muscle Info** — searchable reference grouped by gym group → tap opens MuscleSheet modal.
- **Settings** — about the model + how-to-use.

## Testing
- Backend 4/4 pass (`tests/test_anatomy_backend.py`): model 200 + valid glTF magic + 404 for bad path.
- Frontend (iteration_4.json): all flows pass on web — load/render, controls, layers isolate/hide,
  shrink morph, workout highlight, info search+modal, settings.

## Status / Notes
- Validated on **web** (WebGL). On Expo Go mobile, 3D performance is limited; full smoothness needs a device build.
- Old Apex AI endpoints (auth/coach/workout/billing) still exist in `server.py` but are unused.

## Backlog (per user phase plan)
- Phase 4: Learning Mode (guided anatomy lessons + quizzes).
- Phase 5: AI Coach (exercise recommendations, muscle explanations) — would use Emergent LLM key.
- Native mobile optimisation pass + TextDecoder polyfill for GLB parse on native.
- Trim unused Apex AI code from server.py.

## V1.1 — Premium Muscle Page + Draggable Sheet (iteration 6)
- Explore muscle detail is now a DRAGGABLE bottom sheet (`src/anatomy/DraggableSheet.tsx`): swipe up to expand, down to collapse; auto-expands on muscle tap.
- Redesigned `MuscleSheet.tsx` keeps ALL anatomy (Function/Origin/Insertion/Antagonist in a collapsible card) and adds: beginner Summary line, **Gym Guide** (purpose + Frequency/Recovery/Weekly-Volume stats + Strength/Hypertrophy/Endurance rep ranges), **Common Mistakes**, **Coach Tips**, redesigned **Exercise cards** (rating/difficulty/equipment) that expand to show **Muscle Contribution** bars, and an **AI Coach Insight** card.
- Coaching data in `src/anatomy/gymGuide.ts` (per-group guide, mistakes, tips, muscle summaries, exercise meta).
- AI Insight calls GPT-5.5 (`/api/coach/ask`) with a graceful static fallback (currently used because the Emergent key budget is capped).
- Tested: iteration_6.json — 8/8 flows pass.

## V1.2 — Workout Tracker + button fix (iteration 7)
- BUG FIX: 3D viewer zoom +/-/reset buttons were under the status bar (top "+" untappable). Now offset by safe-area inset (top: insets.top+64) in AnatomyViewer — tappable on Explore & Workout.
- Workout tab rebuilt into a tracker: 3 segments — **Exercises** (3D + draggable sheet + category chips All/Push/Pull/Legs/Core/Upper/Lower + exercise list), **Session** (set logging: weight/reps, add/duplicate/delete, mark done, rest timer 30/60/90/120 with pause/skip, live duration + stats bar, finish), **History** (list, reopen).
- `app/exercise/[id].tsx` exercise detail (3D highlight + instructions + Start Workout).
- `app/summary.tsx` post-workout summary (stats, PR badges, 3D muscle-activation % bars).
- `src/anatomy/workoutStore.tsx` (Context + AsyncStorage persistence for history, PRs, rest pref), `RestTimer.tsx`. WorkoutProvider wraps the app in `_layout.tsx`.
- Tested iteration_7.json: 7/7 flows pass, bug fix confirmed.
- DEFERRED (not yet built): calendar view, search/advanced filters in history, analytics charts (volume/1RM progression), muscle recovery heatmap (green/orange/red), weekly muscle-activation dashboard. RPE/duration/distance fields for cardio.

## V1.3 — Authentication + Account-linked Subscriptions (iteration 11, June 2026)
- Login-first flow: app gated behind auth (`AuthGate` in `app/_layout.tsx`); `/login` + `/privacy` are the only public routes.
- Sign-in methods: Google (Emergent-managed OAuth), Apple (expo-apple-authentication, iOS native builds only, `usesAppleSignIn` in app.json), passwordless email code + one-tap magic link via Resend (LIVE since June 2026 — sender "Apex AI <login@mazidigroup.com>", key in backend/.env; on send failure the API returns dev_code so login is never blocked).
- Account linking by email: one users doc per email regardless of provider (`_upsert_user` in server.py); `providers` array + `apple_sub` stored.
- Sessions: 7-day tokens in `user_sessions` (TTL index), stored via expo-secure-store (native) / localStorage (web), key `apex.session_token`.
- RevenueCat: after sign-in `Purchases.logIn(user_id)` (iOS) then POST /api/billing/revenuecat/sync upserts `subscriptions` (source: revenuecat) → `/api/auth/me` returns `is_premium`.
- Logout: Library tab → Account section.
- Key endpoints: POST /api/auth/email/request|verify, GET /api/auth/magic/{token}, POST /api/auth/apple/session, POST /api/auth/google/session, GET /api/auth/me, POST /api/auth/logout, POST /api/billing/revenuecat/sync.
- Files: src/auth/AuthContext.tsx, app/login.tsx, app/auth.tsx (deep-link landing).
- Tested: iteration_11.json — 15/15 backend, all frontend flows pass.
- PENDING FROM USER: Apple "Sign in with Apple" capability on App ID; validate Apple + RevenueCat login on TestFlight build.
