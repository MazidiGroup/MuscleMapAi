// Library → workout routing and guards — Phase 3.
//
// Adding from the Library reuses the verified Phase 2 session mutation. This
// module only decides WHICH context the user is in and holds the frozen copy;
// it performs no mutation itself, so there is exactly one mutation system.

import type { Plan } from "@/src/plan/exercises";
import type { SessionExercise } from "@/src/anatomy/workoutScope";
import type { ExerciseIdSpace } from "@/src/session/activeSession";

export type AddContext =
  /** A workout is being logged right now: Add / View / Cancel, never a duplicate. */
  | { kind: "active" }
  /** A Plan exists, so the exercise can join today's session as an extra. */
  | { kind: "planned"; dayIndex: number; restDay: boolean }
  /** Nothing to add to yet. */
  | { kind: "no-plan" };

export function resolveAddContext(input: {
  hasActiveSession: boolean;
  plan: Plan | null;
  now?: Date;
}): AddContext {
  if (input.hasActiveSession) return { kind: "active" };
  if (!input.plan) return { kind: "no-plan" };
  const now = input.now ?? new Date();
  const dayIndex = (now.getDay() + 6) % 7;
  return { kind: "planned", dayIndex, restDay: !!input.plan.days?.[dayIndex]?.rest };
}

/** Duplicate protection: the same exact id in the same ID space is already there. */
export function isAlreadyInSession(
  session: SessionExercise[] | null,
  exerciseId: string,
  idSpace: ExerciseIdSpace = "anatomy",
): boolean {
  if (!session) return false;
  return session.some((e) => e.exerciseId === exerciseId && (e.idSpace ?? "anatomy") === idSpace);
}

export const ADD_COPY = {
  onlyLine: "This workout only. Your weekly Plan stays unchanged.",
  addedExtra: "Added to today’s workout as an extra exercise. Your weekly Plan is unchanged.",
  activeTitle: "You have an active workout.",
  addFailure:
    "Nothing changed. Your workout is exactly as it was and your selection is kept. Try again.",
  unverified:
    "Couldn’t confirm that exercise was added. Your selection is still here.",
  alreadyThere: (name: string) => `${name} is already in this workout.`,
  noPlan: "You don’t have a Plan yet, so there’s no session to add this to.",
} as const;
