# Performance Audit — MuscleMapAi frontend

**Date:** 2026-08-27 · **Author:** Claude (Mac session) · **Tree:** branch `claude/apple-watch-companion`, HEAD `75da0db` + ~16 uncommitted modified files (all measurements labelled with which state they measured).

This document is written to be actionable by any agent without access to the
originating session. Every claim carries an evidence class; do not upgrade a
claim's confidence without re-measuring.

---

## 1. Environment & methodology

| | |
|---|---|
| Device | iPhone 17 Pro (physical, `00008150-001E683111F0401C`), iOS 27.0 (24A5390f) |
| Build | 1.2.0 (3), **Release** configuration, Hermes bytecode (`main.jsbundle` embedded), arm64, local `xcodebuild` (team `JWAX6S948T`) |
| Tools | Instruments 16.0 via `xctrace`; server-side request counting via backend access log; simulator screenshots for render verification |
| Traces | `/tmp/launch1-3.trace`, `/tmp/hitch2-3.trace`, `/tmp/mem1-2.trace` on the Mac. **`/tmp` is cleared on reboot — re-run the protocol rather than relying on these.** |

**Evidence classes used throughout:**

- **[M]** Measured on the physical device in Release.
- **[S]** Structural — verified in source at the cited line, but never timed.
- **[P]** Projected — a fix landed after the measurement; expected effect stated, not yet re-measured.

**Known trap that produced wrong conclusions three times:** reasoning from
structure alone. Structural claims refuted by measurement this session:
"the 208-row list will jank while scrolling" (it held 60 fps), "the rest
timer re-renders the workout screen" (its tick is local state in a sibling),
"Explore runs a sustained RAF loop" (rendering is on-demand,
`engine.ts` bails when `pending <= 0`). Treat every [S] below accordingly.

---

## 2. Scoring rubric (deterministic — recompute after any change)

Start each screen at 100, subtract:

| Code | Condition | Deduction |
|---|---|---|
| D1 | Mount/appear hitch > 100 ms [M] | −25 (33–100 ms: −10) |
| D2 | Memory delta > 100 MB held while screen alive [M] | −20 (30–100 MB: −10) |
| D3 | Network burst > 50 requests on open [M] | −20 (20–50: −10) |
| D4 | Unvirtualized list that can exceed ~30 rows [S] | −10 |
| D5 | Sustained < 50 fps during interaction [M] | −20 |
| D6 | O(n²) render work in source [S] | −10 |
| D7 | Heavy one-off asset parse on first entry (cached after) [S] | −5 |

A screen with **no [M] evidence** may only carry [S] deductions and must be
tagged *provisional*. Never report a provisional score without the tag.

---

## 3. Cross-cutting measurements

### Launch [M] — healthy, no action

| Phase | Run A (cold) | Run B (warm) | Run C (current build, post-all-UI-work) |
|---|---|---|---|
| Process creation (OS-side) | 373.85 ms | 343.80 ms | 896.97 ms † |
| System framework init | 132.43 ms | 25.78 ms | 25.30 ms |
| Static runtime init | 6.36 ms | 18.54 ms | 17.13 ms |
| UIKit init | 11.38 ms | 18.06 ms | 20.70 ms |
| `didFinishLaunchingWithOptions` | 10.39 ms | 13.84 ms | 13.62 ms |
| Initial frame render | 2.70 ms | 3.33 ms | 3.65 ms |
| **Time to first frame** | **540 ms** | **427 ms** | **983 ms †** |

† Run C's inflation is entirely in *process creation*, which is OS scheduling
before any app code runs (the app was relaunched twice in quick succession).
The app-controlled phases (~60 ms total) are unchanged across all three runs,
i.e. **six rounds of UI changes did not regress launch**. Caveat: TTFF is the
splash, **not** time-to-interactive — RN evaluates JS after first frame. TTI
was never measured (needs JS-side marks; see §6).

### Memory baseline [M]

Idle on Today (pre-watch-card build): **42.03 MiB** footprint, 106 threads.
Not yet re-measured with the watch-promo SVG card (phone locked mid-attempt);
expected impact negligible (pure vector, no image assets).

---

## 4. Per-screen scores

Post-fix state of the current tree. "Pre" = measured before this session's fixes.

| Screen (file) | Score | Class | Deductions & evidence |
|---|---|---|---|
| **Library — flat list** (`app/(tabs)/library.tsx:449` FlatList) | **75 → verify** | [P] | Pre-fix [M]: 25 (D1 200.03 ms hitch flagged "expensive app update(s)"; D2 +312 MB, 354 vs 42 MiB; D3 208 GETs in one burst; D4). Post-fix: D3/D4 cleared **by construction** (`initialNumToRender=12`, virtualization confirmed active — 0 RN nesting warnings in device log); D1/D2 projected cleared, unmeasured. Re-measure to convert to [M]; expected 85–95. |
| Library — hub | 90 | [S] | Fixed small blocks; no long lists. |
| Coach (`app/(tabs)/coach.tsx`) | 80 | [S] provisional | D4 −10: `messages.map` in a plain ScrollView, unbounded (`:242`); mitigated by memoized `MessageBubble` + per-message `useMemo` link parsing (D6 cleared this session; `busy` reaches only the last bubble). **Never measured end-to-end** — local LLM is a stub. Messages don't persist across sessions, capping n in practice. |
| Today (`src/plan/PlanViews.tsx`) | 90 | [S] | Small fixed blocks; SVG BodyDiagram + new watch mock (pure vector). |
| Workout (`app/(tabs)/workout.tsx`) | 85 | [S] | Per-session lists are small. RestTimer's 500 ms tick is **local state in a sibling** (`RestTimer.tsx:97,118`; mounted at `workout.tsx:245`) — blast radius one component, previously misdiagnosed. |
| Summary / post-workout (`app/summary.tsx`) | 88 | [S] | 3D viewer removed this session; SVG ring; bounded exercise list. |
| History (`src/history/HistoryView.tsx`) | 85 | [S] | Bounded to one week + 42 calendar cells. |
| Insights (`src/anatomy/InsightsView.tsx`) | 70 | [S] provisional | D7 −5 (3D on entry, parse cached); charts bounded (≤12 bars). One ambiguous [M] memory sample (354 MiB) could not be attributed — taken while Library was also mounted. |
| Explore (`app/(tabs)/explore.tsx`) | 78 | [M partial] | **0 hitches in 45 s of rotate/zoom.** D7 −5 (3.5 MB GLB, parsed once per app session, `modelCache.ts`). Low FPS readings (median 3) are *frames produced on demand*, not dropped frames — do not misread. New Body-layers panel & preview muscle sheet are lightweight [S]. |
| Exercise detail (`app/exercise/[id].tsx`) | 70 | [S] provisional | 3D viewer + video + poster co-mounted; D7 −5 and likely the heaviest single push after Library; unmeasured. |
| Lesson (`app/lesson/[id].tsx`) | 75 | [S] provisional | 3D viewer; D7 −5. |
| Paywall (`src/premium/Paywall.tsx`) | 90 | [S] | Static; whole offer verified to fit one screen (simulator screenshot). Floating dock removed (it hid two of three plan options — a UX bug, found via screenshot verification). |
| Learn / login / terms / privacy / references / watch | 90–95 | [S] | Static or tiny fixed lists. |

**Unscorable:** render counts and TTI (need JS instrumentation, ruled out of
scope); Coach under a real 50+ message conversation (needs real backend LLM).

---

## 5. Fixes already landed (uncommitted — in working tree)

1. **Library virtualization** — list is a `FlatList` that OWNS the scroll;
   search/filter header moved to `ListHeaderComponent`; `ExerciseRow` is
   `React.memo`. Settings: `initialNumToRender=12, maxToRenderPerBatch=10,
   windowSize=7, removeClippedSubviews`. Verified: device log has **zero**
   "VirtualizedLists should never be nested" warnings (the failure mode is
   silent un-virtualization — always check this).
2. **Coach memoization** — `MessageBubble` memoized; URL-regex parse behind
   `useMemo`; streaming token no longer re-renders prior messages.
3. **Deliberately NOT done: workout-context split.** 29-dep context value
   (`workoutStore.tsx:835`), 11 consumers — but tabs are `lazy` +
   `freezeOnBlur` + `detachInactiveScreens`, so blurred screens don't
   re-render. Do not refactor core session state on inferred evidence.

---

## 6. Improvement path (ordered; stop when evidence runs out)

1. **Re-measure Library** (converts the 75 [P] to [M]; ~60 s of user
   interaction). Protocol in §7. Targets: <30 requests on open, no hitch
   >100 ms, <100 MiB, 60 fps retained. Baseline: 208 / 200 ms / 354 MiB.
2. **Remove the drill instrumentation** from `src/anatomy/workoutStore.tsx`
   (marked `DRILL INSTRUMENTATION`, uncommitted, **no `__DEV__` guard**,
   O(n²) file I/O per watch envelope). It is in every local build. The
   release-source gate catches it by fingerprint, but only for EAS builds —
   local `xcodebuild` bypasses the gate. Remove only after the watch
   data-loss re-drill completes (coordinated with the Windows session, which
   holds a `sessionRef` fix).
3. **Measure Coach against the real backend** with a 50+ message
   conversation before any further work there. If it degrades: virtualize
   past ~50 messages. Do not pre-optimize.
4. **Exercise detail:** consider deferring the 3D viewer mount until below-fold
   visibility or first interaction. Measure first (§7 pattern, 25 s attach).
5. **TTI marks** (JS `performance.mark` at hydration/first-interactive) if
   launch feel ever becomes a complaint — TTFF numbers here cannot answer it.
6. **Context split (last, evidence-gated):** only with a profiler trace
   showing focused-screen re-render cost. High regression risk in core
   session state.

---

## 7. Re-measurement protocol (verbatim, comparable to baseline)

```bash
# Hitches + FPS while the user scrolls the target screen (~15 MB trace):
xcrun xctrace record --device <UDID> \
  --instrument 'Hitches' --instrument 'Core Animation FPS' \
  --attach "Muscle Map" --output /tmp/after.trace --time-limit 60s

# Memory (10 s attach):
xcrun xctrace record --device <UDID> --instrument 'Activity Monitor' \
  --attach "Muscle Map" --output /tmp/mem.trace --time-limit 10s

# Launch:
xcrun xctrace record --device <UDID> --template 'App Launch' \
  --launch com.mazidigroup.apexai --output /tmp/launch.trace --time-limit 15s

# Requests, server-side (backend access log):
grep -c "GET /api/exercise-media/" <backend log>

# Export tables: xcrun xctrace export --input <t> --toc  (then --xpath per schema:
#   life-cycle-period, hitches, core-animation-fps-estimate, sysmon-process)
```

---

## 8. Avoidance list — hard-won, do not rediscover these

1. **Never run the `Animation Hitches` *template* attached for a long
   window.** It bundles Time Profiler + system tracing: a 180 s attach
   produced an **8.8 GB** runaway trace and nearly filled the disk. Use the
   two individual instruments above (60 s ≈ 15 MB).
2. **Never nest a `FlatList` inside a `ScrollView`.** It un-virtualizes
   *silently*. After any Library restructure, verify: device log must contain
   zero "VirtualizedLists should never be nested" warnings.
3. **A string in `main.jsbundle` is not proof it renders.** The paywall
   header "fix" shipped compiled-but-dead once because `PremiumGate` passed
   overriding props. Verify on screen (simulator screenshot) or at the call
   site.
4. **FPS ≠ jank.** The FPS instrument counts frames *produced*; an idle or
   on-demand-rendering screen (Explore) legitimately reads 0–10 fps. Only
   the Hitches table proves dropped frames.
5. **Do not edit release-critical files casually.** `app/(tabs)/library.tsx`
   and `src/anatomy/workoutStore.tsx` are fingerprint-pinned; every edit
   requires `node scripts/generate-release-manifest.mjs` or 18 tests fail.
   **Never regenerate the manifest on Windows** (CRLF corrupts hashes).
6. **`ExerciseAnimation` thumbs fire a network request on mount by design**
   (`ExerciseAnimation.tsx:99`). Any new screen that maps it over a large
   collection outside a virtualized list recreates the Library bug.
7. **Don't optimize from structure.** Three structural predictions were
   wrong this session (§1). Cheapest truth: 60 s of `xctrace` beats an hour
   of reading.
8. **Suite baseline is 449/450** (`node scripts/run-logic-tests.mjs`); the
   one failure (`cloudGateGitless` "D — local mode…") is a pre-existing
   dirty-tree artifact. 448 or 18 failures means *you* broke something (18 ⇒
   stale manifest). There is no `yarn test`.
9. **Watch-item (unverified):** `GlassSurface`/`LiquidSheen` render blur/
   gradient layers per instance; repeated >20× per screen they are a
   plausible cost. Not measured — measure before acting.

---

## 9. Open items owned elsewhere

- **Watch offline-set data-loss bug** — unresolved, gates release; the
  discriminating re-drill (device/simulator, Mac-only) never ran; Windows
  session holds a written `sessionRef` fix pending the trace.
- **~16 modified files uncommitted** on `claude/apple-watch-companion` at the
  time of writing, spanning all the redesigns + both perf fixes. Largest
  standing risk in the repo: commit before further large edits.
