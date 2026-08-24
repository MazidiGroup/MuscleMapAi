// The cross-device wire contract for the Apple Watch companion.
//
// Everything the watch sends the phone is an EVENT, never a snapshot of the
// workout. That distinction is the whole reliability story: a snapshot has to be
// reconciled ("whose list of exercises is right?") and loses whichever side is
// stale, whereas an event says one small thing that happened at a known moment
// and can be applied exactly once. Retrying a delivery therefore cannot
// duplicate a set, and a watch that has been out of range for an hour catches up
// by replaying its backlog instead of overwriting the phone.
//
// Three rules make that safe and all three are enforced here:
//
//   1. Every event carries an `eventId` minted ONCE, on the watch, before the
//      set is shown as saved. A retry reuses it, so the phone recognises a
//      duplicate by identity instead of guessing from the contents.
//   2. Every event carries `seq`, a per-session counter from the watch. Order is
//      decided by that counter, not by arrival time, so out-of-order delivery
//      converges on the same result as in-order delivery. This is what replaces
//      last-write-wins.
//   3. Every payload carries `schema`. A phone running an older build refuses a
//      future event explicitly instead of half-reading it.
//
// Nothing here touches storage, React or Watch Connectivity — this module is the
// vocabulary those layers speak, and it is pure so the rules are testable
// without a device.

import { ExerciseIdSpace } from "@/src/session/activeSession";
import { WeightUnit, isWeightUnit } from "@/src/units/unitPreference";

/** Bumped only when a payload shape changes in a way an older phone misreads. */
export const WATCH_SCHEMA_VERSION = 1;

/**
 * How a mutation was entered. Kept on the record because "is voice getting this
 * right?" is only answerable if voice-entered work is distinguishable — and
 * because the answer must never require keeping the audio.
 */
export type WatchSource = "watch.voice" | "watch.ui" | "phone";

export const WATCH_SOURCES: WatchSource[] = ["watch.voice", "watch.ui", "phone"];

export function isWatchSource(v: unknown): v is WatchSource {
  return typeof v === "string" && (WATCH_SOURCES as string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Supported ranges.
// ---------------------------------------------------------------------------
//
// These bound the WATCH entry paths only. The phone keypad is deliberately left
// exactly as it is: someone typing 4 on a numeric keyboard can see what they
// typed, while a recogniser that hears "eighty" for "eight" produces a
// plausible-looking number nobody checked. A watch command outside these bounds
// is refused and re-asked rather than written.

export const MIN_REPS = 1;
export const MAX_REPS = 200;

/** Per-unit ceilings, set a little above any load a person actually lifts. */
export const MAX_WEIGHT: Record<WeightUnit, number> = { kg: 500, lb: 1100 };

export function isValidReps(reps: unknown): reps is number {
  return typeof reps === "number" && Number.isInteger(reps) && reps >= MIN_REPS && reps <= MAX_REPS;
}

/** Zero is valid: it is how the app already records a bodyweight movement. */
export function isValidWeight(weight: unknown, unit: WeightUnit): weight is number {
  return typeof weight === "number" && Number.isFinite(weight) && weight >= 0 && weight <= MAX_WEIGHT[unit];
}

/** A load together with the unit it was said or shown in. Never stored bare. */
export type WeightValue = { value: number; unit: WeightUnit };

export function isWeightValue(v: unknown): v is WeightValue {
  const w = v as WeightValue;
  return !!w && typeof w === "object" && isWeightUnit(w.unit) && isValidWeight(w.value, w.unit);
}

// ---------------------------------------------------------------------------
// Events.
// ---------------------------------------------------------------------------

/**
 * The six things the watch can tell the phone happened.
 *
 * Working weight is deliberately absent. Changing the weight on the watch
 * changes what the NEXT set inherits, and every logged set carries its own
 * weight explicitly, so a weight change needs no durable record — sending one
 * would invent a piece of phone state the app does not have.
 */
export type WatchEventKind =
  | "session.start"
  | "exercise.add"
  | "set.log"
  | "set.revise"
  | "set.void"
  | "session.end";

export type SessionStartPayload = { startedAt: number };

export type ExerciseAddPayload = { exerciseId: string; idSpace: ExerciseIdSpace };

export type SetLogPayload = {
  /** Stable id minted with the event. The phone stores the set under it. */
  setId: string;
  exerciseId: string;
  idSpace: ExerciseIdSpace;
  reps: number;
  weight: WeightValue;
  /** Warm-ups are saved and shown, but stay out of volume and records. */
  warmup?: boolean;
};

/**
 * An edit of a set the watch already sent. `revision` starts at 1 for the first
 * edit and increases; the phone keeps the highest revision it has seen for that
 * set, so an edit arriving twice, or late, cannot restore an older value.
 */
export type SetRevisePayload = {
  setId: string;
  revision: number;
  reps: number;
  weight: WeightValue;
  warmup?: boolean;
};

/** Undo, as a tombstone. Terminal: a voided set is never revived by a revision. */
export type SetVoidPayload = { setId: string };

export type SessionEndPayload = { endedAt: number };

export type WatchEventPayload =
  | SessionStartPayload
  | ExerciseAddPayload
  | SetLogPayload
  | SetRevisePayload
  | SetVoidPayload
  | SessionEndPayload;

export type WatchEvent = {
  schema: number;
  /** Minted once on the watch. Identity for the whole life of the event. */
  eventId: string;
  /** The session it belongs to. Events are never applied across sessions. */
  sessionId: string;
  /** Per-session monotonic counter from the watch. Decides order. */
  seq: number;
  /** Watch-local wall clock at the moment the user acted. Preserved verbatim. */
  at: number;
  source: WatchSource;
  kind: WatchEventKind;
  payload: WatchEventPayload;
};

/** The payload union is discriminated by `kind`; these narrow it for callers. */
export type TypedWatchEvent<K extends WatchEventKind, P> = WatchEvent & { kind: K; payload: P };
export type SessionStartEvent = TypedWatchEvent<"session.start", SessionStartPayload>;
export type ExerciseAddEvent = TypedWatchEvent<"exercise.add", ExerciseAddPayload>;
export type SetLogEvent = TypedWatchEvent<"set.log", SetLogPayload>;
export type SetReviseEvent = TypedWatchEvent<"set.revise", SetRevisePayload>;
export type SetVoidEvent = TypedWatchEvent<"set.void", SetVoidPayload>;
export type SessionEndEvent = TypedWatchEvent<"session.end", SessionEndPayload>;

// ---------------------------------------------------------------------------
// Delivery envelope and acknowledgement.
// ---------------------------------------------------------------------------

/** A batch on the wire. Batching is a transport detail, never identity. */
export type WatchEnvelope = {
  schema: number;
  envelopeId: string;
  sentAt: number;
  events: WatchEvent[];
};

/**
 * Why the phone would not apply an event. Every reason here is PERMANENT: the
 * outbox drops a rejected event instead of retrying it forever, and surfaces the
 * reason. A transient failure is never a rejection — it is simply an event that
 * was not acknowledged, and it stays queued.
 */
export type RejectReason =
  | "schema_unsupported"
  | "invalid_payload"
  | "unknown_session"
  | "unknown_exercise"
  | "not_entitled";

export type WatchAck = {
  schema: number;
  envelopeId: string;
  /** Applied, or recognised as an already-applied duplicate. Both are done. */
  accepted: string[];
  rejected: { eventId: string; reason: RejectReason }[];
};

// ---------------------------------------------------------------------------
// Identity.
// ---------------------------------------------------------------------------

let mintCounter = 0;

/**
 * A stable identifier for an event, set or session.
 *
 * The property that matters is STABILITY — the same id must survive a retry —
 * not global uniqueness, because ids are only ever compared within one owner's
 * own pair of devices. Time, a per-process counter and randomness together put
 * a collision inside one session out of reach without adding a UUID dependency,
 * which would mean regenerating the release manifest for a value that is never
 * compared across users.
 */
export function mintId(prefix: string, now: () => number = Date.now): string {
  mintCounter = (mintCounter + 1) % 0xffff;
  const time = now().toString(36);
  const count = mintCounter.toString(36).padStart(3, "0");
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${time}${count}${rand}`;
}

/** Test seam — makes minted ids reproducible in sequence assertions. */
export function __resetMintCounter() {
  mintCounter = 0;
}

// ---------------------------------------------------------------------------
// Parsing. Anything that crosses the device boundary is untrusted.
// ---------------------------------------------------------------------------

export type ParsedEvent = { ok: true; event: WatchEvent } | { ok: false; reason: RejectReason };

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function isIdSpace(v: unknown): v is ExerciseIdSpace {
  return v === "anatomy" || v === "plan";
}

function payloadValid(kind: WatchEventKind, p: any): boolean {
  switch (kind) {
    case "session.start":
      return typeof p?.startedAt === "number" && Number.isFinite(p.startedAt);
    case "exercise.add":
      return isNonEmptyString(p?.exerciseId) && isIdSpace(p?.idSpace);
    case "set.log":
      return (
        isNonEmptyString(p?.setId) &&
        isNonEmptyString(p?.exerciseId) &&
        isIdSpace(p?.idSpace) &&
        isValidReps(p?.reps) &&
        isWeightValue(p?.weight) &&
        (p.warmup === undefined || typeof p.warmup === "boolean")
      );
    case "set.revise":
      return (
        isNonEmptyString(p?.setId) &&
        typeof p?.revision === "number" &&
        Number.isInteger(p.revision) &&
        p.revision >= 1 &&
        isValidReps(p?.reps) &&
        isWeightValue(p?.weight) &&
        (p.warmup === undefined || typeof p.warmup === "boolean")
      );
    case "set.void":
      return isNonEmptyString(p?.setId);
    case "session.end":
      return typeof p?.endedAt === "number" && Number.isFinite(p.endedAt);
    default:
      return false;
  }
}

const KINDS: WatchEventKind[] = [
  "session.start",
  "exercise.add",
  "set.log",
  "set.revise",
  "set.void",
  "session.end",
];

/**
 * Validates one event off the wire. A future schema is refused BY VERSION rather
 * than by shape, so a newer watch never has its data quietly truncated by an
 * older phone — the user is told to update instead.
 */
export function parseWatchEvent(raw: unknown): ParsedEvent {
  const e = raw as WatchEvent;
  if (!e || typeof e !== "object") return { ok: false, reason: "invalid_payload" };
  if (typeof e.schema !== "number" || !Number.isInteger(e.schema) || e.schema < 1) {
    return { ok: false, reason: "invalid_payload" };
  }
  if (e.schema > WATCH_SCHEMA_VERSION) return { ok: false, reason: "schema_unsupported" };
  if (!isNonEmptyString(e.eventId) || !isNonEmptyString(e.sessionId)) {
    return { ok: false, reason: "invalid_payload" };
  }
  if (typeof e.seq !== "number" || !Number.isInteger(e.seq) || e.seq < 0) {
    return { ok: false, reason: "invalid_payload" };
  }
  if (typeof e.at !== "number" || !Number.isFinite(e.at)) return { ok: false, reason: "invalid_payload" };
  if (!isWatchSource(e.source)) return { ok: false, reason: "invalid_payload" };
  if (!KINDS.includes(e.kind)) return { ok: false, reason: "invalid_payload" };
  if (!payloadValid(e.kind, e.payload)) return { ok: false, reason: "invalid_payload" };
  return { ok: true, event: e };
}

export type ParsedEnvelope =
  | { ok: true; envelope: WatchEnvelope; rejected: { eventId: string; reason: RejectReason }[] }
  | { ok: false; reason: RejectReason };

/**
 * Validates a batch. One bad event does not discard the batch — it is rejected
 * on its own and the rest are applied, because throwing away four good sets
 * because a fifth was malformed loses real work.
 */
export function parseWatchEnvelope(raw: unknown): ParsedEnvelope {
  const env = raw as WatchEnvelope;
  if (!env || typeof env !== "object") return { ok: false, reason: "invalid_payload" };
  if (typeof env.schema !== "number" || env.schema < 1) return { ok: false, reason: "invalid_payload" };
  if (env.schema > WATCH_SCHEMA_VERSION) return { ok: false, reason: "schema_unsupported" };
  if (!isNonEmptyString(env.envelopeId) || !Array.isArray(env.events)) {
    return { ok: false, reason: "invalid_payload" };
  }

  const events: WatchEvent[] = [];
  const rejected: { eventId: string; reason: RejectReason }[] = [];
  for (const candidate of env.events) {
    const parsed = parseWatchEvent(candidate);
    if (parsed.ok) events.push(parsed.event);
    else {
      const id = isNonEmptyString((candidate as any)?.eventId) ? (candidate as any).eventId : "";
      rejected.push({ eventId: id, reason: parsed.reason });
    }
  }
  return { ok: true, envelope: { ...env, events }, rejected };
}

/**
 * Canonical ordering: the watch's own counter first, its clock as a tiebreak,
 * then the id so the sort is total and stable. Never arrival order.
 */
export function orderEvents(events: readonly WatchEvent[]): WatchEvent[] {
  return [...events].sort((a, b) => a.seq - b.seq || a.at - b.at || (a.eventId < b.eventId ? -1 : 1));
}
