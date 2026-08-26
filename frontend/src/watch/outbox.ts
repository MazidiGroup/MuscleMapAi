// The watch's transactional outbox.
//
// The contract this exists to keep: the watch tells the user a set is saved only
// after the set is written HERE, on the watch, and the entry stays until the
// phone acknowledges it by id. Everything else about connectivity is then just
// latency. Reachability is never a precondition for recording a set.
//
// Acknowledgement is by event id rather than by batch, because batches are a
// transport detail: the same event can be sent in two different batches after a
// reconnect, and the phone may accept some of a batch and reject the rest. Only
// per-id acknowledgement can tell those apart.
//
// A rejected event is dropped, not retried. Every `RejectReason` is permanent —
// a malformed payload does not become well-formed on the fourth attempt — so
// retrying one is an infinite loop that also hides the problem. Transient
// failures are not rejections: they are simply events that were never
// acknowledged, and those stay queued forever until they are.
//
// Pure data transformation. Persisting the outbox is the caller's job.

import { RejectReason, WatchAck, WatchEnvelope, WatchEvent, orderEvents, mintId } from "./protocol";

export type OutboxEntry = {
  event: WatchEvent;
  queuedAt: number;
  attempts: number;
  /** Watch-local time of the last send. 0 until the first attempt. */
  lastAttemptAt: number;
  /** Set once the phone refuses it permanently. Surfaced, then dropped. */
  rejected?: RejectReason;
};

export type Outbox = { schema: number; entries: OutboxEntry[] };

export const OUTBOX_SCHEMA = 1;

export function emptyOutbox(): Outbox {
  return { schema: OUTBOX_SCHEMA, entries: [] };
}

/**
 * The queue depth that means something is wrong — roughly ten unsynced
 * workouts. It raises a warning and nothing else: the outbox never truncates
 * itself, because silently discarding the oldest entries would delete work the
 * user was told had been saved.
 */
export const OUTBOX_WARN_AT = 500;

// ---------------------------------------------------------------------------
// Queueing.
// ---------------------------------------------------------------------------

/** Adds events, ignoring any whose id is already queued. Retries are not adds. */
export function enqueue(outbox: Outbox, events: readonly WatchEvent[], now: number): Outbox {
  if (events.length === 0) return outbox;
  const known = new Set(outbox.entries.map((e) => e.event.eventId));
  const added: OutboxEntry[] = [];
  for (const event of events) {
    if (known.has(event.eventId)) continue;
    known.add(event.eventId);
    added.push({ event, queuedAt: now, attempts: 0, lastAttemptAt: 0 });
  }
  if (added.length === 0) return outbox;
  return { ...outbox, entries: [...outbox.entries, ...added] };
}

/** Entries still owed an acknowledgement. */
export function pending(outbox: Outbox): OutboxEntry[] {
  return outbox.entries.filter((e) => !e.rejected);
}

export function pendingCount(outbox: Outbox): number {
  return pending(outbox).length;
}

export function isBacklogged(outbox: Outbox): boolean {
  return pendingCount(outbox) >= OUTBOX_WARN_AT;
}

/**
 * Sets the watch has recorded that the phone has not confirmed.
 *
 * The snapshot merge needs exactly this: a phone update that does not mention
 * one of these has not deleted it, it simply has not been told about it yet.
 */
export function unackedSetIds(outbox: Outbox): Set<string> {
  const ids = new Set<string>();
  for (const entry of pending(outbox)) {
    const setId = (entry.event.payload as { setId?: string }).setId;
    if (entry.event.kind === "set.log" && setId) ids.add(setId);
  }
  return ids;
}

/** Exercises the watch added that the phone has not confirmed, by identity key. */
export function unackedExerciseKeys(outbox: Outbox): Set<string> {
  const keys = new Set<string>();
  for (const entry of pending(outbox)) {
    if (entry.event.kind !== "exercise.add") continue;
    const p = entry.event.payload as { exerciseId?: string; idSpace?: string };
    if (p.exerciseId && p.idSpace) keys.add(`${p.idSpace}:${p.exerciseId}`);
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Sending.
// ---------------------------------------------------------------------------

/**
 * Deterministic backoff — no jitter. Jitter exists to spread load across many
 * clients hitting one server; here there is exactly one phone and one watch, so
 * jitter would only make the retry schedule untestable.
 */
export const BACKOFF_STEPS_MS = [0, 2_000, 5_000, 15_000, 60_000, 300_000];

export function backoffMs(attempts: number): number {
  const i = Math.min(Math.max(attempts, 0), BACKOFF_STEPS_MS.length - 1);
  return BACKOFF_STEPS_MS[i];
}

export function isDue(entry: OutboxEntry, now: number): boolean {
  if (entry.rejected) return false;
  if (entry.attempts === 0) return true;
  return now - entry.lastAttemptAt >= backoffMs(entry.attempts);
}

/** How many events go in one transfer. Watch Connectivity payloads stay small. */
export const MAX_BATCH = 25;

/**
 * Whether an event must wait, whatever else is due.
 *
 * `session.end` is the only event whose early arrival DESTROYS later work: the
 * phone commits the workout, closes the session, and every set that turns up
 * afterwards has nowhere left to go. Ordering by `seq` inside a batch is not
 * enough of a guard, because a command can ride two channels — a queued
 * transfer and, when both apps are awake, a live message — and FIFO does not
 * hold across them. An end sent in a later envelope can beat a set still
 * sitting in the queue, which is exactly what was observed.
 *
 * So the end waits here until nothing earlier in its session is outstanding.
 * Events travelling in the SAME batch do not count as outstanding — they arrive
 * together and the phone applies them in sequence order — so the common case
 * still finishes in one round trip.
 *
 * A REJECTED entry never blocks. The phone has refused it permanently, and
 * waiting on something that will never be accepted would strand the end for
 * ever, which is a worse failure than the one this prevents.
 */
export function blockedByEarlierWork(
  outbox: Outbox,
  event: WatchEvent,
  travellingWith: ReadonlySet<string>,
): boolean {
  if (event.kind !== "session.end") return false;
  return pending(outbox).some(
    (other) =>
      other.event.sessionId === event.sessionId &&
      other.event.seq < event.seq &&
      !travellingWith.has(other.event.eventId),
  );
}

/**
 * The next batch to send, in the watch's own `seq` order.
 *
 * Ordering the wire matches ordering on arrival in the common case, which keeps
 * the phone's work trivial — though the phone re-sorts anyway, because "usually
 * in order" is not a property anything is allowed to depend on.
 */
export function nextBatch(outbox: Outbox, now: number, limit = MAX_BATCH): WatchEnvelope | null {
  const due = outbox.entries.filter((e) => isDue(e, now));
  if (due.length === 0) return null;

  const ordered = orderEvents(due.map((e) => e.event)).slice(0, limit);
  const travellingWith = new Set(ordered.map((e) => e.eventId));
  const events = ordered.filter((e) => !blockedByEarlierWork(outbox, e, travellingWith));
  if (events.length === 0) return null;

  return {
    schema: events[0].schema,
    envelopeId: mintId("env", () => now),
    sentAt: now,
    events,
  };
}

/** Records that a batch went out, so backoff applies before the next attempt. */
export function markAttempted(outbox: Outbox, envelope: WatchEnvelope, now: number): Outbox {
  const ids = new Set(envelope.events.map((e) => e.eventId));
  return {
    ...outbox,
    entries: outbox.entries.map((e) =>
      ids.has(e.event.eventId) ? { ...e, attempts: e.attempts + 1, lastAttemptAt: now } : e,
    ),
  };
}

// ---------------------------------------------------------------------------
// Acknowledgement.
// ---------------------------------------------------------------------------

export type AckResult = {
  outbox: Outbox;
  /** Ids removed because the phone has them. */
  cleared: string[];
  /** Permanently refused, still present so the caller can tell the user. */
  rejected: { eventId: string; reason: RejectReason }[];
};

/**
 * Applies an acknowledgement.
 *
 * An accepted id is removed outright — "accepted" from the phone covers both
 * "applied now" and "already had it", and both mean the watch is done with it.
 * An unmentioned id is left exactly as it was: the phone may simply not have
 * processed it yet, and forgetting it here is how work disappears.
 */
export function applyAck(outbox: Outbox, ack: WatchAck): AckResult {
  const accepted = new Set(ack.accepted ?? []);
  const rejections = new Map((ack.rejected ?? []).map((r) => [r.eventId, r.reason]));

  const entries: OutboxEntry[] = [];
  const cleared: string[] = [];
  const rejected: { eventId: string; reason: RejectReason }[] = [];

  for (const entry of outbox.entries) {
    const id = entry.event.eventId;
    if (accepted.has(id)) {
      cleared.push(id);
      continue;
    }
    const reason = rejections.get(id);
    if (reason) {
      rejected.push({ eventId: id, reason });
      entries.push({ ...entry, rejected: reason });
      continue;
    }
    entries.push(entry);
  }

  return { outbox: { ...outbox, entries }, cleared, rejected };
}

/** Removes rejected entries once their reason has been shown to the user. */
export function dropRejected(outbox: Outbox): Outbox {
  return { ...outbox, entries: outbox.entries.filter((e) => !e.rejected) };
}

/** Rejections not yet surfaced. */
export function rejections(outbox: Outbox): { eventId: string; reason: RejectReason }[] {
  return outbox.entries
    .filter((e) => e.rejected)
    .map((e) => ({ eventId: e.event.eventId, reason: e.rejected as RejectReason }));
}

/**
 * Everything still owed for one session — used when the watch has to describe
 * what has not reached the phone yet ("3 sets waiting to sync").
 */
export function pendingForSession(outbox: Outbox, sessionId: string): OutboxEntry[] {
  return pending(outbox).filter((e) => e.event.sessionId === sessionId);
}
