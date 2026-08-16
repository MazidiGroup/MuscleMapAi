// Production owner-scoped persistence for Workout, History, PRs, rest preference
// and the active session. `WorkoutProvider` calls exactly these functions, so the
// integration tests exercise the real adapter rather than a copy.
//
// No legacy `anat.*` key is ever written here: those remain read-only sources
// owned by the migration subsystem.

import { Owner } from "@/src/owner/scopeKeys";
import { OwnerToken, ScopedStore, WriteResult } from "@/src/owner/scopedStore";
import { ActiveSession, ExerciseIdSpace, endSession, readActiveSession } from "@/src/session/activeSession";
import { WeightUnit, resolveUnitPreference } from "@/src/units/unitPreference";

export type LoggedSet = {
  id: string;
  weight: number;
  reps: number;
  done: boolean;
  /** v1.2.0. Saved and shown, but excluded from volume and records. */
  warmup?: boolean;
};

/**
 * How many empty set rows a planned exercise starts with in the session.
 * A Plan day that promises 3 sets must arrive as 3 loggable sets; an unusable
 * value falls back to one set, and the count is capped so a damaged plan record
 * can never generate an unbounded session.
 */
export function plannedSetCount(planned: unknown): number {
  const n = typeof planned === "number" && Number.isFinite(planned) ? Math.floor(planned) : 1;
  return Math.min(Math.max(n, 1), 10);
}
export type SessionExercise = {
  exerciseId: string;
  /** Source catalogue of the id. Defaults to the anatomy library when absent. */
  idSpace?: ExerciseIdSpace;
  sets: LoggedSet[];
  notes: string;
  planLink?: { planDate: string; planName?: string };
  /** v1.2.0. Exercises sharing an id are alternated as a superset. */
  supersetId?: string;
};
export type Workout = { id: string; date: number; durationSec: number; exercises: SessionExercise[] };
export type PRs = { byExercise: Record<string, { maxWeight: number; maxVolume: number }>; longestSec: number };

export const EMPTY_PRS: PRs = { byExercise: {}, longestSec: 0 };

export type WorkoutScopeSnapshot = {
  history: Workout[];
  prs: PRs;
  restPref: number;
  active: ActiveSession | null;
  unit: WeightUnit;
};

/** Reads everything this owner needs. Returns empty data for an unresolved owner. */
export async function hydrateWorkoutScope(store: ScopedStore, owner: Owner | null): Promise<WorkoutScopeSnapshot> {
  if (!owner) {
    return { history: [], prs: EMPTY_PRS, restPref: 60, active: null, unit: "kg" };
  }
  const [history, prs, restPref, active, unit] = await Promise.all([
    store.read<Workout[]>(owner, "workouts", []),
    store.read<PRs>(owner, "prs", EMPTY_PRS),
    store.read<number>(owner, "restPref", 60),
    readActiveSession(store, owner),
    resolveUnitPreference(store, owner),
  ]);
  return {
    history: Array.isArray(history) ? history : [],
    prs: prs || EMPTY_PRS,
    restPref: Number(restPref) || 60,
    active,
    unit: unit.unit,
  };
}

export function persistHistory(store: ScopedStore, token: OwnerToken | null, history: Workout[]): Promise<WriteResult> {
  return store.writeGuarded(token, "workouts", history);
}

export function persistPRs(store: ScopedStore, token: OwnerToken | null, prs: PRs): Promise<WriteResult> {
  return store.writeGuarded(token, "prs", prs);
}

export function persistRestPref(store: ScopedStore, token: OwnerToken | null, seconds: number): Promise<WriteResult> {
  return store.writeGuarded(token, "restPref", seconds);
}

/** Builds the persisted session payload, preserving exact ids and their ID space. */
export function buildActiveSession(
  token: OwnerToken,
  sessionId: string,
  startedAt: number,
  exercises: SessionExercise[],
  now: () => number = Date.now,
  planSeed?: number,
): ActiveSession {
  return {
    schema: 1,
    sessionId,
    ownerKind: token.kind,
    ownerId: token.id,
    startedAt,
    updatedAt: now(),
    planSeed,
    exercises: exercises.map((e) => ({
      exerciseId: e.exerciseId,
      idSpace: e.idSpace ?? "anatomy",
      sets: e.sets,
      notes: e.notes,
      planLink: e.planLink,
      supersetId: e.supersetId,
    })),
  };
}

export function persistActiveSession(
  store: ScopedStore,
  token: OwnerToken | null,
  session: ActiveSession,
): Promise<WriteResult> {
  return store.writeGuarded(token, "activeSession", session);
}

/** Explicit deletion of this owner's active session. */
export function clearActiveSession(store: ScopedStore, owner: Owner): Promise<void> {
  return endSession(store, owner);
}
