// Progressive overload suggestions — v1.2.0.
//
// The app already stores every completed set per exercise, so it can answer the
// question a logger is actually asked in the gym: "what should I put on the bar
// today?" This module turns the stored history into that one answer.
//
// The rule is double progression, which is what the app's own sourced guidance
// already recommends:
//   1. hit the top of the rep range on every working set at a given load;
//   2. then add the smallest sensible increment and start again at the bottom.
// Until step 1 is met, the target is one more rep at the same load.
//
// Deliberate limits — a suggestion is a prompt, never an instruction:
//   · it is only offered once there is a completed performance to build on;
//   · warm-ups and 0-rep ticks never feed it (they are not working sets);
//   · bodyweight exercises progress on reps only, never on load;
//   · a load is only suggested in the unit it was logged in — nothing converts.
//
// Pure logic — no React, no storage.

import type { Goal } from "@/src/plan/exercises";
import type { Performance } from "@/src/history/metrics";

export type RepRange = { min: number; max: number };

/** Rep ranges matching the goal each plan is already built around. */
export const GOAL_REP_RANGE: Record<Goal, RepRange> = {
  strength: { min: 3, max: 6 },
  muscle: { min: 8, max: 12 },
  fatloss: { min: 10, max: 15 },
  general: { min: 8, max: 12 },
};

export const DEFAULT_REP_RANGE: RepRange = GOAL_REP_RANGE.general;

export function repRangeFor(goal: Goal | undefined | null): RepRange {
  return (goal && GOAL_REP_RANGE[goal]) || DEFAULT_REP_RANGE;
}

/**
 * Smallest jump that is actually loadable. Below the threshold a gym usually has
 * 2.5 kg / 5 lb available; above it, plate maths makes the bigger step the
 * realistic one.
 */
export function loadIncrement(unit: string, currentWeight: number): number {
  if (unit === "lb") return currentWeight >= 100 ? 10 : 5;
  return currentWeight >= 40 ? 5 : 2.5;
}

export type SuggestionKind = "add_load" | "add_reps" | "hold" | "first_time";

export type Suggestion = {
  kind: SuggestionKind;
  /** Target load in the stored unit. 0 for bodyweight or an unloaded lift. */
  targetWeight: number;
  targetReps: number;
  /** One-line prompt for the session card. */
  headline: string;
  /** What the suggestion was derived from, so the number is never unexplained. */
  basis: string;
};

export type SuggestInput = {
  /** Newest-first, as returned by exercisePerformances. */
  performances: Performance[];
  unit: string;
  goal?: Goal | null;
  /** Bodyweight lifts progress on reps only. */
  bodyweight?: boolean;
  repRange?: RepRange;
};

/**
 * The next target for an exercise, or null when there is nothing to build on.
 * Returning null is the honest answer for a first-ever exercise: the app has no
 * evidence and does not invent a starting weight.
 */
export function suggestNext(input: SuggestInput): Suggestion | null {
  const { performances, unit, bodyweight = false } = input;
  const range = input.repRange ?? repRangeFor(input.goal);

  // exercisePerformances already filters to working sets and sorts newest-first.
  const last = performances[0];
  if (!last || last.completedSets.length === 0) return null;

  const sets = last.completedSets;
  const topWeight = Math.max(0, ...sets.map((s) => s.weight));
  // Only the sets at the working load decide whether the range was cleared —
  // a lighter back-off set should not block progression.
  const atLoad = sets.filter((s) => s.weight === topWeight);
  const minReps = Math.min(...atLoad.map((s) => s.reps));
  const clearedRange = minReps >= range.max;
  const lastLabel = bodyweight || topWeight <= 0
    ? `${atLoad.length}×${minReps} last time`
    : `${topWeight} ${unit} × ${minReps} last time`;

  // Bodyweight (and any lift logged without load) can only progress on reps.
  if (bodyweight || topWeight <= 0) {
    return {
      kind: "add_reps",
      targetWeight: 0,
      targetReps: minReps + 1,
      headline: `Aim for ${minReps + 1} reps`,
      basis: lastLabel,
    };
  }

  if (clearedRange) {
    const step = loadIncrement(unit, topWeight);
    const next = Math.round((topWeight + step) * 100) / 100;
    return {
      kind: "add_load",
      targetWeight: next,
      targetReps: range.min,
      headline: `Try ${next} ${unit} × ${range.min}`,
      basis: `${lastLabel} — you cleared ${range.max} reps`,
    };
  }

  // Still inside the range: one more rep at the same load.
  const targetReps = Math.min(minReps + 1, range.max);
  if (targetReps <= minReps) {
    return {
      kind: "hold",
      targetWeight: topWeight,
      targetReps: minReps,
      headline: `Repeat ${topWeight} ${unit} × ${minReps}`,
      basis: lastLabel,
    };
  }
  return {
    kind: "add_reps",
    targetWeight: topWeight,
    targetReps,
    headline: `Try ${topWeight} ${unit} × ${targetReps}`,
    basis: lastLabel,
  };
}

// --- personal records ------------------------------------------------------

/**
 * Epley estimate. Used only to rank efforts against each other, never shown as
 * a number the user is told to attempt.
 */
export function estimated1RM(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

export type LiveRecord = { maxWeight: number; maxReps: number; bestE1RM: number };

/** The bests this exercise has to beat, from completed history only. */
export function recordsFrom(performances: Performance[]): LiveRecord {
  let maxWeight = 0;
  let maxReps = 0;
  let bestE1RM = 0;
  for (const p of performances) {
    for (const s of p.completedSets) {
      if (s.weight > maxWeight) maxWeight = s.weight;
      if (s.reps > maxReps) maxReps = s.reps;
      const e = estimated1RM(s.weight, s.reps);
      if (e > bestE1RM) bestE1RM = e;
    }
  }
  return { maxWeight, maxReps, bestE1RM };
}

export type PRKind = "weight" | "e1rm" | "reps";

/**
 * Whether a just-completed set beats the stored bests. Strictly greater, so
 * matching a record is not announced as breaking it. A record needs something
 * to beat: the first ever performance establishes the baseline silently.
 */
export function prForSet(
  set: { weight: number; reps: number },
  record: LiveRecord,
): PRKind | null {
  if (record.maxWeight <= 0 && record.maxReps <= 0) return null; // no baseline yet
  if (set.weight > 0 && set.weight > record.maxWeight) return "weight";
  if (set.weight > 0 && estimated1RM(set.weight, set.reps) > record.bestE1RM) return "e1rm";
  if (set.weight <= 0 && set.reps > record.maxReps) return "reps";
  return null;
}

export const PR_LABEL: Record<PRKind, string> = {
  weight: "Heaviest set yet",
  e1rm: "Strongest set yet",
  reps: "Most reps yet",
};

export const OVERLOAD_NOTE =
  "Suggested from your own completed sets on this exercise. Warm-ups are ignored. Train to how you feel on the day.";

// ---------------------------------------------------------------------------
// Opening values for a newly added exercise.
// ---------------------------------------------------------------------------

/**
 * What a set row should start at when an exercise is added to a session.
 *
 * Taken from the user's own most recent completed performance of that exact
 * exercise — never invented, and never carried across exercises. With no
 * history the rows stay empty rather than guessing a load, because a wrong
 * prefilled weight is worse than a blank one: a blank asks, a wrong number
 * asserts. The values are a starting point only; every row remains editable
 * and nothing is marked done.
 */
export function openingSets(
  performances: Performance[],
  plannedCount = 0,
): { count: number; weight: number; reps: number } {
  // A Plan day PROMISES a number of sets. That promise always wins — including
  // when it promises exactly one — or the plan and the session disagree about
  // the workout the user agreed to. History only decides the count when no plan
  // asked for one.
  const planned = plannedCount >= 1 ? Math.floor(plannedCount) : 0;
  const last = performances.length ? performances[performances.length - 1] : null;
  if (!last || last.completedSets.length === 0) {
    return { count: Math.max(1, planned), weight: 0, reps: 0 };
  }
  // The heaviest working set of that session is the one worth repeating; ties
  // resolve to the higher rep count.
  const best = last.completedSets.reduce((a, b) =>
    b.weight > a.weight || (b.weight === a.weight && b.reps > a.reps) ? b : a,
  );
  return {
    count: planned || Math.max(1, last.completedSets.length),
    weight: best.weight,
    reps: best.reps,
  };
}
