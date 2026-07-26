// "Adjust plan" — whole-week rebuild with the frozen safeguards.
//
// The action rebuilds the REMAINING scheduled workouts of the current week from
// the owner's current answers (which may have changed goal, training days or
// equipment) and:
//   · keeps completed days exactly as they are;
//   · never touches History;
//   · is refused outright while a workout is active;
//   · only produces a replacement that passes structural verification;
//   · returns a change summary so the UI can require confirmation;
//   · leaves the current plan untouched on any failure.
//
// Pure logic — no React, no storage. `previewAdjustedPlan` computes a candidate;
// the caller decides whether to publish it.

import type { Answers, Plan, PlanDay } from "./exercises";
import { buildPlan } from "./planAdapter";

export const DOW_ORDER = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

/** Local ISO date (YYYY-MM-DD) for a Monday-based weekday in `now`'s week. */
export function isoForDowInWeek(dowIndex: number, now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const mondayOffset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - mondayOffset + dowIndex);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export type Completions = Record<string, boolean>;

/** A training day counts as completed when every one of its exercises is ticked. */
export function isDayCompleted(day: PlanDay, dowIndex: number, completions: Completions, now: Date = new Date()): boolean {
  if (day.rest) return false;
  const exercises = day.exercises || [];
  if (exercises.length === 0) return false;
  const dateISO = isoForDowInWeek(dowIndex, now);
  return exercises.every((ex) => !!completions[`${dateISO}:${ex.id}`]);
}

/** Structural verification. A replacement plan is only published if this passes. */
export function verifyPlanShape(plan: unknown): plan is Plan {
  const p = plan as Plan | null;
  if (!p || typeof p !== "object") return false;
  if (!Array.isArray(p.days) || p.days.length !== DOW_ORDER.length) return false;
  for (let i = 0; i < DOW_ORDER.length; i++) {
    const day = p.days[i];
    if (!day || day.dow !== DOW_ORDER[i]) return false;
    if (day.rest) continue;
    const exercises = day.exercises;
    if (!Array.isArray(exercises) || exercises.length === 0) return false;
    for (const ex of exercises) {
      if (!ex || typeof ex.id !== "string" || ex.id.length === 0) return false;
      if (typeof ex.name !== "string" || ex.name.length === 0) return false;
    }
  }
  if (!p.answers || !Array.isArray(p.answers.days)) return false;
  return true;
}

function dayFingerprint(day: PlanDay): string {
  if (day.rest) return "rest";
  return `${day.type || ""}|${(day.exercises || []).map((e) => e.id).join(",")}`;
}

export type AdjustSummary = {
  /** Days whose content is being replaced. */
  rebuiltDays: string[];
  /** Completed days kept byte-for-byte. */
  keptCompletedDays: string[];
  /** Days that were rest and now hold a workout. */
  addedTrainingDays: string[];
  /** Days that held a workout and now rest. */
  removedTrainingDays: string[];
  splitBefore: string;
  splitAfter: string;
  daysPerWeek: number;
  /** True when nothing at all would change. */
  noChange: boolean;
};

export type AdjustOutcome =
  | { ok: true; plan: Plan; summary: AdjustSummary }
  | { ok: false; reason: "active_workout" | "no_current_plan" | "build_failed" | "verify_failed" };

export function summarizeAdjustment(current: Plan, next: Plan, keptIdx: number[]): AdjustSummary {
  const kept = new Set(keptIdx);
  const rebuiltDays: string[] = [];
  const keptCompletedDays: string[] = [];
  const addedTrainingDays: string[] = [];
  const removedTrainingDays: string[] = [];

  for (let i = 0; i < DOW_ORDER.length; i++) {
    const dow = DOW_ORDER[i];
    const before = current.days[i];
    const after = next.days[i];
    if (kept.has(i)) {
      keptCompletedDays.push(dow);
      continue;
    }
    if (before.rest && !after.rest) addedTrainingDays.push(dow);
    else if (!before.rest && after.rest) removedTrainingDays.push(dow);
    if (dayFingerprint(before) !== dayFingerprint(after)) rebuiltDays.push(dow);
  }

  return {
    rebuiltDays,
    keptCompletedDays,
    addedTrainingDays,
    removedTrainingDays,
    splitBefore: current.splitLabel,
    splitAfter: next.splitLabel,
    daysPerWeek: next.days.filter((d) => !d.rest).length,
    noChange: rebuiltDays.length === 0 && current.splitLabel === next.splitLabel,
  };
}

export type AdjustInput = {
  current: Plan | null;
  answers: Answers;
  seed: number;
  completions: Completions;
  hasActiveWorkout: boolean;
  now?: Date;
  /** Injected for deterministic tests. */
  build?: (answers: Answers, seed: number) => Plan;
};

/**
 * Computes a verified replacement plan. The current plan is never mutated, so a
 * caller that gets `ok: false` still has exactly what the user had before.
 */
export function previewAdjustedPlan(input: AdjustInput): AdjustOutcome {
  const { current, answers, seed, completions, hasActiveWorkout } = input;
  const now = input.now ?? new Date();
  const build = input.build ?? buildPlan;

  if (hasActiveWorkout) return { ok: false, reason: "active_workout" };
  if (!current || !verifyPlanShape(current)) return { ok: false, reason: "no_current_plan" };

  let candidate: Plan;
  try {
    candidate = build(answers, seed);
  } catch {
    return { ok: false, reason: "build_failed" };
  }
  if (!verifyPlanShape(candidate)) return { ok: false, reason: "verify_failed" };

  // Completed days survive untouched; everything else comes from the candidate.
  const keptIdx: number[] = [];
  const days: PlanDay[] = DOW_ORDER.map((_, i) => {
    if (isDayCompleted(current.days[i], i, completions, now)) {
      keptIdx.push(i);
      return current.days[i];
    }
    return candidate.days[i];
  });

  const next: Plan = { ...candidate, days };
  if (!verifyPlanShape(next)) return { ok: false, reason: "verify_failed" };

  return { ok: true, plan: next, summary: summarizeAdjustment(current, next, keptIdx) };
}
