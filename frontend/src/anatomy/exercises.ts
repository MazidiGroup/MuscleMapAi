// Backward-compat shim.
//
// The exercise catalog used to be a hardcoded list of 32 entries in this file.
// It now lives in `exerciseCatalog.ts` (backed by `exerciseCatalog.json`) with
// 206 entries from the July 2026 animation pack. We keep the old exports here
// (EXERCISES / getExercise / Exercise / EXERCISE_CATEGORIES) so nothing that
// imports from "@/src/anatomy/exercises" has to change.

import { FULL_CATALOG, getCatalogExercise, CatalogExercise } from "./exerciseCatalog";

// Public shape has stayed the same — CatalogExercise is a superset of the
// original Exercise type, so downstream code sees strictly-more fields.
export type Exercise = CatalogExercise;

export const EXERCISES: Exercise[] = FULL_CATALOG;

export const EXERCISE_CATEGORIES = ["Push", "Pull", "Legs", "Core", "Mobility"] as const;

export function getExercise(id: string): Exercise | undefined {
  return getCatalogExercise(id);
}
