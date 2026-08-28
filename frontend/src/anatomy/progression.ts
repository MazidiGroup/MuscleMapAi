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
  // The bigger step only once it is a modest RELATIVE jump: 5 kg on a 40 kg
  // lift is 12.5%, far too coarse for upper-body work. At 60 kg it is 8.3%,
  // and 10 lb at 150 lb is 6.7% — the plate maths still works, the leap no
  // longer outruns what a session actually earns.
  if (unit === "lb") return currentWeight >= 150 ? 10 : 5;
  return currentWeight >= 60 ? 5 : 2.5;
}

export type SuggestionKind = "add_load" | "add_reps" | "hold" | "reduce_load" | "first_time";

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

  // Two matching sessions stuck at the same load with no rep progress is a
  // stall, not a queue for a third identical attempt. One increment down and
  // rebuild — judged on a short trend, never on one poor day.
  const prev = performances[1];
  if (prev && prev.completedSets.length > 0 && topWeight > 0) {
    const prevTop = Math.max(0, ...prev.completedSets.map((s) => s.weight));
    const prevAtLoad = prev.completedSets.filter((s) => s.weight === prevTop);
    const prevMin = Math.min(...prevAtLoad.map((s) => s.reps));
    if (prevTop === topWeight && minReps <= prevMin && minReps < range.max) {
      const down = Math.max(0, Math.round((topWeight - loadIncrement(unit, topWeight)) * 100) / 100);
      if (down > 0) {
        return {
          kind: "reduce_load",
          targetWeight: down,
          targetReps: range.max,
          headline: `Drop to ${down} ${unit} and rebuild`,
          basis: `Two sessions stuck at ${topWeight} ${unit} \u00d7 ${minReps}`,
        };
      }
    }
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
 * The rep target a Plan entry carries, as a number the session can pre-fill.
 *
 * Plan entries describe reps as text: "8–12", "12", or a duration such as
 * "30–45 sec" for timed work. A range pre-fills its LOWER bound — the floor the
 * plan asks for, which the user then beats or edits. A timed entry has no rep
 * target, so it pre-fills nothing rather than a number that means seconds.
 */
export function plannedRepsFrom(repsOrTime: string | null | undefined): number {
  if (!repsOrTime) return 0;
  const text = String(repsOrTime).trim();
  if (/sec|min|\d\s*s\b/i.test(text)) return 0;
  const match = /^(\d+)/.exec(text);
  return match ? Math.max(0, parseInt(match[1], 10)) : 0;
}

/**
 * The planned COUNT for a set row: reps for rep work, seconds for timed work.
 *
 * `plannedRepsFrom` deliberately answers 0 for "30–45 sec" — seconds are not
 * reps — but a row opened at 0 can never be ticked Done (`canMarkDone` needs a
 * count), which made every planned plank, carry and hold uncompletable without
 * typing a number first. The seconds go into the same count field the user was
 * already typing them into; minutes are converted so "2 min" opens as 120.
 */
export function plannedCountFrom(repsOrTime: string | null | undefined): number {
  const reps = plannedRepsFrom(repsOrTime);
  if (reps > 0) return reps;
  if (!repsOrTime) return 0;
  const text = String(repsOrTime).trim();
  const match = /^(\d+)/.exec(text);
  if (!match) return 0;
  const n = Math.max(0, parseInt(match[1], 10));
  return /min/i.test(text) ? n * 60 : n;
}

/**
 * What a set row should start at when an exercise is added to a session.
 *
 * Reps come from the Plan's own target for the user's goal and routine when
 * the plan supplied one, otherwise from the user's most recent completed
 * performance. Load comes from that performance only — it is the one honest
 * source for a weight. With no history the load stays empty rather than
 * guessing, because a wrong prefilled weight is worse than a blank one: a
 * blank asks, a wrong number asserts. Nothing is carried across exercises,
 * every row remains editable and nothing is marked done.
 */
export function openingSets(
  performances: Performance[],
  plannedCount = 0,
  plannedReps = 0,
): { count: number; weight: number; reps: number } {
  // A Plan day PROMISES a number of sets. That promise always wins — including
  // when it promises exactly one — or the plan and the session disagree about
  // the workout the user agreed to. History only decides the count when no plan
  // asked for one.
  const planned = plannedCount >= 1 ? Math.floor(plannedCount) : 0;
  const targetReps = plannedReps >= 1 ? Math.floor(plannedReps) : 0;
  const last = performances.length ? performances[performances.length - 1] : null;
  if (!last || last.completedSets.length === 0) {
    return { count: Math.max(1, planned), weight: 0, reps: targetReps };
  }
  // The heaviest working set of that session is the one worth repeating; ties
  // resolve to the higher rep count.
  const best = last.completedSets.reduce((a, b) =>
    b.weight > a.weight || (b.weight === a.weight && b.reps > a.reps) ? b : a,
  );
  return {
    count: planned || Math.max(1, last.completedSets.length),
    weight: best.weight,
    reps: targetReps || best.reps,
  };
}
