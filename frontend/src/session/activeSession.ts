// Owner-scoped persisted active workout session.
//
// Phase 1 owns only the storage contract, hydration, owner isolation and the
// one-session-per-owner guarantee — not the Workout UI or completion flow.
//
// Uniqueness is structural: an owner has exactly one `activeSession` key, and
// `startSession` returns the existing session instead of creating a second one.
// An in-process latch also serialises concurrent starts for the same owner.

import { Owner } from "./../owner/scopeKeys";
import { OwnerToken, ScopedStore, WriteResult } from "./../owner/scopedStore";

/** Exercise identifiers are preserved exactly, together with their source space. */
export type ExerciseIdSpace = "anatomy" | "plan";

export type ActiveSet = {
  id: string;
  weight: number;
  reps: number;
  done: boolean;
  /** v1.2.0. Warm-up sets persist, but stay out of volume and records. */
  warmup?: boolean;
};

export type ActiveExercise = {
  /** Exact source ID — never renamed, never inferred from a display name. */
  exerciseId: string;
  idSpace: ExerciseIdSpace;
  sets: ActiveSet[];
  notes: string;
  planLink?: { planDate: string; planName?: string };
  /** v1.2.0. Shared id marking adjacent exercises as one superset. */
  supersetId?: string;
};

export type ActiveSession = {
  schema: 1;
  sessionId: string;
  ownerKind: Owner["kind"];
  ownerId: string;
  startedAt: number;
  updatedAt: number;
  exercises: ActiveExercise[];
  /**
   * v1.2.0. The plan seed in force when the session began. Regenerating the plan
   * mints a new seed, so a mismatch identifies a session that outlived the plan
   * it was started from. Absent on sessions saved before v1.2.0.
   */
  planSeed?: number;
};

const latches = new Map<string, Promise<ActiveSession | null>>();

function newSessionId(): string {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function ownerKey(owner: Owner) {
  return `${owner.kind}:${owner.id}`;
}

export async function readActiveSession(store: ScopedStore, owner: Owner | null): Promise<ActiveSession | null> {
  const s = await store.read<ActiveSession | null>(owner, "activeSession", null);
  if (!s || !owner) return null;
  // Defence in depth: never surface a session that belongs to another owner.
  if (s.ownerId !== owner.id || s.ownerKind !== owner.kind) return null;
  return s;
}

/** Returns the existing session when one exists — it can never create a duplicate. */
export async function startSession(
  store: ScopedStore,
  owner: OwnerToken,
  now: () => number = Date.now,
): Promise<ActiveSession | null> {
  const key = ownerKey(owner);
  const pending = latches.get(key);
  if (pending) return pending;

  const run = (async () => {
    const existing = await readActiveSession(store, owner);
    if (existing) return existing;
    const session: ActiveSession = {
      schema: 1,
      sessionId: newSessionId(),
      ownerKind: owner.kind,
      ownerId: owner.id,
      startedAt: now(),
      updatedAt: now(),
      exercises: [],
    };
    const res = await store.writeGuarded(owner, "activeSession", session);
    return res.ok ? session : null;
  })().finally(() => latches.delete(key));

  latches.set(key, run);
  return run;
}

/**
 * Applies a mutation to the owner's active session. The owner captured at
 * mutation start must still be active at commit time or the write is rejected.
 */
export async function mutateSession(
  store: ScopedStore,
  owner: OwnerToken,
  fn: (s: ActiveSession) => ActiveSession,
  now: () => number = Date.now,
): Promise<WriteResult> {
  const current = await readActiveSession(store, owner);
  if (!current) return { ok: false, reason: "unresolved_owner" };
  const next = { ...fn(current), updatedAt: now(), ownerId: owner.id, ownerKind: owner.kind };
  return store.writeGuarded(owner, "activeSession", next);
}

/** Explicit deletion for this verified owner. */
export async function endSession(store: ScopedStore, owner: Owner): Promise<void> {
  await store.clear(owner, "activeSession");
}

/** Adds an exercise, preserving its exact ID and ID space. No duplicates. */
export function withExercise(session: ActiveSession, exerciseId: string, idSpace: ExerciseIdSpace): ActiveSession {
  if (session.exercises.some((e) => e.exerciseId === exerciseId && e.idSpace === idSpace)) return session;
  return {
    ...session,
    exercises: [...session.exercises, { exerciseId, idSpace, sets: [], notes: "" }],
  };
}

/** Test seam — clears the in-process start latch only. */
export function __resetSessionLatches() {
  latches.clear();
}
