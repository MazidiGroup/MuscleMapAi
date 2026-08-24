// Binding the pure resolver to the app's real exercise catalogue.
//
// `./resolve` is deliberately catalogue-free so its rules can be tested against
// four fixtures instead of 206 records. This module is the thin adapter that
// supplies the real ones — and it is the only file in the watch feature that
// pulls in the 330 KB catalogue JSON.

import { EXERCISES, getExercise } from "@/src/anatomy/exercises";
import { EXERCISE_ALIASES } from "@/src/anatomy/search";
import { ExerciseIdSpace } from "@/src/session/activeSession";

import { ExerciseChoice } from "./commands";
import { ResolvableExercise, ResolveResult, resolveExercise } from "./resolve";

/** The whole catalogue as resolver candidates, with the app's own gym slang. */
export function catalogueCandidates(): ResolvableExercise[] {
  return EXERCISES.map((e) => ({
    exerciseId: e.id,
    idSpace: "anatomy" as ExerciseIdSpace,
    name: e.name,
    aliases: EXERCISE_ALIASES[e.id],
  }));
}

/** Display name for an id, falling back to the id so nothing renders blank. */
export function exerciseName(exerciseId: string, _idSpace: ExerciseIdSpace = "anatomy"): string {
  return getExercise(exerciseId)?.name || exerciseId;
}

/**
 * Whether an id exists. Plan ids are accepted without a catalogue lookup: the
 * Plan owns its own id space, and rejecting one here would refuse a set for an
 * exercise the user's own plan put in front of them.
 */
export function knowsExercise(exerciseId: string, idSpace: ExerciseIdSpace = "anatomy"): boolean {
  if (idSpace === "plan") return exerciseId.length > 0;
  return !!getExercise(exerciseId);
}

/** Resolves a spoken name against the live session first, then the catalogue. */
export function resolveSpokenExercise(spoken: string, inSession: readonly ExerciseChoice[]): ResolveResult {
  const sessionCandidates: ResolvableExercise[] = inSession.map((c) => ({
    exerciseId: c.exerciseId,
    idSpace: c.idSpace,
    name: c.name,
    aliases: EXERCISE_ALIASES[c.exerciseId],
  }));
  return resolveExercise(spoken, sessionCandidates, catalogueCandidates());
}
