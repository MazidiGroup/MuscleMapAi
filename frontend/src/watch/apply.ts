// Applying watch events to the phone's session — exactly once, in order.
//
// This is the other half of the outbox. The watch guarantees it will keep
// re-sending until acknowledged; this module guarantees that re-sending is
// harmless. Between them, "a voice-created set appears once and only once in
// iPhone history" holds without either side needing a reliable network.
//
// Four rules do the work, and each closes a specific way sets get lost or
// doubled:
//
//   · Identity, not contents. A duplicate is recognised by `eventId`, so two
//     genuinely identical sets (8 reps at 80 kg, twice) both survive while a
//     redelivery of one of them does not become a third.
//   · Order by `seq`, never by arrival. Delivery order is not a property
//     anything may depend on, so events are sorted before they are applied.
//   · `session.end` waits for the whole backlog. Finishing a workout while
//     sets 1–4 are still queued would commit a workout missing them and then
//     have nowhere to put them. The end event is DEFERRED until every earlier
//     sequence number has been processed.
//   · A finished session is closed, not forgotten. Its event ids are retained,
//     so a late redelivery after the workout is in History is acknowledged and
//     discarded instead of starting a second workout.
//
// Nothing here writes to storage or calls the workout store: it takes a session
// and returns the next one, so every rule above is testable as a pure function.
// Committing the result, and running the app's existing finish path when
// `finished` comes back true, is the caller's job (see ./bridge).

import { ActiveExercise, ActiveSession, ActiveSet, ExerciseIdSpace } from "@/src/session/activeSession";
import { WeightUnit } from "@/src/units/unitPreference";
import { convertWeight } from "@/src/units/weight";

import {
  ExerciseAddPayload,
  RejectReason,
  SessionEndPayload,
  SessionStartPayload,
  SetLogPayload,
  SetRevisePayload,
  SetVoidPayload,
  WATCH_SCHEMA_VERSION,
  WatchAck,
  WatchEnvelope,
  WatchEvent,
  orderEvents,
} from "./protocol";

// ---------------------------------------------------------------------------
// The ledger.
// ---------------------------------------------------------------------------

export type ClosedSession = { sessionId: string; endedAt: number; eventIds: string[] };

export type WatchLedger = {
  schema: number;
  /** The watch session bound to the phone's active session, if any. */
  sessionId: string | null;
  /** Event ids already applied for the bound session. */
  processed: string[];
  /** Sequence numbers seen for the bound session, used for the end-event gate. */
  seenSeqs: number[];
  /** Highest revision applied per set id. Lower ones are stale by definition. */
  revisions: Record<string, number>;
  /** Tombstoned set ids. Terminal — a revision never revives one. */
  voided: string[];
  /**
   * The watch has asked to end this session and the phone has not released it
   * yet. Durable on purpose: whether a workout can actually be committed is
   * something only the caller knows — an empty session writes no history, and a
   * failed write must keep the session exactly as it was — so the applier
   * records the REQUEST and the caller decides when it is satisfied. Closing
   * here instead is what stranded a session as a zombie: retired in the ledger,
   * still live in the store, re-adopted by the watch on every push.
   */
  endRequested: boolean;
  /** Recently finished sessions, newest first. */
  closed: ClosedSession[];
};

export const LEDGER_SCHEMA = 1;

/**
 * How many finished sessions keep their event ids. Five covers well over a
 * week of training, which is far longer than a redelivery can plausibly take —
 * and the cost of being wrong is one duplicated workout, so the window is
 * generous rather than tight.
 */
export const CLOSED_SESSION_MEMORY = 5;

export function emptyLedger(): WatchLedger {
  return {
    schema: LEDGER_SCHEMA,
    sessionId: null,
    processed: [],
    seenSeqs: [],
    revisions: {},
    voided: [],
    endRequested: false,
    closed: [],
  };
}

function isClosed(ledger: WatchLedger, sessionId: string): boolean {
  return ledger.closed.some((c) => c.sessionId === sessionId);
}

function alreadyProcessed(ledger: WatchLedger, event: WatchEvent): boolean {
  if (ledger.processed.includes(event.eventId)) return true;
  return ledger.closed.some((c) => c.eventIds.includes(event.eventId));
}

/** True when every sequence number from 0 to `upTo` has been seen. */
export function contiguousUpTo(seen: readonly number[], upTo: number): boolean {
  if (upTo < 0) return true;
  const set = new Set(seen);
  for (let i = 0; i <= upTo; i++) if (!set.has(i)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Application.
// ---------------------------------------------------------------------------

export type ApplyContext = {
  /** The unit the phone's live session numbers are currently held in. */
  sessionUnit: WeightUnit;
  /**
   * The phone's own entitlement answer. The watch checks before it queues, and
   * the phone checks again before it writes: a Shortcut, a deep link or a
   * tampered payload all arrive here, and UI-side gating would miss every one.
   */
  entitled: boolean;
  /** Whether an id exists in the catalogue. Injected so this stays pure. */
  knowsExercise?: (exerciseId: string, idSpace: ExerciseIdSpace) => boolean;
  /** Owner identity for a session this module has to create from a backlog. */
  ownerKind: ActiveSession["ownerKind"];
  ownerId: string;
  now: number;
};

export type ApplyOutcome = {
  session: ActiveSession | null;
  ledger: WatchLedger;
  /** Applied, or recognised as an already-applied duplicate. */
  accepted: string[];
  rejected: { eventId: string; reason: RejectReason }[];
  /** Neither applied nor refused — kept queued and retried. */
  deferred: string[];
  /** True when a `session.end` was applied and the caller must now finish. */
  finished: boolean;
  /**
   * The watch's own clock at the moment the user ended the workout, or null.
   * The commit is dated from THIS, not from when the sync happened — a session
   * finished last night and delivered this morning belongs to last night.
   */
  endedAt: number | null;
};

type Verdict = { kind: "accept" } | { kind: "reject"; reason: RejectReason } | { kind: "defer" };

const ACCEPT: Verdict = { kind: "accept" };
const DEFER: Verdict = { kind: "defer" };

function reject(reason: RejectReason): Verdict {
  return { kind: "reject", reason };
}

function newSessionFrom(sessionId: string, startedAt: number, ctx: ApplyContext): ActiveSession {
  return {
    schema: 1,
    sessionId,
    ownerKind: ctx.ownerKind,
    ownerId: ctx.ownerId,
    startedAt,
    updatedAt: ctx.now,
    exercises: [],
  };
}

function findExercise(session: ActiveSession, exerciseId: string, idSpace: ExerciseIdSpace): number {
  return session.exercises.findIndex((e) => e.exerciseId === exerciseId && e.idSpace === idSpace);
}

function withExerciseAt(session: ActiveSession, index: number, fn: (e: ActiveExercise) => ActiveExercise): ActiveSession {
  return { ...session, exercises: session.exercises.map((e, i) => (i === index ? fn(e) : e)) };
}

/**
 * The load, converted from the unit it was entered in on the watch into the unit
 * the phone's live session is currently held in.
 *
 * This is `convertWeight`, the same function the phone already uses when the
 * user switches their preference, for the same reason: 85 kg logged on a watch
 * set to kilos must arrive as 187 lb on a phone showing pounds, not as 85 lb.
 */
function loadFor(weight: { value: number; unit: WeightUnit }, ctx: ApplyContext): number {
  return convertWeight(weight.value, weight.unit, ctx.sessionUnit);
}

/**
 * Applies a batch. Returns the next session, the next ledger, and a verdict for
 * every event so the caller can build an acknowledgement.
 */
export function applyWatchEvents(
  current: ActiveSession | null,
  ledger: WatchLedger,
  events: readonly WatchEvent[],
  ctx: ApplyContext,
): ApplyOutcome {
  let session = current;
  let next: WatchLedger = {
    ...ledger,
    processed: [...ledger.processed],
    seenSeqs: [...ledger.seenSeqs],
    revisions: { ...ledger.revisions },
    voided: [...ledger.voided],
    closed: [...ledger.closed],
  };

  // A binding whose session the phone no longer has is a ZOMBIE, and it is the
  // one state this function could never leave: release is driven by the bound
  // session's own end event, which can never be satisfied once the phone's
  // active session is a different workout — the phone will never commit the
  // bound one. Left in place, the binding deferred every event for every OTHER
  // session for ever; observed live as a ledger bound to a fourth id with nine
  // events from three sessions retrying for hours. Closing it moves its
  // processed ids into `closed`, so redeliveries are still recognised as
  // duplicates and anything never applied is REFUSED as unknown_session — the
  // watch surfaces the loss instead of retrying silently.
  //
  // Only a NON-NULL phone session with a different id is proof of death. A
  // null one is not: the caller rebuilds `current` from render-time state, so
  // an offline backlog spread across envelopes legitimately arrives with the
  // session still null while the ledger is already bound.
  if (next.sessionId !== null && session && session.sessionId !== next.sessionId) {
    next = closeBoundSession(next, ctx.now);
  }

  const accepted: string[] = [];
  const rejected: { eventId: string; reason: RejectReason }[] = [];
  const deferred: string[] = [];
  let finished = false;
  let endedAt: number | null = null;

  for (const event of orderEvents(events)) {
    // A duplicate is done, whatever else is true — including after the workout
    // has been saved, which is what stops a late retry becoming a second one.
    // `alreadyProcessed` covers a closed session's own event ids, so this is a
    // true redelivery.
    if (alreadyProcessed(next, event)) {
      accepted.push(event.eventId);
      continue;
    }
    // An event for a closed session that is NOT one of its own is new work that
    // arrived after the workout was committed — a set logged offline whose
    // delivery lost the race with the end event. Accepting it silently is how a
    // set disappears with nothing to show for it: refuse it, so the watch
    // surfaces the loss instead of the user finding out from their history.
    if (isClosed(next, event.sessionId)) {
      rejected.push({ eventId: event.eventId, reason: "unknown_session" });
      continue;
    }
    if (event.schema > WATCH_SCHEMA_VERSION) {
      rejected.push({ eventId: event.eventId, reason: "schema_unsupported" });
      continue;
    }
    if (!ctx.entitled) {
      rejected.push({ eventId: event.eventId, reason: "not_entitled" });
      continue;
    }

    // Session binding. An event for a different session than the one in progress
    // is held, never merged: two workouts must not become one, and refusing it
    // outright would throw away a session the user actually did.
    if (next.sessionId === null) {
      if (session && session.sessionId !== event.sessionId) {
        deferred.push(event.eventId);
        continue;
      }
      next = { ...next, sessionId: event.sessionId };
    } else if (next.sessionId !== event.sessionId) {
      deferred.push(event.eventId);
      continue;
    }

    const result = applyOne(session, next, event, ctx);
    session = result.session;
    next = result.ledger;

    if (result.verdict.kind === "accept") {
      accepted.push(event.eventId);
      next = {
        ...next,
        processed: [...next.processed, event.eventId],
        seenSeqs: next.seenSeqs.includes(event.seq) ? next.seenSeqs : [...next.seenSeqs, event.seq],
      };
      if (event.kind === "session.end") {
        // Recorded, not acted on. `closeBoundSession` runs once the caller has
        // actually released the workout.
        finished = true;
        endedAt = (event.payload as SessionEndPayload).endedAt;
        next = { ...next, endRequested: true };
      }
    } else if (result.verdict.kind === "reject") {
      rejected.push({ eventId: event.eventId, reason: result.verdict.reason });
      // A refusal RESOLVES the sequence number even though nothing was applied.
      // Contiguity asks "has everything earlier been settled", not "has
      // everything earlier been written" — without this, one permanently
      // rejected set would defer the end of the workout for ever.
      next = {
        ...next,
        seenSeqs: next.seenSeqs.includes(event.seq) ? next.seenSeqs : [...next.seenSeqs, event.seq],
      };
    } else {
      deferred.push(event.eventId);
    }
  }

  return { session, ledger: next, accepted, rejected, deferred, finished, endedAt };
}

/**
 * Retires the bound session, keeping its event ids so a late retry is
 * recognised as a duplicate rather than starting a second workout.
 *
 * Called by the caller, and ONLY once the workout has genuinely been released —
 * committed to history, or discarded because it held no sets. While a commit is
 * failing the session must stay bound, so the watch's next retry drives another
 * attempt instead of finding the session already retired and unreachable.
 */
export function closeBoundSession(ledger: WatchLedger, now: number): WatchLedger {
  // Even with nothing bound, per-session scratch state must not survive into
  // the next binding: a leaked tombstone or seq would belong to a session
  // that no longer exists.
  if (!ledger.sessionId) {
    return { ...ledger, processed: [], seenSeqs: [], revisions: {}, voided: [], endRequested: false };
  }
  const closed: ClosedSession = {
    sessionId: ledger.sessionId,
    endedAt: now,
    eventIds: [...ledger.processed],
  };
  return {
    ...ledger,
    sessionId: null,
    processed: [],
    seenSeqs: [],
    revisions: {},
    voided: [],
    endRequested: false,
    closed: [closed, ...ledger.closed].slice(0, CLOSED_SESSION_MEMORY),
  };
}

type OneResult = { session: ActiveSession | null; ledger: WatchLedger; verdict: Verdict };

function applyOne(
  session: ActiveSession | null,
  ledger: WatchLedger,
  event: WatchEvent,
  ctx: ApplyContext,
): OneResult {
  switch (event.kind) {
    case "session.start": {
      const payload = event.payload as SessionStartPayload;
      if (session) return { session, ledger, verdict: ACCEPT }; // already running — idempotent
      return { session: newSessionFrom(event.sessionId, payload.startedAt, ctx), ledger, verdict: ACCEPT };
    }

    case "exercise.add": {
      const payload = event.payload as ExerciseAddPayload;
      if (ctx.knowsExercise && !ctx.knowsExercise(payload.exerciseId, payload.idSpace)) {
        return { session, ledger, verdict: reject("unknown_exercise") };
      }
      // A backlog can arrive with no session at all — the watch ran the whole
      // workout offline. Recover it rather than lose it, dating the session from
      // the event itself so the duration is the user's, not the sync's.
      const base = session ?? newSessionFrom(event.sessionId, event.at, ctx);
      if (findExercise(base, payload.exerciseId, payload.idSpace) >= 0) {
        return { session: base, ledger, verdict: ACCEPT };
      }
      const added: ActiveExercise = { exerciseId: payload.exerciseId, idSpace: payload.idSpace, sets: [], notes: "" };
      return { session: { ...base, exercises: [...base.exercises, added] }, ledger, verdict: ACCEPT };
    }

    case "set.log": {
      const payload = event.payload as SetLogPayload;
      if (ctx.knowsExercise && !ctx.knowsExercise(payload.exerciseId, payload.idSpace)) {
        return { session, ledger, verdict: reject("unknown_exercise") };
      }
      let base = session ?? newSessionFrom(event.sessionId, event.at, ctx);
      let index = findExercise(base, payload.exerciseId, payload.idSpace);
      if (index < 0) {
        const added: ActiveExercise = { exerciseId: payload.exerciseId, idSpace: payload.idSpace, sets: [], notes: "" };
        base = { ...base, exercises: [...base.exercises, added] };
        index = base.exercises.length - 1;
      }
      // Undone before it ever arrived: the tombstone won the race, so the set is
      // acknowledged and never materialises.
      if (ledger.voided.includes(payload.setId)) return { session: base, ledger, verdict: ACCEPT };

      const set: ActiveSet = {
        id: payload.setId,
        weight: loadFor(payload.weight, ctx),
        reps: payload.reps,
        done: true,
        ...(payload.warmup ? { warmup: true } : {}),
      };
      const withSet = withExerciseAt(base, index, (e) =>
        e.sets.some((s) => s.id === set.id) ? e : { ...e, sets: [...e.sets, set] },
      );
      return { session: withSet, ledger, verdict: ACCEPT };
    }

    case "set.revise": {
      const payload = event.payload as SetRevisePayload;
      if (!session) return { session, ledger, verdict: DEFER };
      // A revision for a tombstoned set is settled: void is terminal.
      if (ledger.voided.includes(payload.setId)) return { session, ledger, verdict: ACCEPT };
      const index = session.exercises.findIndex((e) => e.sets.some((s) => s.id === payload.setId));
      // The set it edits has not landed yet — keep it queued rather than
      // inventing a set from an edit.
      if (index < 0) return { session, ledger, verdict: DEFER };

      const seen = ledger.revisions[payload.setId] ?? 0;
      if (payload.revision <= seen) return { session, ledger, verdict: ACCEPT }; // stale, already superseded

      const updated = withExerciseAt(session, index, (e) => ({
        ...e,
        sets: e.sets.map((s) =>
          s.id !== payload.setId
            ? s
            : {
                ...s,
                reps: payload.reps,
                weight: loadFor(payload.weight, ctx),
                ...(payload.warmup ? { warmup: true } : { warmup: undefined }),
              },
        ),
      }));
      return {
        session: updated,
        ledger: { ...ledger, revisions: { ...ledger.revisions, [payload.setId]: payload.revision } },
        verdict: ACCEPT,
      };
    }

    case "set.void": {
      const payload = event.payload as SetVoidPayload;
      // Recorded even when the set is not here yet, so a `set.log` that arrives
      // afterwards is suppressed instead of reappearing.
      const voided = ledger.voided.includes(payload.setId) ? ledger.voided : [...ledger.voided, payload.setId];
      if (!session) return { session, ledger: { ...ledger, voided }, verdict: ACCEPT };
      const stripped: ActiveSession = {
        ...session,
        exercises: session.exercises.map((e) => ({ ...e, sets: e.sets.filter((s) => s.id !== payload.setId) })),
      };
      return { session: stripped, ledger: { ...ledger, voided }, verdict: ACCEPT };
    }

    case "session.end": {
      const payload = event.payload as SessionEndPayload;
      if (!session) return { session, ledger, verdict: DEFER };
      // Everything the watch recorded before the end must be in before the
      // workout is committed, or it commits without them and they have nowhere
      // left to go.
      if (!contiguousUpTo(ledger.seenSeqs, event.seq - 1)) return { session, ledger, verdict: DEFER };
      return { session: { ...session, updatedAt: payload.endedAt }, ledger, verdict: ACCEPT };
    }

    default:
      return { session, ledger, verdict: reject("invalid_payload") };
  }
}

// ---------------------------------------------------------------------------
// Acknowledgement.
// ---------------------------------------------------------------------------

/** The reply the watch's outbox consumes. Deferred ids are simply not listed. */
export function ackFor(envelope: WatchEnvelope, outcome: ApplyOutcome, alsoRejected: WatchAck["rejected"] = []): WatchAck {
  return {
    schema: WATCH_SCHEMA_VERSION,
    envelopeId: envelope.envelopeId,
    accepted: outcome.accepted,
    rejected: [...outcome.rejected, ...alsoRejected],
  };
}
