// Which days of the current Monday–Sunday week already hold a completed
// workout — the Today date strip marks them. A workout counts when at least one
// of its sets is countable (setRules), the same rule as every other total, so
// an opened-and-abandoned session never ticks a day.
//
// Pure logic — no React, no storage.

import { CountableSet, isCountableSet } from "@/src/anatomy/setRules";

type WorkoutLike = { date: number; exercises: { sets: readonly CountableSet[] }[] };

/** Monday-first weekday index (0 = Mon … 6 = Sun) of a timestamp, local time. */
export function mondayIndex(ts: number): number {
  return (new Date(ts).getDay() + 6) % 7;
}

/** Weekday indexes (0 = Mon) in the week starting `weekStart` with a completed workout. */
export function completedDayIndexes(history: readonly WorkoutLike[], weekStart: number): Set<number> {
  const out = new Set<number>();
  // Calendar arithmetic, not 7 × 24 h, so a DST change inside the week cannot
  // shift Sunday evening into next week or the other way round.
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 7);
  const weekEnd = end.getTime();
  for (const w of history) {
    if (w.date < weekStart || w.date >= weekEnd) continue;
    if (w.exercises.some((e) => e.sets.some(isCountableSet))) out.add(mondayIndex(w.date));
  }
  return out;
}
