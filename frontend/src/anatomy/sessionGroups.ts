// Gym groups from exercises — the same node → group mapping the recovery
// engine uses (an exercise's primary GLB muscle nodes → getMuscleInfo().group).
// Shared by the Today recovery line and the post-workout share card so the two
// can never disagree about which muscles a workout trained.
//
// Pure logic — no React, no storage.

import { getExercise } from "./exercises";
import { GYM_GROUPS } from "./groups";
import { getMuscleInfo } from "./muscleData";
import { CountableSet, isWorkingSet } from "./setRules";

/** Gym groups an exercise's primary muscles belong to; a known plan muscle key is the fallback. */
export function primaryGroupsOf(exerciseId: string, fallbackGroup?: string): string[] {
  const groups = new Set<string>();
  for (const node of getExercise(exerciseId)?.primary || []) {
    const g = getMuscleInfo(node)?.group;
    if (g) groups.add(g);
  }
  if (groups.size === 0 && fallbackGroup && GYM_GROUPS[fallbackGroup]) groups.add(fallbackGroup);
  return [...groups];
}

/**
 * Working sets (countable, not a warm-up — setRules) per gym group for one
 * session. Each set counts once toward every PRIMARY group of its exercise.
 * A count of logged sets, never an activation estimate.
 */
export function sessionSetsByGroup(
  exercises: readonly { exerciseId: string; sets: readonly CountableSet[] }[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of exercises) {
    const n = e.sets.filter(isWorkingSet).length;
    if (n === 0) continue;
    for (const g of primaryGroupsOf(e.exerciseId)) out[g] = (out[g] || 0) + n;
  }
  return out;
}
