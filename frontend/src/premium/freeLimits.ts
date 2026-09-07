// Free-tier limits — every cap a free plan applies, in one place.
//
// Both caps are `Infinity`: the whole app sits behind one Premium wall now, so
// nobody without access reaches History or Insights and a cap has nothing to
// cap. `Infinity` is the documented off switch — it needs no other code change
// — and the functions stay so a free tier can return by putting numbers back.
//
// A cap is NOT a gate. If a free tier returns, capped surfaces stay reachable:
// the user always sees their recent data and is told plainly what Premium adds.

export const FREE_LIMITS = {
  /** Completed workouts a free account can review in History. */
  historyWorkouts: Infinity,
  /** Days of Insights a free account can chart. */
  insightsDays: Infinity,
} as const;

/**
 * The slice of history a free account may review, newest first.
 *
 * `items` must already be in the caller's display order. Premium access returns
 * the list untouched — never a copy with a different identity, so memoised
 * consumers do not re-render for a subscriber.
 */
export function visibleHistory<T>(items: T[], hasPremium: boolean): T[] {
  if (hasPremium || items.length <= FREE_LIMITS.historyWorkouts) return items;
  return items.slice(0, FREE_LIMITS.historyWorkouts);
}

/** How many older workouts a free account is not being shown. Never negative. */
export function hiddenHistoryCount(total: number, hasPremium: boolean): number {
  if (hasPremium) return 0;
  return Math.max(0, total - FREE_LIMITS.historyWorkouts);
}

/** Whether a free account may chart the given period. */
export function canChartPeriod(days: number, hasPremium: boolean): boolean {
  return hasPremium || days <= FREE_LIMITS.insightsDays;
}
