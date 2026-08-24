// The compact workout snapshot the phone pushes to the watch, and the merge
// that receives it.
//
// This is the ONLY direction in which whole state travels. The watch sends
// events because its changes must be applied exactly once; the phone sends a
// snapshot because it is the source of truth for what the workout contains, and
// because a watch that has been off for a day needs the current picture rather
// than a day of replay. Watch Connectivity's application context is built for
// exactly this: one small payload, latest-wins, delivered when it can be.
//
// Latest-wins is safe for the snapshot and would be catastrophic for the events,
// which is why the two travel differently. The merge below is what keeps it
// safe: a snapshot never removes work the watch has recorded but not yet had
// acknowledged. The phone simply does not know about those sets yet, and
// "the other side didn't mention it" is not evidence that it was deleted.

import { ActiveSession, ExerciseIdSpace } from "@/src/session/activeSession";
import { EntitlementState } from "@/src/premium/entitlement";
import { WeightUnit } from "@/src/units/unitPreference";

import { WATCH_SCHEMA_VERSION, WeightValue } from "./protocol";
import { WatchEntitlement } from "./gate";
import { DEFAULT_REST_SECONDS, WatchExerciseView, WatchSetView, WatchSnapshot, emptySnapshot } from "./session";

// ---------------------------------------------------------------------------
// The payload.
// ---------------------------------------------------------------------------

export type SnapshotSet = {
  setId: string;
  reps: number;
  weight: WeightValue;
  warmup?: boolean;
};

export type SnapshotExercise = {
  exerciseId: string;
  idSpace: ExerciseIdSpace;
  name: string;
  targetReps: number;
  sets: SnapshotSet[];
};

export type SnapshotSession = {
  sessionId: string;
  startedAt: number;
  exercises: SnapshotExercise[];
};

export type WatchContextPayload = {
  schema: number;
  /**
   * Monotonic per phone install. Application context has no ordering guarantee,
   * so an older payload arriving after a newer one is discarded by number.
   */
  revision: number;
  sentAt: number;
  entitlement: { access: boolean; state: EntitlementState; verifiedAt: number };
  unit: WeightUnit;
  restSeconds: number;
  /** Null when no workout is in progress. */
  session: SnapshotSession | null;
};

// ---------------------------------------------------------------------------
// Building it (phone side).
// ---------------------------------------------------------------------------

export type BuildInput = {
  session: ActiveSession | null;
  unit: WeightUnit;
  restSeconds: number;
  entitlement: { access: boolean; state: EntitlementState; verifiedAt: number };
  revision: number;
  now: number;
  /** Display name for an exercise id. Injected so this stays pure. */
  nameOf?: (exerciseId: string, idSpace: ExerciseIdSpace) => string | undefined;
  /** The plan's rep target for an exercise, when it set one. */
  targetRepsFor?: (exerciseId: string, idSpace: ExerciseIdSpace) => number;
};

/**
 * Only what the watch renders or needs to act. Notes, plan links, superset ids
 * and everything else stay on the phone: the payload crosses a constrained
 * transport many times a session, and no health data belongs in it at all.
 */
export function buildContextPayload(input: BuildInput): WatchContextPayload {
  const { session, unit } = input;
  return {
    schema: WATCH_SCHEMA_VERSION,
    revision: input.revision,
    sentAt: input.now,
    entitlement: input.entitlement,
    unit,
    restSeconds: input.restSeconds,
    session: session
      ? {
          sessionId: session.sessionId,
          startedAt: session.startedAt,
          exercises: session.exercises.map((e) => ({
            exerciseId: e.exerciseId,
            idSpace: e.idSpace,
            name: input.nameOf?.(e.exerciseId, e.idSpace) || e.exerciseId,
            targetReps: input.targetRepsFor?.(e.exerciseId, e.idSpace) ?? 0,
            // Only completed sets: an empty row the user has not filled in is a
            // phone editing affordance, not a result, and showing it as set 1 of
            // 3 already done would misstate the session.
            sets: e.sets
              .filter((s) => s.done)
              .map((s) => ({
                setId: s.id,
                reps: s.reps,
                weight: { value: s.weight, unit },
                ...(s.warmup ? { warmup: true } : {}),
              })),
          })),
        }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Receiving it (watch side).
// ---------------------------------------------------------------------------

export type MergeInput = {
  /** Set ids the watch has recorded but the phone has not acknowledged. */
  unackedSetIds: ReadonlySet<string>;
  /**
   * Exercises the watch added that the phone has not acknowledged, keyed
   * `idSpace:exerciseId`. Without this, an exercise added on the watch and not
   * yet applied would either vanish under the user on the next snapshot, or —
   * if kept on the weaker "it has no sets" test — never go away again after the
   * user deleted it on the phone.
   */
  unackedExerciseKeys?: ReadonlySet<string>;
  now: number;
};

function toEntitlement(p: WatchContextPayload): WatchEntitlement {
  return { access: p.entitlement.access, state: p.entitlement.state, verifiedAt: p.entitlement.verifiedAt };
}

function toView(e: SnapshotExercise): WatchExerciseView {
  return {
    exerciseId: e.exerciseId,
    idSpace: e.idSpace,
    name: e.name,
    targetReps: e.targetReps,
    sets: e.sets.map<WatchSetView>((s) => ({
      setId: s.setId,
      reps: s.reps,
      weight: s.weight,
      warmup: s.warmup === true,
      voided: false,
      revision: 0,
      source: "phone",
      at: 0,
    })),
  };
}

export type MergeResult = { snapshot: WatchSnapshot; entitlement: WatchEntitlement; applied: boolean };

/**
 * Folds an incoming payload into the watch's own state.
 *
 * The entitlement is taken from every accepted payload — that is the phone's
 * verified answer and the watch has no better one. The workout is taken only
 * when doing so cannot lose unsynced work.
 */
export function mergeSnapshot(local: WatchSnapshot, payload: WatchContextPayload, input: MergeInput): MergeResult {
  if (payload.schema > WATCH_SCHEMA_VERSION) {
    return { snapshot: local, entitlement: toEntitlement(payload), applied: false };
  }

  const entitlement = toEntitlement(payload);
  const hasUnsynced = input.unackedSetIds.size > 0;
  const base: WatchSnapshot = {
    ...local,
    unit: payload.unit,
    restSeconds: payload.restSeconds > 0 ? payload.restSeconds : DEFAULT_REST_SECONDS,
  };

  // No workout on the phone. If the watch is still holding unsynced work, the
  // phone has simply not caught up yet — dropping it here would delete sets the
  // user was told were saved.
  if (!payload.session) {
    if (hasUnsynced || local.sessionId === null) return { snapshot: base, entitlement, applied: !hasUnsynced };
    return { snapshot: { ...emptySnapshot(payload.unit), restSeconds: base.restSeconds }, entitlement, applied: true };
  }

  // A different workout than the one the watch is holding. Adopt it only once
  // the watch has nothing outstanding, so a backlog is never orphaned.
  if (local.sessionId && local.sessionId !== payload.session.sessionId) {
    if (hasUnsynced) return { snapshot: base, entitlement, applied: false };
    return { snapshot: adopt(base, payload, input, entitlement), entitlement, applied: true };
  }

  if (!local.sessionId) {
    return { snapshot: adopt(base, payload, input, entitlement), entitlement, applied: true };
  }

  return { snapshot: reconcile(base, payload, input), entitlement, applied: true };
}

/** Takes the phone's workout wholesale. Only reached with nothing outstanding. */
function adopt(
  base: WatchSnapshot,
  payload: WatchContextPayload,
  input: MergeInput,
  entitlement: WatchEntitlement,
): WatchSnapshot {
  const session = payload.session as SnapshotSession;
  const exercises = session.exercises.map(toView);
  const index = Math.max(0, exercises.length - 1);
  const last = exercises[index]?.sets.slice(-1)[0];
  return {
    ...base,
    sessionId: session.sessionId,
    startedAt: session.startedAt,
    exercises,
    currentIndex: index,
    workingWeight: last ? last.weight : { value: 0, unit: payload.unit },
    // Joining a session records whether this watch was entitled at the moment it
    // joined. That grant, and nothing else, is what lets a session finish
    // through a lapsed or unreachable entitlement later on.
    grantedAt: entitlement.access ? input.now : null,
    lastAction: null,
    rest: null,
    paused: false,
    seq: base.seq,
  };
}

/**
 * Same workout on both sides. The phone supplies the shape; the watch keeps
 * every set the phone has not acknowledged, plus its own tombstones.
 */
function reconcile(base: WatchSnapshot, payload: WatchContextPayload, input: MergeInput): WatchSnapshot {
  const session = payload.session as SnapshotSession;
  const localByKey = new Map(base.exercises.map((e) => [`${e.idSpace}:${e.exerciseId}`, e]));
  const voided = new Set(base.exercises.flatMap((e) => e.sets.filter((s) => s.voided).map((s) => s.setId)));

  const merged: WatchExerciseView[] = session.exercises.map((incoming) => {
    const key = `${incoming.idSpace}:${incoming.exerciseId}`;
    const mine = localByKey.get(key);
    localByKey.delete(key);
    const fromPhone = toView(incoming).sets.filter((s) => !voided.has(s.setId));
    const known = new Set(fromPhone.map((s) => s.setId));
    const unsynced = (mine?.sets ?? []).filter(
      (s) => !known.has(s.setId) && !s.voided && input.unackedSetIds.has(s.setId),
    );
    // Locally recorded tombstones are preserved so an undone set cannot come
    // back the moment the phone re-describes the workout.
    const tombstones = (mine?.sets ?? []).filter((s) => s.voided);
    return {
      exerciseId: incoming.exerciseId,
      idSpace: incoming.idSpace,
      name: incoming.name || mine?.name || incoming.exerciseId,
      targetReps: incoming.targetReps || mine?.targetReps || 0,
      sets: [...fromPhone, ...unsynced, ...tombstones],
    };
  });

  // Exercises the watch added that the phone has not applied yet keep their
  // place at the end rather than vanishing under the user mid-set. An exercise
  // with nothing outstanding is one the phone has genuinely dropped, so it goes.
  const unackedExercises = input.unackedExerciseKeys ?? new Set<string>();
  const localOnly = [...localByKey.entries()]
    .filter(
      ([key, e]) =>
        unackedExercises.has(key) || e.sets.some((s) => !s.voided && input.unackedSetIds.has(s.setId)),
    )
    .map(([, e]) => e);

  const exercises = [...merged, ...localOnly];
  const currentKey = base.exercises[base.currentIndex]
    ? `${base.exercises[base.currentIndex].idSpace}:${base.exercises[base.currentIndex].exerciseId}`
    : null;
  const nextIndex = currentKey
    ? Math.max(0, exercises.findIndex((e) => `${e.idSpace}:${e.exerciseId}` === currentKey))
    : Math.min(base.currentIndex, Math.max(0, exercises.length - 1));

  return {
    ...base,
    sessionId: session.sessionId,
    startedAt: session.startedAt,
    exercises,
    currentIndex: Math.min(nextIndex, Math.max(0, exercises.length - 1)),
  };
}

/**
 * Whether an incoming payload is newer than the one already applied. Application
 * context is latest-wins by design, so the watch enforces the ordering itself.
 */
export function isNewerPayload(applied: number | null, payload: WatchContextPayload): boolean {
  return applied === null || payload.revision > applied;
}
