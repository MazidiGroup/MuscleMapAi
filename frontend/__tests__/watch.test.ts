// Apple Watch companion — command rules, validation, units and entitlement.
//
// These cover the half of the feature a user notices going wrong: a misheard
// number that writes a set, an inherited weight that inherits the wrong one, a
// kilo that becomes a pound, or a paywall that appears mid-set. Pure logic only:
// no device, no Watch Connectivity, no speech.
import assert from "node:assert/strict";
import test from "node:test";

import {
  MUTATING_COMMANDS,
  WATCH_COPY,
  WorkoutCommand,
  confirmSetLine,
  isMutatingCommand,
} from "../src/watch/commands";
import {
  ACCESS_COPY,
  ENTITLEMENT_CACHE_TTL_MS,
  ENTITLEMENT_FRESH_MS,
  WatchEntitlement,
  deniedNeedsPhone,
  watchAccess,
} from "../src/watch/gate";
import { MAX_REPS, MAX_WEIGHT, SetLogPayload, isValidReps, isValidWeight } from "../src/watch/protocol";
import { matchScore, normalizeSpoken, resolveExercise } from "../src/watch/resolve";
import {
  ApplyDeps,
  WatchSnapshot,
  applyCommand,
  currentExercise,
  displayedWorkingWeight,
  emptySnapshot,
  lastLoggedSet,
  liveSets,
  nextSetNumber,
  nudgeWeight,
} from "../src/watch/session";

// --- fixtures ---------------------------------------------------------------

const NOW = 1_700_000_000_000;

const entitled: WatchEntitlement = { access: true, state: "ready", verifiedAt: NOW - 1000 };

function deps(over: Partial<ApplyDeps> = {}): ApplyDeps {
  return { now: NOW, entitlement: entitled, source: "watch.voice", nameOf: (id) => id, ...over };
}

/** A session with one exercise selected and a 80 kg working weight. */
function running(): WatchSnapshot {
  return {
    ...emptySnapshot("kg"),
    sessionId: "s1",
    startedAt: NOW - 60_000,
    grantedAt: NOW - 60_000,
    seq: 5,
    workingWeight: { value: 80, unit: "kg" },
    exercises: [
      { exerciseId: "bench-press", idSpace: "anatomy", name: "Bench Press", targetReps: 8, sets: [] },
      { exerciseId: "squat", idSpace: "anatomy", name: "Squat", targetReps: 5, sets: [] },
    ],
  };
}

function apply(s: WatchSnapshot, c: WorkoutCommand, d: Partial<ApplyDeps> = {}) {
  return applyCommand(s, c, deps(d));
}

function mustApply(s: WatchSnapshot, c: WorkoutCommand, d: Partial<ApplyDeps> = {}) {
  const out = apply(s, c, d);
  assert.equal(out.status, "applied", `expected ${c.kind} to apply, got ${out.status}`);
  if (out.status !== "applied") throw new Error("unreachable");
  return out;
}

// --- validation -------------------------------------------------------------

test("reps must be a whole number inside the supported range", () => {
  assert.equal(isValidReps(1), true);
  assert.equal(isValidReps(MAX_REPS), true);
  assert.equal(isValidReps(0), false, "a 0-rep set records no work");
  assert.equal(isValidReps(-3), false);
  assert.equal(isValidReps(8.5), false, "half a rep is a mishearing, not a set");
  assert.equal(isValidReps(MAX_REPS + 1), false);
  assert.equal(isValidReps("8" as unknown), false);
  assert.equal(isValidReps(NaN), false);
});

test("weight accepts bodyweight and decimals, and refuses the impossible", () => {
  assert.equal(isValidWeight(0, "kg"), true, "0 is how bodyweight is already recorded");
  assert.equal(isValidWeight(2.5, "kg"), true);
  assert.equal(isValidWeight(82.25, "kg"), true);
  assert.equal(isValidWeight(MAX_WEIGHT.kg, "kg"), true);
  assert.equal(isValidWeight(MAX_WEIGHT.kg + 1, "kg"), false);
  assert.equal(isValidWeight(MAX_WEIGHT.lb, "lb"), true);
  assert.equal(isValidWeight(-1, "kg"), false);
  assert.equal(isValidWeight(Infinity, "kg"), false);
});

test("an out-of-range command refuses and writes nothing", () => {
  const s = running();
  for (const command of [
    { kind: "logSet", reps: 0 },
    { kind: "logSet", reps: 999 },
    { kind: "logSet", reps: 8, weight: { value: 9000, unit: "kg" } },
  ] as WorkoutCommand[]) {
    const out = apply(s, command);
    assert.equal(out.status, "refused", JSON.stringify(command));
    assert.ok(!("events" in out), "a refusal carries no events");
    assert.ok(!("snapshot" in out), "a refusal carries no snapshot");
  }
});

// --- inherited versus explicit weight ---------------------------------------

test("log 8 reps inherits the active exercise and the working weight", () => {
  const out = mustApply(running(), { kind: "logSet", reps: 8 });
  const set = liveSets(currentExercise(out.snapshot as WatchSnapshot))[0];
  assert.equal(set.reps, 8);
  assert.deepEqual(set.weight, { value: 80, unit: "kg" });
  assert.equal(out.events.length, 1);
  const payload = out.events[0].payload as SetLogPayload;
  assert.equal(payload.exerciseId, "bench-press", "the active exercise, not a guess");
  assert.equal(out.feedback.message, "8 reps at 80 kg, Bench Press.");
});

test("log 8 reps at 85 kilos updates the working weight and logs the set atomically", () => {
  const out = mustApply(running(), { kind: "logSet", reps: 8, weight: { value: 85, unit: "kg" } });
  const next = out.snapshot as WatchSnapshot;
  assert.deepEqual(next.workingWeight, { value: 85, unit: "kg" }, "the working weight moved");
  assert.equal(liveSets(currentExercise(next))[0].weight.value, 85, "and the set carries it");
  assert.equal(out.events.length, 1, "one event — the two cannot half-fail");
});

test("a bodyweight set logs as zero rather than refusing", () => {
  const s = { ...running(), workingWeight: { value: 0, unit: "kg" as const } };
  const out = mustApply(s, { kind: "logSet", reps: 12 });
  assert.equal(out.feedback.message, "12 reps at bodyweight, Bench Press.");
});

test("a warm-up is logged, flagged, and named as one in the confirmation", () => {
  const out = mustApply(running(), { kind: "logSet", reps: 10, warmup: true });
  const set = liveSets(currentExercise(out.snapshot as WatchSnapshot))[0];
  assert.equal(set.warmup, true);
  assert.ok(out.feedback.message.startsWith("Warm-up: "));
});

// --- units ------------------------------------------------------------------

test("a spoken unit is converted for display, never relabelled", () => {
  const pounds: WatchSnapshot = { ...running(), unit: "lb", workingWeight: { value: 100, unit: "lb" } };
  const out = mustApply(pounds, { kind: "logSet", reps: 5, weight: { value: 85, unit: "kg" } });
  const next = out.snapshot as WatchSnapshot;
  // Stored exactly as spoken…
  assert.deepEqual(next.workingWeight, { value: 85, unit: "kg" });
  // …and shown as the pounds it actually is (85 / 0.45359237 = 187.4).
  assert.equal(displayedWorkingWeight(next), 187);
  assert.ok(out.feedback.message.includes("187 lb"), out.feedback.message);
});

test("switching nothing keeps a converted load stable across repeated nudges", () => {
  const s: WatchSnapshot = { ...running(), unit: "lb", workingWeight: { value: 100, unit: "kg" } };
  let weight = s.workingWeight;
  for (let i = 0; i < 6; i++) {
    weight = nudgeWeight({ ...s, workingWeight: weight }, 0, 5);
  }
  assert.equal(weight.unit, "kg");
  assert.equal(weight.value, 100, "a no-op nudge must not drift the stored value");
});

test("a crown nudge moves the load by one increment in the displayed unit", () => {
  const s: WatchSnapshot = { ...running(), unit: "kg", workingWeight: { value: 80, unit: "kg" } };
  assert.deepEqual(nudgeWeight(s, +1, 5), { value: 85, unit: "kg" });
  assert.deepEqual(nudgeWeight(s, -1, 5), { value: 75, unit: "kg" });
  assert.equal(nudgeWeight({ ...s, workingWeight: { value: 2, unit: "kg" } }, -5, 5).value, 0, "never negative");
});

// --- missing and ambiguous context ------------------------------------------

test("logging without a session refuses and explains", () => {
  const out = apply(emptySnapshot("kg"), { kind: "logSet", reps: 8 });
  assert.equal(out.status, "refused");
  if (out.status !== "refused") return;
  assert.equal(out.reason, "no_session");
  assert.equal(out.feedback.message, WATCH_COPY.noSession);
});

test("logging into a session with no exercises refuses instead of inventing one", () => {
  const s = { ...running(), exercises: [] };
  const out = apply(s, { kind: "logSet", reps: 8 });
  assert.equal(out.status, "refused");
  if (out.status !== "refused") return;
  assert.equal(out.reason, "no_exercise_selected");
});

test("spoken names resolve against the session before the catalogue", () => {
  const session = [{ exerciseId: "incline-db-press", idSpace: "anatomy" as const, name: "Incline Dumbbell Press" }];
  const catalogue = [
    { exerciseId: "bench-press", idSpace: "anatomy" as const, name: "Bench Press" },
    { exerciseId: "overhead-press", idSpace: "anatomy" as const, name: "Overhead Press", aliases: ["ohp"] },
  ];
  const hit = resolveExercise("incline dumbbell press", session, catalogue);
  assert.equal(hit.status, "resolved");
  if (hit.status === "resolved") assert.equal(hit.choice.exerciseId, "incline-db-press");

  const alias = resolveExercise("ohp", [], catalogue);
  assert.equal(alias.status, "resolved");
  if (alias.status === "resolved") assert.equal(alias.choice.exerciseId, "overhead-press");
});

test("two plausible exercises produce a question, never a guess", () => {
  const catalogue = [
    { exerciseId: "bench-press", idSpace: "anatomy" as const, name: "Bench Press" },
    { exerciseId: "leg-press", idSpace: "anatomy" as const, name: "Leg Press" },
  ];
  const out = resolveExercise("press", [], catalogue);
  assert.equal(out.status, "ambiguous");
  if (out.status === "ambiguous") assert.equal(out.choices.length, 2);
});

test("an unmatched name resolves to nothing rather than the nearest thing", () => {
  const catalogue = [{ exerciseId: "squat", idSpace: "anatomy" as const, name: "Squat" }];
  assert.equal(resolveExercise("kettlebell windmill", [], catalogue).status, "unknown");
  assert.equal(resolveExercise("", [], catalogue).status, "unknown");
});

test("a partial word never matches a longer one", () => {
  const narrow = { exerciseId: "narrow-grip-row", idSpace: "anatomy" as const, name: "Narrow Grip Row" };
  assert.equal(matchScore("row", narrow) > 0, true, "row is a whole word in the name");
  assert.equal(matchScore("arrow", narrow), 0, "arrow is not");
});

test("filler words and punctuation do not change what was said", () => {
  assert.deepEqual(normalizeSpoken("the Bench-Press!"), ["bench", "press"]);
  assert.deepEqual(normalizeSpoken("do a squat"), ["squat"]);
});

// --- selection and navigation ------------------------------------------------

test("selecting an exercise already in the session moves to it without an event", () => {
  const out = mustApply(running(), { kind: "selectExercise", exerciseId: "squat", idSpace: "anatomy" });
  assert.equal((out.snapshot as WatchSnapshot).currentIndex, 1);
  assert.equal(out.events.length, 0, "no data changed, so nothing to send");
});

test("selecting an exercise that is not in the session adds it once", () => {
  const out = mustApply(running(), { kind: "selectExercise", exerciseId: "deadlift", idSpace: "anatomy" }, {
    nameOf: () => "Deadlift",
  });
  const next = out.snapshot as WatchSnapshot;
  assert.equal(next.exercises.length, 3);
  assert.equal(next.currentIndex, 2);
  assert.equal(out.events[0].kind, "exercise.add");
});

test("moving to the next exercise does not carry the previous load across", () => {
  const logged = mustApply(running(), { kind: "logSet", reps: 8 }).snapshot as WatchSnapshot;
  const moved = mustApply(logged, { kind: "nextExercise" }).snapshot as WatchSnapshot;
  assert.equal(moved.currentIndex, 1);
  assert.equal(moved.workingWeight.value, 0, "a wrong prefilled weight asserts where a blank one asks");
});

test("stepping past either end clamps instead of wrapping", () => {
  const s = running();
  assert.equal((mustApply(s, { kind: "previousExercise" }).snapshot as WatchSnapshot).currentIndex, 0);
  const last = { ...s, currentIndex: 1 };
  assert.equal((mustApply(last, { kind: "nextExercise" }).snapshot as WatchSnapshot).currentIndex, 1);
});

test("the set number counts live sets, so an undone set does not inflate it", () => {
  let s = mustApply(running(), { kind: "logSet", reps: 8 }).snapshot as WatchSnapshot;
  assert.equal(nextSetNumber(s), 2);
  s = mustApply(s, { kind: "undoLastSet", confirmed: true }).snapshot as WatchSnapshot;
  assert.equal(nextSetNumber(s), 1);
});

// --- edit and undo ----------------------------------------------------------

test("undo asks before it removes anything", () => {
  const logged = mustApply(running(), { kind: "logSet", reps: 8 }).snapshot as WatchSnapshot;
  const asked = apply(logged, { kind: "undoLastSet" });
  assert.equal(asked.status, "refused");
  if (asked.status !== "refused") return;
  assert.equal(asked.reason, "needs_confirmation");
  assert.ok(asked.feedback.message.includes("8 reps at 80 kg"), asked.feedback.message);
});

test("the undo question does not collide with the sentence it quotes", () => {
  // Seen on the watch: "Undo 9 reps at 15 kg, Dumbbell Situp.?"
  const line = confirmSetLine("Dumbbell Situp", 9, 15, "kg");
  assert.ok(line.endsWith("."), "the description is a sentence on its own");
  const question = WATCH_COPY.confirmUndo(line);
  assert.ok(!question.includes(".?"), question);
  assert.ok(question.endsWith("Dumbbell Situp?"), question);
});

test("a confirmed undo tombstones the set rather than deleting it", () => {
  const logged = mustApply(running(), { kind: "logSet", reps: 8 }).snapshot as WatchSnapshot;
  const out = mustApply(logged, { kind: "undoLastSet", confirmed: true });
  const next = out.snapshot as WatchSnapshot;
  assert.equal(next.exercises[0].sets.length, 1, "the record is kept…");
  assert.equal(next.exercises[0].sets[0].voided, true, "…as a tombstone");
  assert.equal(liveSets(next.exercises[0]).length, 0);
  assert.equal(out.events[0].kind, "set.void");
});

test("undo affects only the most recent action and then has nothing left", () => {
  let s = mustApply(running(), { kind: "logSet", reps: 8 }).snapshot as WatchSnapshot;
  s = mustApply(s, { kind: "logSet", reps: 6 }).snapshot as WatchSnapshot;
  s = mustApply(s, { kind: "undoLastSet", confirmed: true }).snapshot as WatchSnapshot;
  assert.deepEqual(liveSets(s.exercises[0]).map((x) => x.reps), [8], "only the second set went");

  const again = apply(s, { kind: "undoLastSet", confirmed: true });
  assert.equal(again.status, "refused");
  if (again.status === "refused") assert.equal(again.reason, "nothing_to_undo");
});

test("editing the last set raises its revision and can itself be undone", () => {
  const logged = mustApply(running(), { kind: "logSet", reps: 8 }).snapshot as WatchSnapshot;
  const edited = mustApply(logged, { kind: "reviseLastSet", reps: 10 });
  const next = edited.snapshot as WatchSnapshot;
  assert.equal(next.exercises[0].sets[0].reps, 10);
  assert.equal(next.exercises[0].sets[0].revision, 1);
  assert.equal(edited.events[0].kind, "set.revise");

  const undone = mustApply(next, { kind: "undoLastSet", confirmed: true }).snapshot as WatchSnapshot;
  assert.equal(undone.exercises[0].sets[0].reps, 8, "the previous value is restored");
  assert.equal(undone.exercises[0].sets[0].revision, 2, "as a further revision, not a rollback");
});

test("editing with nothing logged refuses", () => {
  const out = apply(running(), { kind: "reviseLastSet", reps: 10 });
  assert.equal(out.status, "refused");
  if (out.status === "refused") assert.equal(out.reason, "nothing_to_revise");
});

test("the last set is the most recent one anywhere in the session", () => {
  let s = mustApply(running(), { kind: "logSet", reps: 8 }).snapshot as WatchSnapshot;
  s = mustApply(s, { kind: "nextExercise" }).snapshot as WatchSnapshot;
  s = mustApply({ ...s, workingWeight: { value: 100, unit: "kg" } }, { kind: "logSet", reps: 5 }, { now: NOW + 1000 })
    .snapshot as WatchSnapshot;
  const last = lastLoggedSet(s);
  assert.equal(last?.exerciseIndex, 1);
  assert.equal(last?.set.reps, 5);
});

// --- session lifecycle ------------------------------------------------------

test("starting a workout mints a session and grants this watch access to it", () => {
  const out = mustApply(emptySnapshot("kg"), { kind: "startWorkout" });
  const next = out.snapshot as WatchSnapshot;
  assert.ok(next.sessionId);
  assert.equal(next.startedAt, NOW);
  assert.equal(next.grantedAt, NOW);
  assert.equal(out.events[0].kind, "session.start");
  assert.equal(out.events[0].seq, 0, "the first event of a session is sequence 0");
});

test("starting a second workout is refused, not silently ignored", () => {
  const out = apply(running(), { kind: "startWorkout" });
  assert.equal(out.status, "refused");
  if (out.status === "refused") assert.equal(out.reason, "session_already_running");
});

test("pausing holds the rest timer and never rewrites the recorded duration", () => {
  const logged = mustApply(running(), { kind: "logSet", reps: 8 }).snapshot as WatchSnapshot;
  assert.ok(logged.rest, "logging a set starts rest");
  const paused = mustApply(logged, { kind: "pauseWorkout" }, { now: NOW + 30_000 }).snapshot as WatchSnapshot;
  assert.equal(paused.paused, true);
  assert.equal(paused.rest?.pausedRemaining, 60, "90 s rest, 30 s served");
  assert.equal(paused.startedAt, logged.startedAt, "the start time is untouched");

  const resumed = mustApply(paused, { kind: "resumeWorkout" }, { now: NOW + 120_000 }).snapshot as WatchSnapshot;
  assert.equal(resumed.paused, false);
  assert.equal(resumed.rest?.pausedRemaining, null);
});

test("ending a workout emits one event and clears the watch, keeping the rest preference", () => {
  const s = { ...running(), restSeconds: 120 };
  const out = mustApply(s, { kind: "endWorkout" });
  const next = out.snapshot as WatchSnapshot;
  assert.equal(out.events.length, 1);
  assert.equal(out.events[0].kind, "session.end");
  assert.equal(out.events[0].sessionId, "s1", "the event keeps the session it belongs to");
  assert.equal(next.sessionId, null);
  assert.equal(next.restSeconds, 120);
});

// --- entitlement ------------------------------------------------------------

test("a verified subscriber may log", () => {
  const d = watchAccess(entitled, { now: NOW, sessionGranted: false });
  assert.equal(d.allow, true);
  assert.equal(d.basis, "verified");
});

test("a cached answer keeps working offline, and expires", () => {
  const stale: WatchEntitlement = { access: true, state: "ready", verifiedAt: NOW - ENTITLEMENT_FRESH_MS - 1 };
  assert.deepEqual(watchAccess(stale, { now: NOW, sessionGranted: false }), { allow: true, basis: "cached" });

  const expired: WatchEntitlement = { access: true, state: "ready", verifiedAt: NOW - ENTITLEMENT_CACHE_TTL_MS - 1 };
  const d = watchAccess(expired, { now: NOW, sessionGranted: false });
  assert.equal(d.allow, false, "an entitlement that never expires is a lifetime licence");
  assert.equal(d.basis, "expired_cache");
  assert.equal(deniedNeedsPhone(d.basis), true, "this is a reconnect prompt, not a sales pitch");
});

test("a watch that has never heard from the phone is denied", () => {
  const never: WatchEntitlement = { access: false, state: "loading", verifiedAt: 0 };
  const d = watchAccess(never, { now: NOW, sessionGranted: false });
  assert.equal(d.allow, false, "absence of an answer is not a yes");
  assert.equal(d.basis, "loading");
});

test("a phone that answered but could not confirm says so, not “open the app”", () => {
  // Found in the simulator: with no .env, RevenueCat never configures, the read
  // errors, and the watch told the user to open an app that was open in front of
  // them. `error` can only arrive in a payload, so it proves the phone answered.
  const failed: WatchEntitlement = { access: false, state: "error", verifiedAt: 0 };
  const d = watchAccess(failed, { now: NOW, sessionGranted: false });
  assert.equal(d.allow, false, "a failed read never fabricates access");
  assert.equal(d.basis, "unconfirmed");
  assert.equal(deniedNeedsPhone(d.basis), true, "this is a reconnect prompt, not a sales pitch");
  const copy = ACCESS_COPY.unconfirmed.toLowerCase();
  assert.ok(!copy.includes("open muscle map"), "must not send the user to an app they already have open");
  assert.ok(copy.includes("connection"), "name the thing the user can actually act on");
});

test("only a genuinely silent phone is told to open the app once", () => {
  // `never_verified` is now reachable only from a `ready` answer with no
  // timestamp, which WatchLink stamps before it sends. Kept as a defensive
  // default rather than a state the user is expected to reach.
  const odd: WatchEntitlement = { access: false, state: "ready", verifiedAt: 0 };
  assert.equal(watchAccess(odd, { now: NOW, sessionGranted: false }).basis, "never_verified");
});

test("a non-subscriber is denied and pointed at the iPhone", () => {
  const free: WatchEntitlement = { access: false, state: "ready", verifiedAt: NOW };
  const d = watchAccess(free, { now: NOW, sessionGranted: false });
  assert.equal(d.allow, false);
  assert.equal(d.basis, "not_premium");
  assert.equal(deniedNeedsPhone(d.basis), false);
});

test("an expiry mid-workout lets that workout finish and gates the next one", () => {
  const lapsed: WatchEntitlement = { access: false, state: "ready", verifiedAt: NOW };
  // Inside the session the watch was granted: it finishes.
  assert.equal(watchAccess(lapsed, { now: NOW, sessionGranted: true }).basis, "active_session_grace");
  const inSession = apply({ ...running(), grantedAt: NOW - 60_000 }, { kind: "logSet", reps: 8 }, { entitlement: lapsed });
  assert.equal(inSession.status, "applied");

  // The next session is not.
  const next = apply(emptySnapshot("kg"), { kind: "startWorkout" }, { entitlement: lapsed });
  assert.equal(next.status, "refused");
  if (next.status === "refused") assert.equal(next.reason, "not_entitled");
});

test("an iPhone session alone is not a grant — watch logging stays gated", () => {
  const free: WatchEntitlement = { access: false, state: "ready", verifiedAt: NOW };
  // A session exists (iPhone logging is free) but this watch was never granted.
  const phoneStarted: WatchSnapshot = { ...running(), grantedAt: null };
  const out = apply(phoneStarted, { kind: "logSet", reps: 8 }, { entitlement: free });
  assert.equal(out.status, "refused");
  if (out.status === "refused") assert.equal(out.reason, "not_entitled");
});

test("every command that can change stored work is gated", () => {
  const free: WatchEntitlement = { access: false, state: "ready", verifiedAt: NOW };
  const commands: WorkoutCommand[] = [
    { kind: "startWorkout" },
    { kind: "selectExercise", exerciseId: "squat", idSpace: "anatomy" },
    { kind: "logSet", reps: 8 },
    { kind: "reviseLastSet", reps: 8 },
    { kind: "undoLastSet", confirmed: true },
    { kind: "endWorkout" },
  ];
  for (const c of commands) {
    assert.equal(isMutatingCommand(c.kind), true, `${c.kind} must be listed as mutating`);
    const out = apply({ ...running(), grantedAt: null }, c, { entitlement: free });
    assert.equal(out.status, "refused", c.kind);
  }
  assert.equal(MUTATING_COMMANDS.length, commands.length);
});

// --- feedback ---------------------------------------------------------------

test("every outcome carries feedback and a haptic", () => {
  const cases = [
    apply(running(), { kind: "logSet", reps: 8 }),
    apply(running(), { kind: "logSet", reps: 0 }),
    apply(emptySnapshot("kg"), { kind: "logSet", reps: 8 }),
  ];
  for (const out of cases) {
    assert.ok(out.feedback.message.length > 0, "silence is indistinguishable from not being heard");
    assert.ok(out.feedback.haptic.length > 0);
  }
});

test("a confirmation always names the exercise, the reps and the load", () => {
  const line = confirmSetLine("Bench Press", 8, 82.5, "kg");
  assert.ok(line.includes("Bench Press"));
  assert.ok(line.includes("8 reps"));
  assert.ok(line.includes("82.5 kg"), line);
  assert.ok(!confirmSetLine("Squat", 5, 100, "kg").includes("100.0"), "no trailing zeros");
});
