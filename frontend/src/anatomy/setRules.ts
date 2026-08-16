// The single rule for which logged sets count — v1.2.0.
//
// Before this module the rule was "done === true", which let a set be ticked
// with 0 reps and still enter totals, streaks and records. A set now has to
// carry at least one rep to count anywhere, and the check lives in exactly one
// place so History, Insights, the Plan tick and the PR calculation can never
// drift apart.
//
// Two tiers, deliberately distinct:
//   · countable — logged work. Feeds completed-set counts, streaks, the Plan
//     tick and muscle activation.
//   · working   — countable and not a warm-up. Feeds volume and records only.
//
// Warm-up flags are new in v1.2.0. Records saved before it have no flag, so
// every historical set reads as a working set and no stored total shifts.
//
// Pure logic — no React, no storage.

/** The minimum this module accepts as a logged rep. */
export const MIN_COUNTABLE_REPS = 1;

/** Structural shape only, so both the live session and stored history fit. */
export type CountableSet = {
  weight: number;
  reps: number;
  done: boolean;
  /** Warm-up sets are saved and shown, but never enter volume or records. */
  warmup?: boolean;
};

/**
 * Done alone is not enough: a set with no reps records no work. This is the
 * guard behind the fix for a 0-rep set counting toward totals and streaks.
 */
export function isCountableSet(s: CountableSet | null | undefined): boolean {
  return !!s && s.done === true && Number.isFinite(s.reps) && s.reps >= MIN_COUNTABLE_REPS;
}

/** Countable and not a warm-up — the only sets that move volume or a record. */
export function isWorkingSet(s: CountableSet | null | undefined): boolean {
  return isCountableSet(s) && !s?.warmup;
}

/** True when the set may be ticked Done. Mirrors isCountableSet's rep rule. */
export function canMarkDone(s: CountableSet | null | undefined): boolean {
  return !!s && Number.isFinite(s.reps) && s.reps >= MIN_COUNTABLE_REPS;
}

export function countableSets<T extends CountableSet>(sets: readonly T[] | null | undefined): T[] {
  return (sets || []).filter(isCountableSet);
}

export function workingSets<T extends CountableSet>(sets: readonly T[] | null | undefined): T[] {
  return (sets || []).filter(isWorkingSet);
}

/** Load moved by one set. Bodyweight carries weight 0 and so adds nothing. */
export function setVolume(s: CountableSet): number {
  return s.weight * s.reps;
}

/** Total load for a list, warm-ups excluded. */
export function totalVolume(sets: readonly CountableSet[] | null | undefined): number {
  return workingSets(sets).reduce((a, s) => a + setVolume(s), 0);
}

export const ZERO_REP_HINT = "Add at least 1 rep before marking this set done.";

export const WARMUP_NOTE =
  "Warm-up sets are saved with your session but excluded from volume and personal records.";
