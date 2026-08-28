# Where decisions get made about the user

Companion to `plan-generation.md`. That document covers one decision engine —
how answers become a plan. This one is the **inventory**: every other place in
the app where code decides something the user feels.

Ordered roughly by how directly a wrong decision would hurt.

---

## 1. Progressive overload — "what should I put on the bar today?"

`src/anatomy/progression.ts` · `suggestNext()`

The single most opinionated piece of logic in the app after plan generation. It
reads your stored history for one exercise and returns one instruction.

- Only the **most recent** session counts. Older sessions are not averaged.
- Only sets **at the top weight** decide whether you progressed — a lighter
  back-off set cannot block you.
- `minReps` across those top sets is the figure judged, not the best set. You
  have to clear the range on *every* working set.
- If `minReps >= range.max` → **add load**, and the next target drops back to
  `range.min` reps.
- **Two consecutive matching sessions stuck at the same load with no rep
  progress** → suggest one increment down and rebuild. Judged on a short trend,
  never on one poor day; a single session alone still suggests one more rep.
- Otherwise → **one more rep** at the same load.
- Bodyweight, or anything logged without a load, can only progress on reps.

**Load step** (`loadIncrement`) is plate-aware AND relative-jump-capped:
`kg` → 2.5 below 60 kg, 5 at or above (8.3% worst case). `lb` → 5 below 150,
10 at or above (6.7%).

**Rep ranges** come from the goal, so the same history yields different advice
under different goals.

---

## 2. Premium gating — what you may open

`src/premium/entitlement.ts` · `resolvePremium()`, `gate()`

One contract; screens never re-derive it or read RevenueCat directly.

- Entitlement resolves from four sources, in precedence order:
  `reviewer_bypass`, `manual_grant` (server), `revenuecat`, `none`.
- Twelve named surfaces are each classified Premium or Free.
- `gate()` returns **`allow` / `loading` / `locked`** — three states, not two.
  `loading` exists so a paying user is never shown a paywall while the read is
  still in flight.

The tab bar names a Premium surface "…, Premium" for accessibility **unless
entitlement has resolved with access**, so the label is identical on every
launch rather than flickering.

---

## 3. Watch access — the same question, decided offline

`src/watch/gate.ts` (phone) · `targets/watch/Rules.swift` `watchAccess()` (watch)

The watch never talks to RevenueCat. It mirrors the phone's last **verified**
answer and ages it:

- fresh (< 1 hour) → `verified`
- cached (< 7 days) → `cached`, still allowed
- older, or never answered → locked, with a reason
- **active-session grace**: if a session already holds a grant, it finishes.
  Stopping someone mid-set to show a paywall destroys real work to enforce a
  boundary that waits ninety seconds.

Denial reasons are distinguished on purpose (`never_verified`, `unconfirmed`,
`expired_cache`, `not_premium`) because they need different instructions.

---

## 4. What counts as a completed set, exercise and workout

`src/history/metrics.ts`

Every number in History, the calendar and Insights comes from here, so the rules
are applied identically everywhere.

- A set counts only when it is **done AND records at least one count** — reps
  for rep work; for timed work the planned rows open pre-filled with their
  prescribed seconds (`plannedCountFrom`), so a plank or carry is completable
  without typing. Seconds are still never *reps* (`plannedRepsFrom` keeps
  answering 0 for time), only the row's count.
- `exerciseStatus` → `Completed` / `Incomplete` / `Not completed`.
- Damaged records are **partitioned out** rather than crashing the screen
  (`partitionRecords`).
- Volume, streaks, weekly totals and routine grouping all derive from the same
  validated set.

A workout with no sets writes no history — deliberate — but is still released.

---

## 5. Session opening rows

`src/anatomy/progression.ts` `openingSets()` · `src/anatomy/workoutScope.ts`

Covered in `plan-generation.md` §9. The rule worth restating: **the plan's set
count always wins** over history, and **weight is never guessed** — it comes only
from your heaviest previous working set, or stays blank.

---

## 6. Personal records

`src/anatomy/progression.ts` `recordsFrom()`, `prForSet()`, `estimated1RM()`

- A PR needs a baseline; the first ever set of an exercise is not a record.
- Weightless sets can only set a **reps** PR.
- `estimated1RM` is computed but is a display figure, not a gate on anything.

---

## 7. Adjust plan — rebuilding a week mid-week

`src/plan/adjustPlan.ts`

Rebuilds the **remaining** scheduled workouts from current answers, with
safeguards: completed days are identified (`isDayCompleted`) and preserved, the
new plan's shape is verified before it is accepted (`verifyPlanShape`), and the
change is **previewed and summarised** (`summarizeAdjustment`) before it is
applied. A malformed regeneration cannot silently replace a good plan.

---

## 8. Exercise swaps and alternatives

`src/plan/exercises.js` `alternativesFor()`

Offers replacements filtered by the same equipment and level rules as the
generator, excluding the current exercise, anything already in the plan, and
stretch/mobility rows. Swaps are stored per owner in `planStore`, so a swap
survives regeneration.

---

## 9. Library search and filtering

`src/library/catalogQuery.ts`

Pure query layer over the real catalogue. Every filter option and every count is
derived from the catalogue itself — no remote search, no fuzzy engine, no
invented difficulty scores or ratings.

---

## 10. Voice → exercise resolution (watch)

`src/watch/resolve.ts`

The only place free text becomes an exercise id, and deliberately conservative:
it would rather **ask which one you meant** (up to 4 choices) than log a set
against a guess. Reps and weights never go through it — they arrive typed.

---

## 11. Watch ↔ phone reconciliation

`src/watch/apply.ts`, `src/watch/snapshot.ts`, `src/watch/outbox.ts`

The rules that decide whose version of a workout wins:

- Events are applied **exactly once** (`processed` ids, retained even after a
  session closes, so a late retry is recognised rather than duplicated).
- Events for a **different session** than the one in progress are **deferred**,
  never merged — two workouts must not become one.
- Events for a **closed** session are rejected as `unknown_session` so the loss
  is surfaced rather than swallowed.
- A snapshot never removes work the watch recorded but the phone has not
  acknowledged: "the other side didn't mention it" is not evidence of deletion.

---

## 12. Which account's data you see

`src/owner/scopeKeys.ts`, `src/owner/migration.ts`

Every stored record is namespaced per owner. Legacy device-global data is
handled under an explicit policy (`unclaimed_without_verified_owner`) rather
than being adopted by whoever signs in first. Nothing is applied until the
owner's scope has been **read**, which is why the watch link refuses to push
before hydration.

---

## 13. Units

`src/units/unitPreference.ts`

One owner-scoped preference for both Workout and History. Stored values are
exactly `kg` or `lb`. Conversion happens at the **display boundary only** — a
stored load always keeps the unit it was entered in, so changing the preference
converts rather than relabels. Records written before this existed are read in
the unit captured at upgrade.

---

## 14. Onboarding routing

`src/plan/onboarding.ts` `routeStep()`

Decides which screen you land on given a stored step and whether a plan exists —
including mapping values written by the retired six-step flow onto the current
three-question one, resuming on the last question so nothing already picked is
discarded.

---

## 15. AI Coach

`src/anatomy/coachApi.ts` + backend

A streaming (SSE) client. The **decision logic lives server-side**; the client
handles transport and failure copy. Worth noting for completeness: this is the
one user-facing feature whose behaviour is not fully described by this repo.

---

## Not logic, but decides what you see

- `src/theme/tokens.ts` / `semantic.ts` — the type scale, radii and per-mode
  palettes referenced in the typography pass.
- `src/anatomy/muscleData.ts`, `groups.ts`, `gymGuide.ts` — anatomy reference
  content and gym-group mappings behind the muscle map and Explore.
