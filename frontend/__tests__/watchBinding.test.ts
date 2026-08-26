// The binding lifecycle — built from a state captured live on 26 Aug 2026:
// the phone's ledger bound to a session id that no session owned (not active,
// not closed, endRequested false), while the watch outbox held nine events
// from three OTHER sessions at up to 39 retries. Release was driven only by
// the bound session's own end event, which could never come — a durable
// deadlock, with six user sets stuck inside it.
import assert from "node:assert/strict";
import test from "node:test";

import { ActiveSession } from "../src/session/activeSession";
import {
  ApplyContext,
  WatchLedger,
  applyWatchEvents,
  closeBoundSession,
  emptyLedger,
} from "../src/watch/apply";
import { WATCH_SCHEMA_VERSION, WatchEvent } from "../src/watch/protocol";

const NOW = 1_700_000_000_000;

function ctx(over: Partial<ApplyContext> = {}): ApplyContext {
  return { sessionUnit: "kg", entitled: true, ownerKind: "account", ownerId: "user_1", now: NOW, ...over };
}

let n = 0;
function ev(kind: WatchEvent["kind"], sessionId: string, seq: number, payload: unknown): WatchEvent {
  n += 1;
  return {
    schema: WATCH_SCHEMA_VERSION, eventId: `evb${n}`, sessionId, seq, at: NOW + seq,
    source: "watch.voice", kind, payload,
  } as WatchEvent;
}
const log = (sessionId: string, seq: number, setId: string) =>
  ev("set.log", sessionId, seq, { setId, exerciseId: "bench-press", idSpace: "anatomy", reps: 8, weight: { value: 80, unit: "kg" } });
const end = (sessionId: string, seq: number) => ev("session.end", sessionId, seq, { endedAt: NOW + 60_000 });

function phoneSession(sessionId: string, setIds: string[] = []): ActiveSession {
  return {
    sessionId, startedAt: NOW,
    exercises: [{ exerciseId: "bench-press", idSpace: "anatomy", sets: setIds.map((id) => ({ id, weight: 60, reps: 10, done: false })), notes: "" }],
    updatedAt: NOW, unit: "kg",
  } as unknown as ActiveSession;
}

/** The captured pre-state: bound to a fourth id nobody owns. */
function zombieLedger(): WatchLedger {
  return {
    ...emptyLedger(),
    sessionId: "s_zombie",
    processed: ["ev_applied_into_the_void"],
    seenSeqs: [0],
  };
}

test("a binding whose session the phone no longer has is closed, not honoured for ever", () => {
  const out = applyWatchEvents(phoneSession("s_active", ["p1"]), zombieLedger(), [log("s_active", 0, "set_new")], ctx());
  // The zombie moved into closed with its processed ids intact…
  assert.ok(out.ledger.closed.some((c) => c.sessionId === "s_zombie" && c.eventIds.includes("ev_applied_into_the_void")));
  // …and the live session's event binds and applies in the SAME envelope.
  assert.equal(out.ledger.sessionId, "s_active");
  assert.deepEqual(out.accepted.length, 1);
  assert.ok(out.session?.exercises[0].sets.some((s) => s.id === "set_new"), "the deadlock no longer swallows live sets");
});

test("a redelivery of the zombie's own applied event is a duplicate, not a second set", () => {
  const applied = { ...log("s_zombie", 0, "set_void"), eventId: "ev_applied_into_the_void" };
  const out = applyWatchEvents(phoneSession("s_active"), zombieLedger(), [applied], ctx());
  assert.deepEqual(out.accepted, ["ev_applied_into_the_void"]);
  assert.equal(out.session?.exercises[0].sets.length, 0, "acknowledged via closed, never re-applied");
});

test("a NEW event for the closed zombie is refused so the watch surfaces the loss", () => {
  const out = applyWatchEvents(phoneSession("s_active"), zombieLedger(), [log("s_zombie", 1, "set_late")], ctx());
  assert.deepEqual(out.rejected.map((r) => r.reason), ["unknown_session"]);
  assert.equal(out.deferred.length, 0, "refused, never deferred into a silent retry loop");
});

test("a third session's backlog still defers while another workout is live — two workouts never merge", () => {
  const out = applyWatchEvents(phoneSession("s_active"), zombieLedger(), [log("s_other", 0, "set_o1")], ctx());
  assert.deepEqual(out.deferred.length, 1);
  // The zombie is gone and nothing new bound: only the live session's own
  // events (or an idle phone) may claim the next binding.
  assert.equal(out.ledger.sessionId, null);
  assert.ok(out.ledger.closed.some((c) => c.sessionId === "s_zombie"));
});

test("once the phone is idle, that backlog binds, recovers and finishes as its own workout", () => {
  // The zombie was closed in an earlier envelope; phone session since released.
  const afterClose = closeBoundSession(zombieLedger(), NOW);
  const backlog = [log("s_other", 0, "set_o1"), log("s_other", 1, "set_o2"), end("s_other", 2)];
  const out = applyWatchEvents(null, afterClose, backlog, ctx());
  assert.equal(out.finished, true);
  assert.deepEqual(out.session?.exercises[0].sets.map((s) => s.id), ["set_o1", "set_o2"]);
});

test("a null phone session is NOT proof of death — a mid-backlog binding survives it", () => {
  // The caller rebuilds `current` from render-time state, so envelope 2 of an
  // offline backlog can arrive with session null while the ledger is bound.
  const first = applyWatchEvents(null, emptyLedger(), [log("s_backlog", 0, "set_b1")], ctx());
  const second = applyWatchEvents(null, first.ledger, [log("s_backlog", 1, "set_b2")], ctx());
  assert.equal(second.ledger.sessionId, "s_backlog", "still bound");
  assert.equal(second.ledger.closed.length, 0, "nothing was prematurely closed");
  assert.deepEqual(second.accepted.length, 1);
});

test("a failed-commit retry keeps its binding — the ids match, so nothing is closed", () => {
  const bound: WatchLedger = { ...emptyLedger(), sessionId: "s_active", processed: ["evx"], seenSeqs: [0], endRequested: true };
  const out = applyWatchEvents(phoneSession("s_active", ["p1"]), bound, [end("s_active", 1)], ctx());
  assert.equal(out.ledger.sessionId, "s_active");
  assert.equal(out.ledger.closed.length, 0);
});

test("closing an already-unbound ledger still clears the per-session scratch state", () => {
  const leaked: WatchLedger = { ...emptyLedger(), sessionId: null, voided: ["set_ghost"], processed: ["ev_ghost"], seenSeqs: [3], revisions: { set_ghost: 2 } };
  const out = closeBoundSession(leaked, NOW);
  assert.deepEqual([out.voided, out.processed, out.seenSeqs, out.revisions], [[], [], [], {}]);
});
