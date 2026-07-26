// Phase 2 — "Adjust plan": whole-week rebuild with the frozen safeguards.
import assert from "node:assert/strict";
import test from "node:test";

import {
  DOW_ORDER,
  isDayCompleted,
  isoForDowInWeek,
  previewAdjustedPlan,
  verifyPlanShape,
} from "../src/plan/adjustPlan";
import { normalizeAnswers } from "../src/plan/onboarding";
import { buildPlan } from "../src/plan/planAdapter";
import type { Answers, Plan, PlanDay } from "../src/plan/exercises";

// Wednesday, 17 June 2026 — fixed so weekday arithmetic is deterministic.
const NOW = new Date(2026, 5, 17);

const ANSWERS: Answers = normalizeAnswers({ goal: "muscle", days: [0, 2, 4], equip: ["db"] });

function day(dow: string, ids: string[] | null): PlanDay {
  if (!ids) return { dow, rest: true };
  return {
    dow,
    rest: false,
    type: "full",
    typeName: "Full Body",
    minutes: 45,
    exercises: ids.map((id) => ({
      id,
      name: `Exercise ${id}`,
      muscle: "chest",
      pattern: "push",
      compound: true,
      timed: false,
      sets: 3,
      repsOrTime: "10",
      rest: "60 sec",
    })),
    focusMuscles: ["chest"],
  } as PlanDay;
}

function makePlan(spec: (string[] | null)[], split = "Full body"): Plan {
  return {
    answers: ANSWERS,
    seed: 1,
    splitLabel: split,
    splitName: split,
    days: DOW_ORDER.map((dow, i) => day(dow, spec[i] ?? null)),
  };
}

const CURRENT = makePlan([["a1"], null, ["b1"], null, ["c1"], null, null], "Full body");
const CANDIDATE = makePlan([["x1"], ["x2"], ["x3"], null, null, null, null], "Upper / Lower");
const build = () => JSON.parse(JSON.stringify({ ...CANDIDATE, seed: 99 })) as Plan;

function completionsFor(dowIndex: number, ids: string[]) {
  const dateISO = isoForDowInWeek(dowIndex, NOW);
  return Object.fromEntries(ids.map((id) => [`${dateISO}:${id}`, true]));
}

test("weekday dates are Monday-based within the current week", () => {
  assert.equal(isoForDowInWeek(0, NOW), "2026-06-15");
  assert.equal(isoForDowInWeek(2, NOW), "2026-06-17");
  assert.equal(isoForDowInWeek(6, NOW), "2026-06-21");
});

test("a day only counts as completed when every exercise is ticked", () => {
  const monday = CURRENT.days[0];
  assert.equal(isDayCompleted(monday, 0, {}, NOW), false);
  assert.equal(isDayCompleted(monday, 0, completionsFor(0, ["a1"]), NOW), true);
  assert.equal(isDayCompleted(CURRENT.days[1], 1, completionsFor(1, []), NOW), false, "a rest day is never 'completed'");
});

test("adjusting is refused while a workout is active, and changes nothing", () => {
  const before = JSON.parse(JSON.stringify(CURRENT));
  const res = previewAdjustedPlan({
    current: CURRENT,
    answers: ANSWERS,
    seed: 7,
    completions: {},
    hasActiveWorkout: true,
    now: NOW,
    build,
  });
  assert.deepEqual(res, { ok: false, reason: "active_workout" });
  assert.deepEqual(CURRENT, before, "the current plan is untouched");
});

test("completed days are kept byte-for-byte and the rest of the week is rebuilt", () => {
  const res = previewAdjustedPlan({
    current: CURRENT,
    answers: ANSWERS,
    seed: 7,
    completions: completionsFor(0, ["a1"]),
    hasActiveWorkout: false,
    now: NOW,
    build,
  });
  assert.ok(res.ok);
  assert.equal(res.plan.days[0], CURRENT.days[0], "Monday was completed — same object, untouched");
  assert.deepEqual(res.plan.days[1].exercises?.map((e) => e.id), ["x2"], "Tuesday comes from the replacement");
  assert.deepEqual(res.plan.days[2].exercises?.map((e) => e.id), ["x3"]);
  assert.equal(res.plan.days[4].rest, true, "Friday is no longer scheduled");
  assert.deepEqual(res.summary.keptCompletedDays, ["Monday"]);
});

test("the change summary describes exactly what will happen", () => {
  const res = previewAdjustedPlan({
    current: CURRENT,
    answers: ANSWERS,
    seed: 7,
    completions: completionsFor(0, ["a1"]),
    hasActiveWorkout: false,
    now: NOW,
    build,
  });
  assert.ok(res.ok);
  const s = res.summary;
  assert.deepEqual(s.rebuiltDays, ["Tuesday", "Wednesday", "Friday"]);
  assert.deepEqual(s.addedTrainingDays, ["Tuesday"]);
  assert.deepEqual(s.removedTrainingDays, ["Friday"]);
  assert.equal(s.splitBefore, "Full body");
  assert.equal(s.splitAfter, "Upper / Lower");
  assert.equal(s.daysPerWeek, 3);
  assert.equal(s.noChange, false);
});

test("an identical rebuild is reported as no change", () => {
  const res = previewAdjustedPlan({
    current: CURRENT,
    answers: ANSWERS,
    seed: 7,
    completions: {},
    hasActiveWorkout: false,
    now: NOW,
    build: () => JSON.parse(JSON.stringify(CURRENT)) as Plan,
  });
  assert.ok(res.ok);
  assert.equal(res.summary.noChange, true);
  assert.deepEqual(res.summary.rebuiltDays, []);
});

test("an unverifiable replacement is rejected and the plan is preserved", () => {
  const before = JSON.parse(JSON.stringify(CURRENT));
  const broken = () => {
    const p = makePlan([["x1"], null, null, null, null, null, null]);
    p.days[0].exercises = []; // a training day with no exercises
    return p;
  };
  const res = previewAdjustedPlan({
    current: CURRENT,
    answers: ANSWERS,
    seed: 7,
    completions: {},
    hasActiveWorkout: false,
    now: NOW,
    build: broken,
  });
  assert.deepEqual(res, { ok: false, reason: "verify_failed" });
  assert.deepEqual(CURRENT, before);
});

test("a generator failure is reported, never published", () => {
  const res = previewAdjustedPlan({
    current: CURRENT,
    answers: ANSWERS,
    seed: 7,
    completions: {},
    hasActiveWorkout: false,
    now: NOW,
    build: () => {
      throw new Error("boom");
    },
  });
  assert.deepEqual(res, { ok: false, reason: "build_failed" });
});

test("the user's selections survive a failed adjustment", () => {
  const answers = normalizeAnswers({ goal: "strength", days: [1, 5], equip: ["bb", "pullup"] });
  const snapshot = JSON.parse(JSON.stringify(answers));
  previewAdjustedPlan({
    current: CURRENT,
    answers,
    seed: 7,
    completions: {},
    hasActiveWorkout: false,
    now: NOW,
    build: () => {
      throw new Error("boom");
    },
  });
  assert.deepEqual(answers, snapshot);
});

test("verification rejects structurally wrong plans", () => {
  assert.equal(verifyPlanShape(null), false);
  assert.equal(verifyPlanShape({ days: [] }), false);
  const wrongOrder = makePlan([["a"], null, null, null, null, null, null]);
  wrongOrder.days[1].dow = "Friday";
  assert.equal(verifyPlanShape(wrongOrder), false);
  const nameless = makePlan([["a"], null, null, null, null, null, null]);
  nameless.days[0].exercises![0].name = "";
  assert.equal(verifyPlanShape(nameless), false);
  assert.equal(verifyPlanShape(CURRENT), true);
});

test("the real generator produces a plan that passes verification", () => {
  const real = buildPlan(ANSWERS, 4242);
  assert.equal(verifyPlanShape(real), true);
  const res = previewAdjustedPlan({
    current: real,
    answers: ANSWERS,
    seed: 4243,
    completions: {},
    hasActiveWorkout: false,
    now: NOW,
  });
  assert.ok(res.ok);
  assert.equal(res.plan.days.length, 7);
  assert.equal(res.plan.days.filter((d) => !d.rest).length, ANSWERS.days.length);
});
