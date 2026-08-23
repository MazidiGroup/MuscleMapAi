// Release-source correction — the Plan day's promised set count must reach the
// Active Workout. The rejected release collapsed every planned exercise to a
// single set; inspection proved the accepted commit shared that defect.
import assert from "node:assert/strict";
import test from "node:test";

import { plannedSetCount } from "../src/anatomy/workoutScope";

test("a planned exercise starts with exactly its planned number of sets", () => {
  assert.equal(plannedSetCount(3), 3, "a 3-set plan entry must open 3 loggable sets");
  assert.equal(plannedSetCount(4), 4);
  assert.equal(plannedSetCount(1), 1);
});

test("an unusable planned count falls back to one set instead of dropping the exercise", () => {
  for (const bad of [undefined, null, 0, -2, NaN, Infinity, "3", {}, []]) {
    assert.equal(plannedSetCount(bad as unknown), 1, String(bad));
  }
});

test("a damaged plan record can never generate an unbounded session", () => {
  assert.equal(plannedSetCount(11), 10);
  assert.equal(plannedSetCount(1e6), 10);
  assert.equal(plannedSetCount(3.9), 3, "fractional counts are floored, never rounded up");
});

test("the plan-linked add path passes the planned count through", () => {
  // Guard against the exact regression: both Plan call sites must forward the
  // planned set count, and the store must accept it.
  const fs = require("node:fs") as typeof import("node:fs");
  const path = require("node:path") as typeof import("node:path");
  const root = process.env.MMA_TEST_ROOT as string;
  const plan = fs.readFileSync(path.join(root, "src/plan/PlanViews.tsx"), "utf8");
  const store = fs.readFileSync(path.join(root, "src/anatomy/workoutStore.tsx"), "utf8");
  const calls = plan.match(/addExerciseFromPlan\([^)]*\)/g) ?? [];
  assert.ok(calls.length >= 2, "both Plan call sites exist");
  for (const call of calls) {
    // The planned count is followed by the plan day name, which the title helper stores.
    assert.ok(/,\s*(it|ex)\.sets\s*(,\s*day\.typeName\s*)?\)/.test(call), `planned sets must be passed: ${call}`);
    assert.ok(/,\s*day\.typeName\s*\)/.test(call), `the plan day name must be passed: ${call}`);
  }
  assert.ok(
    /addExerciseFromPlan = useCallback\(\(id: string, planDate: string, plannedSets = 1, planName\?: string\)/.test(store),
    "the store accepts the planned set count",
  );
  // The seam moved when opening sets became pre-filled from history, but the
  // guarantee did not: the planned count is still what reaches the session, and
  // `openingSets` treats a plan count as authoritative over history.
  assert.ok(
    store.includes('openingSetRows(history, id, "plan", plannedSetCount(plannedSets))'),
    "the session is seeded with the planned number of rows",
  );
  const progression = fs.readFileSync(path.join(root, "src/anatomy/progression.ts"), "utf8");
  assert.ok(
    /const planned = plannedCount >= 1 \? Math\.floor\(plannedCount\) : 0;/.test(progression),
    "a planned count of one is still a planned count",
  );
  assert.ok(
    !/idSpace: "plan" as ExerciseIdSpace,\s*\n\s*sets: \[\{ id: uid\(\)/.test(store),
    "the single-set hardcode is gone",
  );
});

test("an exercise already in the session is never rewritten by a second plan add", () => {
  const fs = require("node:fs") as typeof import("node:fs");
  const path = require("node:path") as typeof import("node:path");
  const store = fs.readFileSync(path.join(process.env.MMA_TEST_ROOT as string, "src/anatomy/workoutStore.tsx"), "utf8");
  // The duplicate branch only stamps planLink; it must not touch sets.
  const branch = store.slice(store.indexOf("if (base.some((e) => e.exerciseId === id))"));
  const upToReturn = branch.slice(0, branch.indexOf("return ["));
  assert.ok(!/sets:/.test(upToReturn), "a second add must not replace sets the user may be logging");
});
