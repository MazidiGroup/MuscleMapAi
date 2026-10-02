// Body-map logic for the 2D Today body — v1.5.0.
//
// The 2D body draws one region per gym group (chest, back, …), so every input
// is reduced to group keys here using the SAME mapping the recovery engine
// uses: an exercise's primary GLB muscle nodes → getMuscleInfo(node).group.
// Nothing in this file decides access; the Today body is free.
//
// Pure logic — no React, no storage.

import { getExercise } from "./exercises";
import { GYM_GROUPS } from "./groups";
import { getMuscleInfo } from "./muscleData";

/** The five recovery states, named as the 2D body exposes them. */
export type BodyState = "fatigued" | "recovering" | "ready" | "undertrained" | "untracked";

/** Structural slice of computeRecovery()'s per-group output. */
export type RecoveryLike = { group: string; state: string; pct: number; lastTs: number | null };

/**
 * computeRecovery() names "no completed work recorded" `untrained` (shown as
 * "Not tracked" in the Insights legend); the body calls it `untracked`.
 */
export function bodyStatesFromRecovery(groups: readonly RecoveryLike[]): Record<string, BodyState> {
  const out: Record<string, BodyState> = {};
  for (const g of groups) {
    out[g.group] =
      g.state === "fatigued" || g.state === "recovering" || g.state === "ready" || g.state === "undertrained"
        ? g.state
        : "untracked";
  }
  return out;
}

/** Every group drawn untracked — the empty state before any history exists. */
export function untrackedBody(): Record<string, BodyState> {
  const out: Record<string, BodyState> = {};
  for (const k of Object.keys(GYM_GROUPS)) out[k] = "untracked";
  return out;
}

/**
 * Overall readiness, 0–100: the mean recovery progress of every group that has
 * completed work on record. Null when nothing is tracked yet — a percentage
 * of nothing would be invented.
 */
export function readinessPercent(groups: readonly RecoveryLike[]): number | null {
  const tracked = groups.filter((g) => g.lastTs !== null);
  if (tracked.length === 0) return null;
  const mean = tracked.reduce((a, g) => a + Math.max(0, Math.min(1, g.pct)), 0) / tracked.length;
  return Math.round(mean * 100);
}

/** Gym groups an exercise's primary muscles belong to, via the engine's node → group mapping. */
export function primaryGroupsOf(exerciseId: string, fallbackGroup?: string): string[] {
  const ex = getExercise(exerciseId);
  const groups = new Set<string>();
  for (const node of ex?.primary || []) {
    const g = getMuscleInfo(node)?.group;
    if (g) groups.add(g);
  }
  if (groups.size === 0 && fallbackGroup && GYM_GROUPS[fallbackGroup]) groups.add(fallbackGroup);
  return [...groups];
}

/**
 * True when every primary group of a day is ready or recovering. Undertrained
 * counts as ready — it is past its recovery window, only for longer. A group
 * with no history is not claimed either way, so an all-untracked day is false.
 */
export function fitsRecovery(primaryGroups: readonly string[], states: Record<string, BodyState>): boolean {
  if (primaryGroups.length === 0) return false;
  return primaryGroups.every((g) => {
    const s = states[g];
    return s === "ready" || s === "recovering" || s === "undertrained";
  });
}
