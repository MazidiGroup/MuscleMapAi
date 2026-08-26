# Mac session handover — `claude/apple-watch-companion`

Written 26 Aug 2026. Read this plus `docs/apple-watch.md` before touching anything.

This is the **macOS half** of a two-machine split. A Windows Claude session owns the
TypeScript specification and the tests; this machine owns everything that can only be
verified with Xcode, a simulator or real hardware. The split is written out at the
bottom — respect it, because it is the reason the two sessions have not collided.

---

## 1. State in one paragraph

The Apple Watch companion was written on Windows and had never been compiled. It now
prebuilds, compiles, embeds, installs and runs on a paired iPhone + Watch simulator
pair, and the phone↔watch sync loop has been driven end to end many times. Four
plugin defects, a missing podspec, four wire/ordering bugs and one App Intents error
were found and fixed on this machine. Alongside that, several screens were redesigned
from mocks. **Nothing has been verified on physical hardware, and the branch has not
been opened as a PR.**

Branch is **46 commits ahead of `main`**, working tree clean, everything pushed.

---

## 2. Environment traps — these will bite a fresh Mac

| Trap | What happens | Fix |
| --- | --- | --- |
| `pod install` | dies in `unicode_normalize` | `export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8` |
| `corepack enable` | `EACCES` on `/usr/local/bin` (root-owned) | `corepack enable --install-directory <writable dir>` then put it on PATH. Never sudo. |
| watchOS platform | `-showsdks` lists the SDK **before** the platform is installed, so it lies | `xcodebuild -downloadPlatform watchOS` (3.96 GB) |
| `expo prebuild` | silently rewrites `package.json` scripts (`expo start --ios` → `expo run:ios`) | `git checkout -- frontend/package.json` after every prebuild |
| 40mm SE simulator | system shell crashes on app launch | unverified, not passing — say so |
| Nav wedge | taps die app-wide until relaunch | pre-existing `login.tsx:158` bug, see §6 |

Signing: team **`JWAX6S948T`** ("AIMAL MAZIDI"), not the older `G8WV8R4Y6W` cert in the
keychain. `xcodebuild ... CODE_SIGN_STYLE=Automatic DEVELOPMENT_TEAM=JWAX6S948T
-allowProvisioningUpdates` works headlessly.

Simulators in use: iPhone 17 Pro `C0F0001E-0A96-49B0-8324-4F98F19691D9`, Apple Watch
Series 11 46mm `AF897C52-2AB2-4068-BCAF-50CE01194CA4`, **paired** — check with
`xcrun simctl list pairs`, and re-pair with `simctl pair <watch> <phone>` if empty.

---

## 3. The release manifest — the rule that has bitten this repo three times

`frontend/release-source.manifest.json` SHA-256 hashes 21 pinned files.
`eas-build-pre-install` re-hashes them and hard-fails the build on any difference.

* **Regenerate on macOS only.** A Windows CRLF checkout produces hashes that fail on
  every Linux builder. This has already stranded the repo twice.
* **Regenerate LAST**, as its own commit, immediately before the PR merges. A manifest
  commit pushed *after* its PR merged never reaches main.
* Judge `verify-release-source.mjs` **only** by the line `source fingerprint matches
  (21 files)`. A non-zero exit outside a release-candidate checkout is correct and
  expected — that script is a full build gate, not a manifest checker.
* If the suite suddenly shows ~18 failures in the release-gate tests, the manifest is
  stale against the working tree. That is the signature, not a regression.

Current fingerprint: `b3568c59…`. **10 of the 21 pinned files differ from `main`.**

---

## 4. What was actually fixed here (the load-bearing history)

**Prebuild / build — `plugins/withWatchTarget.js`**

1. `addSourceFile` was given `"MuscleMapWatch/<file>"` but the path is relative to a
   group that already carries `path = MuscleMapWatch`, so all seven Swift files in the
   Sources phase resolved to nothing.
2. The group was seeded with the Swift files *and* had them added again — 15 children
   for 8 files.
3. `xcode`'s `addTargetDependency` hides its work behind
   `if (pbxContainerItemProxySection && pbxTargetDependencySection)` and returns
   silently when either is absent. A managed Expo project has neither, so the app→watch
   dependency was dropped in silence, leaving "Embed Watch Content" with nothing
   ordered before it. Both sections are now created before `addTarget`, and the
   dependency is **asserted** afterwards.
4. `modules/watch-link/ios/` had **no podspec**, so autolinking reported
   `WatchLinkModule` but no pod was installed and the class never reached
   `ExpoModulesProvider.swift` — a clean compile that fails at runtime on every call.

**Swift.** `@Parameter(inclusiveRange:)` on the `Int` `reps` was given a
`(Double, Double)` range, *and* the macro rejects non-literals — so the shared constant
cannot be named there. It reads `(1, 200)`, pinned to `MIN_REPS`/`MAX_REPS` in
`watchParity.test.ts`. The two `parameterSummary` errors were cascades of that one.
None of the other predicted risks (`MainActor.assumeIsolated`, `nonisolated`
conformance, `.digitalCrownRotation`, two-parameter `.onChange`, `Codable` for
`LastAction`) produced a single error against the watchOS 26.5 SDK.

**Wire and ordering — found by driving the real loop**

* `session: null` cannot cross WCSession: JS null arrives as NSNull and the serializer
  rejects the **whole** payload with `WCErrorCodePayloadUnsupportedTypes`, silently.
  The key is omitted instead.
* The module wrapped the envelope in `["envelope": …]` while `index.ts` documents the
  payload as the raw envelope — validation saw an unidentifiable object, produced an
  empty ack, and the watch retried the same events every 15 s forever.
* The ack handler's `push()` closed over **pre-apply** state and resolved after React
  had flushed the post-apply push, so the stale snapshot went out last and
  latest-wins handed the watch back the workout it had just ended.

**Simulator transport asymmetry (will NOT reproduce on hardware).** Phone→watch
`transferUserInfo` never delivers on this sim pair; only `updateApplicationContext` and
`sendMessage` do. That is the entire explanation for ack latency in every sim drill.
Do not chase it.

---

## 5. Design work done on this machine

All verified live on the simulators, all from supplied mocks:

* **Watch** — rebuilt around one dial (WEIGHT before a set, REST after), then made to
  fit **one non-scrolling screen**: Prev/Next became the chevrons flanking the exercise
  name, and Pause/Undo/End/sync moved one swipe left onto a Session page. Every height
  is derived from geometry, and the layout is inset 7.5% clear of the rounded display
  corners. `RestClock` gained `extended(by:now:)` and `withTotal(_:now:)` — ports of
  `restClock.ts`, which already specified both.
* **Today** — one hero card (what/how long/muscles/plan/action/week), a date strip that
  navigates, a NEXT row, week cards behind a disclosure, History+Insights merged.
* **Day view** — week strip, single card of rows, edit mode with per-row swap/delete,
  searchable add sheet. `planStore` gained `removeDayExercise`/`addDayExercise`.
* **Workout card** — timeline set rows (tap the badge to log, long-press to duplicate),
  warm-up chip removed, progression footnote replaced by a position rail.
* **Library** — Exercises now opens on routes in (Quick Access with real counts,
  Browse by facet, Recently viewed, Browse all A–Z); Muscles opens on an anatomy atlas
  with six region buttons.
* **Splash** — was drawing a navy box because `splash-image.png` is fully opaque;
  switched to `adaptive-icon.png`, which is already cut out, on the app's own `#0d0b0a`.

Two real bugs fell out of that work:

* `BodyDiagram` put gradient alpha inside `stopColor="rgba(...)"`, which
  react-native-svg ignores — the shading pass painted an **opaque white wash** over
  every muscle colour. Alpha now lives in `stopOpacity`.
* `exercises.d.ts` misdeclares `EXERCISES`: runtime rows carry compact keys (`m`, `eq`),
  not `muscle`/`equipment`. Resolve added entries through `planAdapter.entryFor`, never
  the raw library's.

---

## 6. Open items — start here

**Blocked on hardware**

1. **Physical watch pass.** Nothing in `docs/apple-watch.md` §"What to verify on
   hardware" has been done: six Siri phrases and their refusal paths, non-Premium Siri
   refusal, kg/lb (`100 kg` must store `220 lb`), the three offline/force-quit sync
   variants, mid-session entitlement lapse, haptics, VoiceOver. **Simulator runs are
   not sign-off for any of it.** Needs a Watch paired to the iPhone on the same network.

**Blocked on the Windows session**

2. **The sessionRef fix.** The gating measurement is done and the diagnosis confirmed:
   `receiveWatchEnvelope` takes its id from `sessionIdRef` but its contents from the
   `session` closure, so an envelope running before React re-renders reads a fresh
   ledger off disk and a stale session. Windows has the patch written. When it lands:
   cherry-pick, re-run the offline-end drill, and re-run the swap→delete→re-add day-view
   check in the same boot cycle (that recheck is still owed).
3. **`plannedSets` on the wire.** The watch cannot render "Set 3 **of 4**" — the
   planned set count is not in `SnapshotExercise`. Needs `protocol.ts` +
   `snapshot.ts` + a parity pin. One-line render change here once it exists.

**Decisions for the user**

4. **Task 3 — App Store Connect.** The App ID `com.mazidigroup.apexai.watchkitapp` **is
   registered** (explicit, team `JWAX6S948T`, done via the portal). Adding the watch app
   to the live ASC record and watch screenshots are **deliberately not done** and wait
   for physical testing.
5. **Branch untangling.** This branch sits on top of `claude/sheen-colour-and-spacing`
   (commits `e6155d3`, `6258945`), which was still unmerged at last check. Either the
   sheen PR merges first and this rebases, or accept one combined PR. Decide **before**
   opening the PR.
6. **Version bump.** `app.json` to 1.2.1 / build 4 (or whatever is chosen) plus the four
   pinned places — `release.test.ts`, `safetyCopy.test.ts`, `managedPipelineGate.test.ts`,
   and `EXPECTED_VERSION` in `verify-release-source.mjs` — in **one** commit, then one
   manifest regen covering everything, before the PR merges.
7. **`frontend/.env` is absent on this Mac** (gitignored, platform-injected elsewhere).
   `src/api.ts` falls back to `BASE_URL = ""`. A local backend was stood up for testing
   against `http://127.0.0.1:8001`; nothing about that is committed.
8. **Muscle detail sheet** — a third mock exists for it and was **not** built. Its
   frequency / recovery / set-volume figures (`2×/week`, `48–72 h`, `12–20`) do not
   exist in `MUSCLE_DATA`. Agree a data source before rendering them; do not hard-code.

**Known pre-existing bug, not this branch's**

9. **Nav wedge.** `login.tsx:158` calls `router.replace("/(tabs)/plan")` while
   AuthGate/OwnerGate have the Stack unmounted; the failed action wedges the navigator
   and every tap dies until relaunch. It has interrupted testing repeatedly. Should be
   fixed on its own branch — do not smuggle it into this one.

---

## 7. The two-machine split

**This machine (Mac) owns:** `targets/watch/*.swift`, `plugins/withWatchTarget.js`, the
native side of `modules/watch-link/`; prebuild, Xcode, simulators, physical devices,
device screenshots; **release-manifest regeneration, exclusively**; EAS / TestFlight /
App Store Connect; all layout and visual judgment.

**Windows owns:** `frontend/src/**` TypeScript including `src/watch/*.ts` and
`workoutStore.tsx`; `__tests__/**` and the logic suite; eslint/tsc on touched paths;
`backend/**`; `memory/PRD.md`; analysis and code review.

**Rules:** one branch, one owner at a time — `claude/apple-watch-companion` is the Mac's
while device debugging is live. Fetch before starting, push before handing back, never
rebase or force-push a shared branch. If either side touches one of the 21 pinned files,
that is a handoff to the Mac for a manifest regen before the PR merges.

---

## 8. Test baseline

`node scripts/run-logic-tests.mjs` from `frontend/`.

**450 tests / 449 pass / 1 fail.** The single failure is `cloudGateGitless` check D,
which fails **only** because `checkLocalWorkspace()` hardcodes
`/release-candidate\/frontend$/` against the real cwd. Run the suite from a
`git worktree` at a path ending `release-candidate/frontend` and it is **450/450**.
That has been confirmed repeatedly — it is the environmental baseline, not a defect.

Judge changes by the failing test **name set**, never the counts.
