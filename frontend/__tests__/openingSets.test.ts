// Pre-filled opening values — a workout must be startable without typing, and
// must never assert a number the user did not actually lift.
import assert from "node:assert/strict";
import test from "node:test";

import { openingSets, plannedRepsFrom } from "../src/anatomy/progression";
import type { Performance } from "../src/history/metrics";

const perf = (sets: { weight: number; reps: number }[], date = 1): Performance => ({
  workoutId: `w${date}`,
  date,
  completedSets: sets.map((s, i) => ({ id: `s${i}`, weight: s.weight, reps: s.reps, done: true })),
  maxWeight: Math.max(0, ...sets.map((s) => s.weight)),
  volume: sets.reduce((a, s) => a + s.weight * s.reps, 0),
  reps: sets.reduce((a, s) => a + s.reps, 0),
});

test("with no history nothing is invented — the rows open empty", () => {
  const o = openingSets([]);
  assert.equal(o.weight, 0, "a wrong prefilled weight asserts; a blank one asks");
  assert.equal(o.reps, 0);
  assert.equal(o.count, 1);
});

test("the opening values come from the most recent performance, not the best ever", () => {
  const o = openingSets([
    perf([{ weight: 100, reps: 5 }], 1),
    perf([{ weight: 60, reps: 12 }], 2),
  ]);
  assert.equal(o.weight, 60, "last session is what the user is continuing from");
  assert.equal(o.reps, 12);
});

test("within that session the heaviest working set is the one worth repeating", () => {
  const o = openingSets([perf([{ weight: 40, reps: 12 }, { weight: 60, reps: 8 }, { weight: 50, reps: 10 }])]);
  assert.equal(o.weight, 60);
  assert.equal(o.reps, 8);
});

test("a tie on load resolves to the higher rep count", () => {
  const o = openingSets([perf([{ weight: 60, reps: 6 }, { weight: 60, reps: 9 }])]);
  assert.equal(o.reps, 9);
});

test("the set count follows the plan when the plan promises one, and history otherwise", () => {
  const history = [perf([{ weight: 60, reps: 8 }, { weight: 60, reps: 8 }])];
  assert.equal(openingSets(history).count, 2, "history decides when the plan is silent");
  assert.equal(openingSets(history, 4).count, 4, "a Plan day promising 4 sets still opens 4");
  assert.equal(
    openingSets(history, 1).count,
    1,
    "a Plan day promising ONE set opens one — history must not silently add sets the plan did not ask for",
  );
  assert.equal(openingSets([], 3).count, 3, "a promised count applies with no history too");
});

test("a count is never zero or negative, whatever it is handed", () => {
  for (const bad of [0, -1, -99]) assert.ok(openingSets([], bad).count >= 1, String(bad));
});

test("a performance with no completed sets is treated as no history", () => {
  const empty: Performance = { ...perf([{ weight: 50, reps: 5 }]), completedSets: [] };
  const o = openingSets([empty]);
  assert.equal(o.weight, 0);
  assert.equal(o.reps, 0);
});

test("nothing is pre-marked done — the user still ticks every set", () => {
  // openingSets returns values only; the caller builds rows. This pins the
  // contract that it carries no completion state to copy.
  const o = openingSets([perf([{ weight: 60, reps: 8 }])]);
  assert.deepEqual(Object.keys(o).sort(), ["count", "reps", "weight"]);
});

// --- reps from the plan's goal target ----------------------------------------

test("a plan rep target wins over history reps, while the load still comes from history", () => {
  const history = [perf([{ weight: 60, reps: 12 }])];
  const o = openingSets(history, 3, 8);
  assert.equal(o.reps, 8, "the plan's target for this goal is what the user agreed to");
  assert.equal(o.weight, 60, "load is never invented — it comes from what was actually lifted");
  assert.equal(o.count, 3);
});

test("with no history a plan rep target still pre-fills reps, and the load stays empty", () => {
  const o = openingSets([], 4, 10);
  assert.equal(o.reps, 10);
  assert.equal(o.weight, 0, "no history means no honest load to suggest");
  assert.equal(o.count, 4);
});

test("without a plan target, reps fall back to the last performance", () => {
  const o = openingSets([perf([{ weight: 40, reps: 15 }])], 0, 0);
  assert.equal(o.reps, 15);
});

test("plan rep text resolves to the lower bound of a range and to nothing for timed work", () => {
  assert.equal(plannedRepsFrom("8–12"), 8, "a range pre-fills its floor");
  assert.equal(plannedRepsFrom("8-12"), 8);
  assert.equal(plannedRepsFrom("12"), 12);
  assert.equal(plannedRepsFrom("30–45 sec"), 0, "seconds are not reps");
  assert.equal(plannedRepsFrom("45s"), 0);
  assert.equal(plannedRepsFrom("2 min"), 0);
  assert.equal(plannedRepsFrom("AMRAP"), 0);
  assert.equal(plannedRepsFrom(""), 0);
  assert.equal(plannedRepsFrom(undefined), 0);
});
