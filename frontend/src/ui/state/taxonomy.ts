// The seven — and only seven — non-happy-path categories from the frozen
// State System. A new category requires product review; it must never be
// invented during implementation.

export const STATE_TAXONOMY = [
  "loading",
  "empty",
  "offline",
  "recoverable_error",
  "blocking_error",
  "partial_success",
  "interrupted",
] as const;

export type StateCategory = (typeof STATE_TAXONOMY)[number];

/** Which shared component(s) may render each category. */
export const CATEGORY_COMPONENTS: Record<StateCategory, string[]> = {
  loading: ["LayoutSkeleton", "ActionButton(loading)", "StatusAnnouncement"],
  empty: ["EmptyState", "OwnerEmptyState"],
  offline: ["OfflineBanner", "EmptyState"],
  recoverable_error: ["ErrorBanner", "RetryPanel"],
  blocking_error: ["BlockingError"],
  partial_success: ["PartialSuccessPanel", "WarningBanner"],
  interrupted: ["InterruptedSessionCard", "InfoBanner"],
};

export function isStateCategory(v: string): v is StateCategory {
  return (STATE_TAXONOMY as readonly string[]).includes(v);
}
