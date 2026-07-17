// Central feature flags for the v1.1.0 release.
// Flip a flag to false to instantly disable a new feature without touching its code.
export const FLAGS = {
  /** Insights upgrade: week/month stats, streaks and personal records. */
  insightsV2: true,
  /** Library tab: searchable exercise directory grouped by muscle/equipment/movement. */
  libraryExercises: true,
  /** Coach: context-aware suggestions built from local workout history. */
  coachV2: true,
  /** Exercise animations (RepDB licensed pack) served from the backend. */
  exerciseAnimations: true,
} as const;
