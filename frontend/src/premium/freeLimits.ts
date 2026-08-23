// Free-tier limits — every cap the free plan applies, in one place.
//
// These are deliberately centralised. If App Store review objects to a limit,
// or the business wants to loosen one, it is a single number here rather than a
// hunt through screens. A limit of `Infinity` disables that cap entirely and is
// the intended rollback, because it needs no other code change.
//
// A cap is NOT a gate. Capped surfaces stay free and reachable: the user always
// sees their recent data and is told plainly what Premium adds. Nothing is ever
// hidden without saying so, and no free surface is ever locked behind
// `PremiumGate` — see the release-gate assertions.

export const FREE_LIMITS = {
  /** Completed workouts a free account can review in History. */
  historyWorkouts: 14,
  /** Days of Insights a free account can chart. One week. */
  insightsDays: 7,
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
