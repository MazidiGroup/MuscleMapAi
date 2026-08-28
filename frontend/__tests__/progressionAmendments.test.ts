// The decision-logic review amendments: timed rows must be completable, load
// steps must stay modest relative jumps, and a repeated stall must not queue a
// third identical attempt.
import assert from "node:assert/strict";
import test from "node:test";

import { loadIncrement, plannedCountFrom, plannedRepsFrom, suggestNext } from "../src/anatomy/progression";
import type { Performance } from "../src/history/metrics";

const perf = (sets: { weight: number; reps: number }[], date = 1): Performance => ({
  workoutId: `w${date}`,
  date,
  completedSets: sets.map((s, i) => ({ id: `s${i}`, weight: s.weight, reps: s.reps, done: true })),
  maxWeight: Math.max(0, ...sets.map((s) => s.weight)),
  volume: sets.reduce((a, s) => a + s.weight * s.reps, 0),
  reps: sets.reduce((a, s) => a + s.reps, 0),
});

test("timed prescriptions open rows at their seconds, so Done is reachable", () => {
  // plannedRepsFrom keeps meaning REPS — seconds are still not reps.
  assert.equal(plannedRepsFrom("30–45 sec"), 0);
  // The row count uses the duration, converted to seconds when in minutes.
  assert.equal(plannedCountFrom("30–45 sec"), 30);
  assert.equal(plannedCountFrom("45s"), 45);
  assert.equal(plannedCountFrom("2 min"), 120);
  // Rep work is untouched by the sibling.
  assert.equal(plannedCountFrom("8–12"), 8);
  assert.equal(plannedCountFrom(""), 0);
});

test("the bigger load step waits until it is a modest relative jump", () => {
  // 5 kg on 40 kg was a 12.5% leap; it now needs 60 kg (8.3%).
  assert.equal(loadIncrement("kg", 40), 2.5);
  assert.equal(loadIncrement("kg", 60), 5);
  assert.equal(loadIncrement("lb", 100), 5);
  assert.equal(loadIncrement("lb", 150), 10);
});

test("two sessions stuck at the same load suggest rebuilding lighter", () => {
  // Newest first: both sessions 60 kg × 8 against an 8–12 range — no progress.
  const stalled = [
    perf([{ weight: 60, reps: 8 }, { weight: 60, reps: 8 }], 2),
    perf([{ weight: 60, reps: 8 }], 1),
  ];
  const s = suggestNext({ performances: stalled, unit: "kg", goal: "muscle" });
  assert.ok(s);
  assert.equal(s!.kind, "reduce_load");
  assert.equal(s!.targetWeight, 55, "one increment down from 60 kg");

  // Progress between the two sessions — 8 up to 9 — is NOT a stall.
  const progressing = [
    perf([{ weight: 60, reps: 9 }], 2),
    perf([{ weight: 60, reps: 8 }], 1),
  ];
  const p = suggestNext({ performances: progressing, unit: "kg", goal: "muscle" });
  assert.ok(p);
  assert.equal(p!.kind, "add_reps");

  // One poor day alone never triggers a reduction.
  const single = [perf([{ weight: 60, reps: 8 }], 1)];
  const one = suggestNext({ performances: single, unit: "kg", goal: "muscle" });
  assert.ok(one);
  assert.equal(one!.kind, "add_reps");
});
