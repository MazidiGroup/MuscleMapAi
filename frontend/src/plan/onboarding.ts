// Fast onboarding contract — Direction B, Phase 2.
//
// Exactly THREE questions, in this order:
//   1 of 3  Goal
//   2 of 3  Which days can you train?   (specific Mon–Sun weekdays, not a count)
//   3 of 3  Equipment
//
// Session length is not asked. Experience, focus regions and posture work are no
// longer questions: they resolve to explicit, documented defaults, and any value
// already stored for a returning owner is preserved rather than overwritten.
//
// Pure logic only — no React, no storage — so the whole step machine is testable.

import type { Answers, Equipment, Experience, Goal, Region } from "./exercises";

export const ONBOARDING_STEPS = ["goal", "days", "equipment"] as const;
export type OnboardingStepKey = (typeof ONBOARDING_STEPS)[number];

export const ONBOARDING_STEP_COUNT = ONBOARDING_STEPS.length;

/** Persisted `step` values used by the Plan tab state machine. */
export const STEP_WELCOME = 0;
export const STEP_FIRST_QUESTION = 1;
export const STEP_LAST_QUESTION = ONBOARDING_STEP_COUNT;
export const STEP_BUILDING = 7;
export const STEP_PLAN_READY = 100;

/** Human step mapping shown in the header: "1 of 3". */
export function stepLabel(step: number): string {
  return `${step} of ${ONBOARDING_STEP_COUNT}`;
}

export function stepKey(step: number): OnboardingStepKey | null {
  return ONBOARDING_STEPS[step - 1] ?? null;
}

export type Weekday = { index: number; short: string; long: string };

/** 0 = Monday … 6 = Sunday, matching `Answers.days`. */
export const WEEKDAYS: Weekday[] = [
  { index: 0, short: "Mon", long: "Monday" },
  { index: 1, short: "Tue", long: "Tuesday" },
  { index: 2, short: "Wed", long: "Wednesday" },
  { index: 3, short: "Thu", long: "Thursday" },
  { index: 4, short: "Fri", long: "Friday" },
  { index: 5, short: "Sat", long: "Saturday" },
  { index: 6, short: "Sun", long: "Sunday" },
];

/** Defaults for everything we stopped asking. Documented, never silent guesses. */
export const ANSWER_DEFAULTS = {
  exp: "beginner" as Experience,
  days: [0, 2, 4],
  equip: [] as Equipment[],
  focus: [] as Region[],
  posture: false,
};

export function toggleWeekday(days: number[], index: number): number[] {
  const set = days.includes(index) ? days.filter((d) => d !== index) : [...days, index];
  return set.filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);
}

/** "4 days / week" — a count is only ever a DISPLAY of the stored weekdays. */
export function daysSummary(days: number[]): string {
  const n = days.length;
  return `${n} ${n === 1 ? "day" : "days"} / week`;
}

export function weekdayNames(days: number[], long = false): string[] {
  return [...days]
    .sort((a, b) => a - b)
    .map((d) => WEEKDAYS[d])
    .filter(Boolean)
    .map((w) => (long ? w.long : w.short));
}

/** A question is answered when it has a usable value. Equipment may be empty. */
export function isStepComplete(step: number, answers: Partial<Answers>): boolean {
  switch (stepKey(step)) {
    case "goal":
      return !!answers.goal;
    case "days":
      return !!answers.days && answers.days.length >= 1;
    case "equipment":
      return true; // bodyweight-only is a valid answer
    default:
      return false;
  }
}

/** Every question answered — the Building step may run. */
export function isOnboardingComplete(answers: Partial<Answers>): boolean {
  return ONBOARDING_STEPS.every((_, i) => isStepComplete(i + 1, answers));
}

/**
 * Turns partial answers into the complete shape `buildPlan` requires. Stored
 * values always win; only genuinely missing fields fall back to a default.
 */
export function normalizeAnswers(partial: Partial<Answers>): Answers {
  const days = Array.isArray(partial.days) && partial.days.length ? [...partial.days].sort((a, b) => a - b) : ANSWER_DEFAULTS.days;
  return {
    goal: (partial.goal || "general") as Goal,
    exp: (partial.exp || ANSWER_DEFAULTS.exp) as Experience,
    days,
    equip: Array.isArray(partial.equip) ? partial.equip : ANSWER_DEFAULTS.equip,
    focus: Array.isArray(partial.focus) ? partial.focus : ANSWER_DEFAULTS.focus,
    posture: typeof partial.posture === "boolean" ? partial.posture : ANSWER_DEFAULTS.posture,
  };
}

/**
 * Maps any persisted step — including values written by the previous six-step
 * flow — onto the three-question machine, without discarding stored selections.
 */
export function routeStep(step: number, hasPlan: boolean): number {
  if (step >= STEP_FIRST_QUESTION && step <= STEP_LAST_QUESTION) return step;
  if (hasPlan) return STEP_PLAN_READY;
  if (step <= STEP_WELCOME) return STEP_WELCOME;
  // 4…99 can only come from the retired longer flow, or from an interrupted
  // build. Resume on the last question so nothing the user picked is lost.
  return STEP_LAST_QUESTION;
}
