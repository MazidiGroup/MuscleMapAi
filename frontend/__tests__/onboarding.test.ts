// Phase 2 — fast onboarding contract: exactly three questions, weekday storage,
// documented defaults and forward-mapping of steps written by the retired flow.
import assert from "node:assert/strict";
import test from "node:test";

import {
  ANSWER_DEFAULTS,
  ONBOARDING_STEPS,
  ONBOARDING_STEP_COUNT,
  STEP_PLAN_READY,
  STEP_WELCOME,
  daysSummary,
  isOnboardingComplete,
  isStepComplete,
  normalizeAnswers,
  routeStep,
  stepKey,
  stepLabel,
  toggleWeekday,
  weekdayNames,
} from "../src/plan/onboarding";

test("onboarding asks exactly three questions, in order", () => {
  assert.equal(ONBOARDING_STEP_COUNT, 3);
  assert.deepEqual([...ONBOARDING_STEPS], ["goal", "days", "equipment"]);
  assert.equal(stepKey(4), null, "there is no fourth question");
});

test("session length is not one of the questions", () => {
  assert.ok(!ONBOARDING_STEPS.some((s) => /session|length|duration|minutes/i.test(s)));
});

test("step mapping reads '1 of 3'", () => {
  assert.equal(stepLabel(1), "1 of 3");
  assert.equal(stepLabel(3), "3 of 3");
});

test("training days are stored as weekdays, and a count is only a display", () => {
  let days: number[] = [];
  days = toggleWeekday(days, 2); // Wed
  days = toggleWeekday(days, 0); // Mon
  days = toggleWeekday(days, 4); // Fri
  assert.deepEqual(days, [0, 2, 4], "stored sorted weekday indices, not a count");
  assert.deepEqual(weekdayNames(days), ["Mon", "Wed", "Fri"]);
  assert.equal(daysSummary(days), "3 days / week");
  days = toggleWeekday(days, 2);
  assert.deepEqual(days, [0, 4], "tapping again deselects that weekday");
  assert.equal(daysSummary([1]), "1 day / week");
});

test("out-of-range weekdays can never be stored", () => {
  assert.deepEqual(toggleWeekday([], 9), []);
});

test("goal and days are required; bodyweight-only equipment is a valid answer", () => {
  assert.equal(isStepComplete(1, {}), false);
  assert.equal(isStepComplete(1, { goal: "muscle" }), true);
  assert.equal(isStepComplete(2, { days: [] }), false);
  assert.equal(isStepComplete(2, { days: [0] }), true);
  assert.equal(isStepComplete(3, { equip: [] }), true);
  assert.equal(isOnboardingComplete({ goal: "muscle", days: [0, 3] }), true);
});

test("retired questions resolve to documented defaults", () => {
  const a = normalizeAnswers({ goal: "strength", days: [1, 3] });
  assert.equal(a.exp, ANSWER_DEFAULTS.exp);
  assert.deepEqual(a.focus, []);
  assert.equal(a.posture, false);
  assert.deepEqual(a.days, [1, 3]);
  assert.deepEqual(a.equip, []);
});

test("stored answers from the longer flow are preserved, never overwritten", () => {
  const a = normalizeAnswers({
    goal: "muscle",
    exp: "advanced",
    days: [5, 0, 2],
    equip: ["db", "bb"],
    focus: ["arms"],
    posture: true,
  });
  assert.equal(a.exp, "advanced");
  assert.deepEqual(a.focus, ["arms"]);
  assert.equal(a.posture, true);
  assert.deepEqual(a.days, [0, 2, 5], "weekdays are normalised to sorted order");
  assert.deepEqual(a.equip, ["db", "bb"]);
});

test("a missing goal falls back without inventing a training week", () => {
  const a = normalizeAnswers({});
  assert.equal(a.goal, "general");
  assert.deepEqual(a.days, ANSWER_DEFAULTS.days);
});

test("persisted steps from the six-question flow map forward without losing answers", () => {
  assert.equal(routeStep(0, false), STEP_WELCOME);
  assert.equal(routeStep(1, false), 1);
  assert.equal(routeStep(3, false), 3);
  // 4, 5, 6 and the old building step can only come from the retired flow.
  assert.equal(routeStep(5, false), ONBOARDING_STEP_COUNT);
  assert.equal(routeStep(7, false), ONBOARDING_STEP_COUNT);
  assert.equal(routeStep(100, true), STEP_PLAN_READY);
  assert.equal(routeStep(7, true), STEP_PLAN_READY, "an owner with a plan lands on the plan");
  assert.equal(routeStep(2, true), 2, "re-editing answers with a plan stays on the question");
});
