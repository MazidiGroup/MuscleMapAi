# How a plan and its sessions are built

Reference for the logic that turns onboarding answers into a week of training
days, and a training day into a live workout session.

Source of truth: `frontend/src/plan/exercises.js` (generator, shipped as plain
JS from the design hand-off), `frontend/src/plan/onboarding.ts` (answers),
`frontend/src/anatomy/progression.ts` and `frontend/src/anatomy/workoutScope.ts`
(session rows). This document describes the code as it stands; where a rule is
surprising, the reason is noted rather than smoothed over.

---

## 1. The inputs

`buildPlan(answers, seed)` takes seven fields. Only **three are asked** during
onboarding — goal, days, equipment — plus the Advanced toggle which lives on the
days step. The rest are defaulted in `normalizeAnswers`, never silently guessed:

| Field | Asked? | Values | Default |
|---|---|---|---|
| `goal` | yes | `muscle`, `strength`, `fatloss`, `general` | `general` |
| `days` | yes | subset of 0–6 (0 = Monday) | `[0, 2, 4]` |
| `equip` | yes | `db bb kb band cable machine pullup dip bw` | `[]` |
| `exp` | **yes** (level selector on the days step) | `beginner`, `intermediate`, `advanced` | `beginner` (pre-level stored answers) |
| `advanced` | derived | `exp === "advanced" && days >= 5` — turns on the specialisation split | — |
| `focus` | no | up to 3 regions | `[]` |
| `posture` | no | boolean | `false` |

Level is **independent of day count**: an advanced lifter on three days is
still advanced (7 slots, level-3 exercises). Only the derived `advanced` flag —
the muscle-group **specialisation split** — needs five days, because that split
is not programmable below them. Legacy answers that stored the old Advanced
toggle with no `exp` are read as declaring an advanced lifter.

### The exercise library

206 rows parsed from a pipe-delimited string:

```
band-curl|biceps|band|curl|1|
   id     muscle  equip pattern level flags
```

`flags` carries `c` (compound) and `t` (timed). 24 movement patterns, 8
equipment classes, levels 1–3 (129 / 69 / 8 rows respectively).

---

## 2. Choosing the split

`splitFor(dayCount, advanced)` maps the **number** of training days to an
ordered list of day types. The specific weekdays chosen only decide which
calendar day each slot lands on.

**Standard:**

| Days | Split | Types in order |
|---|---|---|
| 1 | Full Body | `full` |
| 2 | Full Body ×2 | `full, full` |
| 3 | Full Body ×3 | `full, full, full` |
| 4 | Upper / Lower | `upper, lower, upper, lower` |
| 5 | Hybrid PPL | `push, pull, legs, upper, lower` |
| 6 | Push / Pull / Legs | `push, pull, legs, push, pull, legs` |
| 7 | Push / Pull / Legs + | `push, pull, legs, upper, lower, full, full` |

**Advanced Lifter Mode** (5+ days) replaces this with muscle-group
specialisation, arranged so the same group is never on back-to-back days:

| Days | Types in order |
|---|---|
| 5 | `spChest, spBack, spLegs, spShoulders, spArms` |
| 6 | above + `spLegs` |
| 7 | above + `spLegs, spBack` |

Day counts are clamped to 1–7.

---

## 3. Filling a day with slots

Each day type has a **7-slot template**. A slot is a prioritised list of
patterns, optionally with a preferred muscle:

```js
push: [{p:['hpush'], m:'chest'}, {p:['vpush'], m:'shoulders'}, ...]
```

### How many slots are used

```
advanced mode        → 7
exp = beginner       → 5
exp = advanced       → 7
otherwise            → 6
```

Fat-loss takes **one fewer** slot (unless in advanced mode) to leave room for
the conditioning finisher added later.

### Focus extras

For each region in `focus`, up to a maximum of **two** per day, an extra slot is
appended — but only if that region is already trained by the day type
(`DAY_REGIONS`). Asking for arm focus does not add curls to leg day.

---

## 4. Picking the exercise for a slot

`pick(slot, used, answers, rnd)` tries the slot's own patterns first, then a
`FALLBACK` chain for the primary pattern (e.g. `vpush → hpush`), so a missing
equipment class degrades to a related movement rather than an empty slot.

**Hard filters** — a candidate must pass all three:

1. its pattern is in the current chain;
2. `equipOk`: bodyweight is always allowed, otherwise the equipment must be one
   the user selected;
3. `level <= maxLevel`: 3 for `exp = advanced`, otherwise 2.

**Scoring** — the highest score wins:

| Term | Effect |
|---|---|
| pattern priority | `(count - index) * 10` — earlier patterns dominate |
| muscle match | `+9` when the row's muscle equals the slot's preferred muscle |
| compound | `+5` |
| random jitter | `+ rnd() * 2` — a tie-breaker among near-equals, no longer able to outvote the muscle fit (see §8) |
| beginner, level > 1 | `−7` |
| goal = strength, compound | `+4` |
| row's region is in `focus` | `+3` |
| already used this plan | beginner or strength goal: `−3` compound / `−18` isolation; otherwise `−30` |

Repetition across the week is a *feature* for people who benefit from
practising a lift — beginners, and anyone training for strength — so their
compounds repeat cheaply (a beginner's third squat session is the point, not a
failure of variety). Everyone else still gets variety. The penalty remains a
preference, not a prohibition: a narrow equipment selection can legitimately
force a repeat rather than leave a slot empty, and exact duplicates within a
single day are still filtered out afterwards.

---

## 5. Sets, reps and rest

Driven entirely by `goal`, then adjusted:

| Goal | Sets | Reps | Rest |
|---|---|---|---|
| strength | 4 compound / 3 isolation | 4–6 / 6–8 | 2–3 min / 90 sec |
| muscle | 4 compound / 3 isolation | 8–12 | 60–90 sec |
| fatloss | 4 compound / 3 isolation | 8–12 | 60–90 sec |
| general | 3 | 10–12 | 60 sec |

Then: beginners are capped at **3 sets**; any timed movement (`t`) overrides
reps to **30–45 sec**.

---

## 6. Goal and preference add-ons

**Fat loss** appends a conditioning finisher (`cond`/`carry`, relabelled
`3 rounds · 40 sec on / 20 off`) on **alternate training days only** — the
resistance work stays muscle-preserving (8–12) and the finisher is where the
conditioning lives, rather than every lift becoming circuit work. The slot
given up for the finisher is only given up on the days that get one.

**Posture** (when enabled) appends one corrective per day, alternating by day
index: face pulls on even days, lower-back core work on odd. Capped at 3 sets.

---

## 7. Assembling the day

- **Name** — `TYPE_NAME[type]`, suffixed `A`, `B`, … when the same type recurs
  in the week (e.g. two `full` days become "Full Body A" / "Full Body B").
- **Duration** — `round((totalSets * 2.4 + 9) / 5) * 5` minutes: 2.4 min per
  working set plus a 9-minute fixed overhead, rounded to the nearest 5.
- **Targets** — the unique set of regions across the day's exercises.
- **Cooldown** — one of four abdominal stretches, chosen by day index modulo 4.

The plan returns `{ days, split, goalLabel, tip }`, where `tip` is a
goal-specific progression cue.

---

## 8. Determinism

Randomness comes from `mulberry32(seed)` — a seeded PRNG — so **the same answers
and the same seed always produce the same plan**. Plans additionally carry
`GENERATOR_VERSION` (currently 2): a stored plan is never rewritten by a newer
generator, and a regeneration that differs under a new version is announced by
that number rather than discovered by diffing workouts. The seed is stored alongside
the plan in `planStore`; regenerating a plan mints a new seed, which is what
makes "give me a different plan" produce genuinely different picks from
identical answers.

---

## 9. From a plan day to a live session

Starting a Plan day calls, for each exercise:

```js
addExerciseFromPlan(id, dateKey, item.sets, dayTypeName, item.repsOrTime)
```

This creates a `SessionExercise` whose set rows are laid down **up front** by
`openingSets(performances, plannedCount, plannedReps)`:

- **Count** — the plan's promise always wins, including when it promises one.
  History decides the count only when the plan asked for nothing. Clamped 1–10
  by `plannedSetCount`.
- **Reps** — the plan's target if it gave one, otherwise the reps from the
  best set of the last recorded performance. Timed movements yield 0.
- **Weight** — taken **only** from history: the heaviest working set of the most
  recent session for that exercise, ties resolved to the higher rep count. With
  no history the load stays blank, deliberately — a blank asks, a wrong number
  asserts.

Rows start `done: false` and every field stays editable. A set logged from the
Apple Watch **fills the first uncompleted row** rather than appending beside it,
so the planned row count stays fixed and the watch's set counter agrees with the
phone.

The plan's set count is also what the watch uses to decide when to ask
"next exercise or one more set?" — it is sent over the wire as `targetSets`, and
only for plan-linked exercises, since an exercise added by hand grows a row per
set and has no target to compare against.

---

## 10. Worked example

**Answers:** goal `strength`, days `[0,2,4]` (Mon/Wed/Fri), equipment
`[bb, db]`, everything else default (so `exp = beginner`).

1. 3 days → split `Full Body ×3`, types `full, full, full`.
2. `exp = beginner` → 5 slots per day, no focus extras (`focus` empty).
3. Day 1 slots: squat/lunge (quads), hpush/vpush (chest), hpull/vpull (back),
   hinge/legcurl (hams), core.
4. Each pick filters to barbell, dumbbell or bodyweight rows at level ≤ 2;
   compounds get `+5` and a further `+4` for the strength goal, so the barbell
   squat and bench outrank isolation alternatives.
5. Sets/reps: compounds 4 × 4–6 with 2–3 min rest — but beginner caps sets at
   **3**, so it lands at 3 × 4–6.
6. Duration ≈ `round((15 × 2.4 + 9)/5) × 5` = **45 min**.
7. Days 2 and 3 reuse the `full` template but the `−40` used-penalty pushes the
   picker onto different movements; names become "Full Body A/B/C".

Starting Monday's day creates 3 empty set rows per exercise, reps pre-filled to
4, weight blank on the first ever session and thereafter carried from the
heaviest set last time.

---

## 11. Known defect found while writing this

**Selecting "Pull-up bar" grants no exercises.**

`equipOk` matches with `answers.equip.includes(row.eq)`. Onboarding offers the
equipment key `pullup` (and both the "Full gym" and "Home setup" presets include
it), and `Equipment` declares `pullup` — but the four bar rows in the library are
tagged **`bar`**, a value that appears in no preset, no picker option and not in
the `Equipment` union:

```
chin-ups|back|bar|vpull|2|c
hanging-knee-raises|core|bar|core|2|
parralel-bar-dips|chest|bar|hpush|2|c
pull-ups|back|bar|vpull|2|c
```

Nothing is ever tagged `pullup`, so those four movements are unreachable by the
generator for every user, in every configuration. Pull-ups and chin-ups are
strong `vpull` candidates (level 2, compound), so `vpull` slots currently fall
through to their `FALLBACK` — `hpull` — more often than intended, and the
"Full gym" preset never programmes a pull-up.

Fix is one of: retag the four rows `bar → pullup`, or map `pullup → bar` inside
`equipOk`. Retagging is preferable — it keeps one vocabulary — but it changes the
plans generated from an unchanged seed, so existing stored plans would not match
a regeneration.

**Resolved (generator v2):** chin-ups, pull-ups and hanging knee raises are
retagged `pullup`; parallel-bar dips are tagged `dip`, matched by a new
"Dip station" equipment option — deliberately NOT unlocked by a doorway pull-up
bar. The seed-stability question was settled by versioning the generator
(§8) rather than by preserving the defect.
