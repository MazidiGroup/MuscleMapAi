// The phone's watch-message router.
//
// One function takes whatever arrived over Watch Connectivity and returns the
// next session, the next ledger and the acknowledgement to send back. It is
// pure, so "does a replayed envelope duplicate a set?" is a unit test rather
// than a question you can only answer with two devices and a lift.
//
// Malformed events are rejected INDIVIDUALLY. Discarding a whole envelope
// because one event in it was unreadable would throw away four good sets to
// punish a fifth, and the watch would keep resending the good ones forever.

import { ActiveSession } from "@/src/session/activeSession";

import { ApplyContext, ApplyOutcome, WatchLedger, ackFor, applyWatchEvents } from "./apply";
import { RejectReason, WATCH_SCHEMA_VERSION, WatchAck, parseWatchEnvelope } from "./protocol";

export type RouteResult = {
  session: ActiveSession | null;
  ledger: WatchLedger;
  ack: WatchAck;
  /** True when a `session.end` was applied — the caller runs the finish path. */
  finished: boolean;
  /** Ids left queued on the watch on purpose. Useful for diagnostics only. */
  deferred: string[];
};

/**
 * Handles one envelope.
 *
 * `entitled` is the phone's own answer, re-checked here rather than trusted from
 * the watch. The watch checks before it queues so the user is told immediately;
 * the phone checks before it writes so that a Shortcut, a deep link or a replay
 * from a device whose subscription has since lapsed cannot get past it.
 */
export function routeEnvelope(
  raw: unknown,
  input: { session: ActiveSession | null; ledger: WatchLedger; ctx: ApplyContext },
): RouteResult {
  const parsed = parseWatchEnvelope(raw);

  if (!parsed.ok) {
    // Nothing identifiable came out of it, so there is no id to acknowledge.
    // The watch will retry; if the payload is genuinely corrupt the retry is
    // rejected per event once the envelope itself parses.
    return {
      session: input.session,
      ledger: input.ledger,
      ack: { schema: WATCH_SCHEMA_VERSION, envelopeId: "", accepted: [], rejected: [] },
      finished: false,
      deferred: [],
    };
  }

  const { envelope, rejected } = parsed;
  const outcome: ApplyOutcome = applyWatchEvents(input.session, input.ledger, envelope.events, input.ctx);

  return {
    session: outcome.session,
    ledger: outcome.ledger,
    ack: ackFor(envelope, outcome, rejected as { eventId: string; reason: RejectReason }[]),
    finished: outcome.finished,
    deferred: outcome.deferred,
  };
}

/**
 * A summary for the phone's watch settings screen. Deliberately counts rather
 * than lists: the screen answers "is anything stuck?", and a list of event ids
 * answers nothing a person can act on.
 */
export type SyncSummary = {
  boundSession: string | null;
  appliedEvents: number;
  closedSessions: number;
  voidedSets: number;
};

export function summarise(ledger: WatchLedger): SyncSummary {
  return {
    boundSession: ledger.sessionId,
    appliedEvents: ledger.processed.length,
    closedSessions: ledger.closed.length,
    voidedSets: ledger.voided.length,
  };
}
