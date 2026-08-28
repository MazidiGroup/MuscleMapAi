# Handover — Apple Watch companion and watch frame packs

State of `claude/apple-watch-companion` as handed over. Read
`plan-generation.md` and `user-facing-logic.md` alongside this; they describe
the decision logic this branch touches.

---

## What is finished and verified on a physical device

The Apple Watch companion works end to end on a paired Series 6 (watchOS 26.6):
the watch receives the workout, logs sets, syncs them back, and its set counter
no longer moves backwards. Confirmed by the repo owner on the wrist, not only
in a simulator.

**Five watch defects fixed.** The one worth knowing about first: `Int` is 32
bits on `arm64_32`, the ABI every Apple Watch uses. Two separate crashes and one
total-silence bug all came from that — the context decode threw on a
`now * 1000` revision and `try?` discarded the entire payload including the
entitlement, `IdMint` trapped on the first set logged from the wrist, and the
animation's frame index trapped on a raw tick count. **Check every Int
conversion on the watch side.** Take the remainder before narrowing.

**Two phone-side data bugs.** `receiveWatchEnvelope` ran twice against the same
closure-captured session (the watch sends every batch twice by design), and the
second run wrote its stale copy back over the first — deleting sets. It now
reads from refs. Separately, watch sets were appended beside the plan's
pre-created rows rather than filling them, so a row still holding last
session's numbers sat untouched while the row count grew.

**Frame packs for all 206 exercises** are exported, committed, and served at
`/api/watch-frames/*`.

---

## What is NOT finished

**The watch cannot yet fetch a pack.** This is the main outstanding item. The
watch app currently bundles ONE pack (`frontend/targets/watch/OHPFrames`,
barbell overhead press) and reads it from `Bundle.main`. The full-library
rollout needs a download-and-cache layer:

- the phone already has the backend URL; send it in the context payload, the
  same way `targetSets`, `targetRest` and `targetWeight` were added — optional
  field, absent means "no preview", so a mismatched build degrades rather than
  breaks;
- the watch fetches `/api/watch-frames/<id>/pack.json` then the frames, caches
  them under `Caches`, and evicts by LRU;
- keep only the exercise on screen decoded. `FlipbookStore` in `Views.swift`
  already decodes off-main, force-flattens the JPEG so no frame decodes inside
  its display slot, and releases on page exit — reuse that shape.

**The prototype instrumentation is still in the code.** `FlipbookMetrics` in
`Views.swift` logs pacing and memory under `[FLIPBOOK]`. It is gated by a
constant, not by a build flag. Remove it before release.

**Never measured.** The `[FLIPBOOK]` numbers were never captured — the console
link to the watch kept dropping. Smoothness was accepted on the owner's own
observation. If the acceptance criteria matter (no frame gap above 200 ms, no
drift, no memory growth over two minutes, clean release across ten page
visits), that measurement still has to be taken.

**Typography, body tier.** Titles and section headings are normalised; the body
tier is not. `fontSize: 14` appears 61 times and `13` another 54 for what is
often one role, and 14 sits exactly between the `body` (13) and `subheading`
(15) tokens. It is a design call.

**The pull-up-bar defect.** Selecting "Pull-up bar" grants no exercises: the
onboarding key is `pullup`, the library tags those four rows `bar`, nothing is
tagged `pullup`. Documented in `plan-generation.md` §11. Not fixed because
retagging changes what an unchanged seed generates.

---

## Windows-specific notes

**You cannot regenerate the frame packs.** `tools/watch-frames` is macOS-only —
AVFoundation and CoreGraphics. That is why 105 MB of generated JPEGs are
committed. If a source animation changes, the packs must be re-exported on a
Mac and the affected `backend/static/watch_frames/<id>` directories committed.

**You cannot build or run the watch app.** watchOS builds need Xcode. The
backend, the frame-pack endpoint and all the phone-side TypeScript are fully
workable on Windows.

**Running the checks:**

```bash
cd frontend
node scripts/run-logic-tests.mjs        # 460 pass
npx tsc --noEmit -p tsconfig.json       # clean
node scripts/generate-release-manifest.mjs   # after touching a pinned file
```

`run-logic-tests.mjs` transpiles with the project tsconfig; there is no jest
config in this checkout, so `npx jest` will fail to resolve the `@/` alias —
use the script.

**One test fails locally and it is environmental.** `D — local mode still
consults Git, branch, commit and cleanliness` fails whenever `frontend/.env`
holds a non-HTTPS URL (the LAN dev backend) or the checkout is not at the
approved release worktree path. It passes on a checkout without a local `.env`.
It is a release gate doing its job, not a broken test.

---

## Build commands that actually work here

The iOS Debug configuration **fails to link** (`facebook::react::Sealable`
undefined, a React-Core prebuilt mismatch). Release links fine. The watch
scheme builds the phone app as a dependency, so both must be Release:

```bash
cd frontend/ios
xcodebuild -workspace MuscleMap.xcworkspace -scheme MuscleMapWatch \
  -configuration Release -destination "generic/platform=watchOS" \
  -allowProvisioningUpdates ENABLE_USER_SCRIPT_SANDBOXING=NO build
```

`ENABLE_USER_SCRIPT_SANDBOXING=NO` is required: the React Native bundle phase
writes `ip.txt` into the app bundle and the sandbox denies it.
