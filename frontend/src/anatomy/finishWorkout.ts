// Finishing a workout — PR calculation plus a verified local commit.
//
// The commit is verified rather than merely attempted: History is written first,
// then PRs. If the PR write fails the History write is rolled back, and the
// active session is only cleared once BOTH values are confirmed written. A
// failed finish therefore leaves the user with exactly the session they had.
//
// Pure logic plus the owner-scoped adapter — no React.

import { Owner } from "@/src/owner/scopeKeys";
import { OwnerToken, ScopedStore } from "@/src/owner/scopedStore";

import { PRs, SessionExercise, Workout, clearActiveSession, persistHistory, persistPRs } from "./workoutScope";
import { isWorkingSet, setVolume } from "./setRules";

export type PRUpdate = { prs: PRs; newPRs: string[] };

export type PRContext = {
  unit: string;
  durationSec: number;
  /** Display name for an exercise id. Injected so this stays pure. */
  nameOf?: (exerciseId: string) => string | undefined;
};

/**
 * A personal record requires a record to beat: the FIRST time an exercise is
 * logged it establishes the baseline and is not announced as a PR.
 */
export function computePRUpdate(prev: PRs, exercises: SessionExercise[], ctx: PRContext): PRUpdate {
  const newPRs: string[] = [];
  const next: PRs = { byExercise: { ...prev.byExercise }, longestSec: prev.longestSec };

  for (const e of exercises) {
    // Working sets only: a 0-rep tick records no work, and a warm-up is not a
    // record attempt, so neither may establish or beat a PR.
    const done = e.sets.filter(isWorkingSet);
    if (done.length === 0) continue;
    const maxWeight = Math.max(0, ...done.map((s) => s.weight));
    const volume = done.reduce((a, s) => a + setVolume(s), 0);
    const cur = next.byExercise[e.exerciseId] || { maxWeight: 0, maxVolume: 0 };
    const label = ctx.nameOf?.(e.exerciseId) || e.exerciseId;

    if (cur.maxWeight > 0 && maxWeight > cur.maxWeight) {
      newPRs.push(`${label}: ${maxWeight} ${ctx.unit}`);
    }
    if (cur.maxVolume > 0 && volume > cur.maxVolume) {
      newPRs.push(`${label}: ${volume} ${ctx.unit} volume`);
    }
    next.byExercise[e.exerciseId] = {
      maxWeight: Math.max(cur.maxWeight, maxWeight),
      maxVolume: Math.max(cur.maxVolume, volume),
    };
  }

  if (ctx.durationSec > next.longestSec) {
    if (next.longestSec > 0) newPRs.push("Longest workout!");
    next.longestSec = ctx.durationSec;
  }

  return { prs: next, newPRs };
}

export type CommitInput = {
  workout: Workout;
  previousHistory: Workout[];
  nextPRs: PRs;
};

export type CommitOutcome =
  | { ok: true; history: Workout[]; prs: PRs }
  | { ok: false; reason: "history_write_failed" | "prs_write_failed" };

/** Verified local transaction: History + PRs, then the session is released. */
export async function commitFinishedWorkout(
  store: ScopedStore,
  token: OwnerToken,
  owner: Owner,
  input: CommitInput,
): Promise<CommitOutcome> {
  const history = [input.workout, ...input.previousHistory];

  const historyWrite = await persistHistory(store, token, history);
  if (!historyWrite.ok) return { ok: false, reason: "history_write_failed" };

  const prsWrite = await persistPRs(store, token, input.nextPRs);
  if (!prsWrite.ok) {
    // Roll the History write back so the two values can never disagree.
    await persistHistory(store, token, input.previousHistory).catch(() => {});
    return { ok: false, reason: "prs_write_failed" };
  }

  // Only now is the active session released.
  await clearActiveSession(store, owner).catch(() => {});
  return { ok: true, history, prs: input.nextPRs };
}
