// The 26 Aug simulator drill, envelope for envelope. Three envelopes, not one:
// the offline set arrives ALONE first (retry fires before the end is due), the
// same event is redelivered on the second transport channel, and the final
// channel carries [set, end] together. The session was adopted — the phone
// started it, so no session.start event ever goes through the applier and the
// session already holds prefilled sets the watch never saw.
import assert from "node:assert/strict";
import test from "node:test";

import { ActiveSession } from "../src/session/activeSession";
import { routeEnvelope } from "../src/watch/bridge";
import { ApplyContext, WatchLedger, emptyLedger } from "../src/watch/apply";
import { WATCH_SCHEMA_VERSION, WatchEnvelope, WatchEvent } from "../src/watch/protocol";

const NOW = 1_700_000_000_000;
const SESSION = "s_phone_adopted";

function ctx(over: Partial<ApplyContext> = {}): ApplyContext {
  return { sessionUnit: "kg", entitled: true, ownerKind: "account", ownerId: "user_1", now: NOW, ...over };
}

let n = 0;
function log(seq: number, setId: string): WatchEvent {
  n += 1;
  return {
    schema: WATCH_SCHEMA_VERSION, eventId: `ev_log${n}`, sessionId: SESSION, seq, at: NOW + seq * 1000,
    source: "watch.voice", kind: "set.log",
    payload: { setId, exerciseId: "bench-press", idSpace: "anatomy", reps: 8, weight: { value: 80, unit: "kg" } },
  };
}
function end(seq: number): WatchEvent {
  return {
    schema: WATCH_SCHEMA_VERSION, eventId: "ev_end", sessionId: SESSION, seq, at: NOW + seq * 1000,
    source: "watch.voice", kind: "session.end", payload: { endedAt: NOW + 120_000 },
  };
}
function envelope(events: WatchEvent[], id: string): WatchEnvelope {
  return { schema: WATCH_SCHEMA_VERSION, envelopeId: id, sentAt: NOW, events };
}
const ids = (s: ActiveSession | null) => (s?.exercises ?? []).flatMap((e) => e.sets.map((x) => x.id)).sort();

test("the September drill shape: solo offline set, dual redelivery, then [set,end]", () => {
  // Phone-started session the watch adopted: prefilled sets, no start event.
  const adopted: ActiveSession = {
    sessionId: SESSION, startedAt: NOW,
    exercises: [{ exerciseId: "bench-press", idSpace: "anatomy", sets: [
      { id: "p1", weight: 60, reps: 10, done: false },
      { id: "p2", weight: 60, reps: 10, done: false },
    ], notes: "" }],
    updatedAt: NOW, unit: "kg",
  } as unknown as ActiveSession;

  const online = log(0, "set_online");
  const offline = log(1, "set_offline");

  // Pre-shutdown: online set on its own envelope. Binds the fresh ledger.
  const r0 = routeEnvelope(envelope([online], "envA"), { session: adopted, ledger: emptyLedger(), ctx: ctx() });
  assert.deepEqual(ids(r0.session), ["p1", "p2", "set_online"]);

  // Reconnect, envelope 1: the offline set ALONE. This is the shape that lost it.
  const r1 = routeEnvelope(envelope([offline], "envB"), { session: r0.session, ledger: r0.ledger, ctx: ctx() });
  assert.deepEqual(r1.ack.accepted, [offline.eventId]);
  assert.deepEqual(ids(r1.session), ["p1", "p2", "set_offline", "set_online"],
    "the solo offline set MUST materialise in the same envelope that accepts it");
  assert.ok(r1.ledger.processed.includes(offline.eventId));

  // Envelope 2: the same event again on the other channel. No change.
  const r2 = routeEnvelope(envelope([offline], "envC"), { session: r1.session, ledger: r1.ledger, ctx: ctx() });
  assert.deepEqual(r2.ack.accepted, [offline.eventId]);
  assert.deepEqual(ids(r2.session), ids(r1.session));

  // Envelope 3: [set, end]. Commits with BOTH watch sets.
  const r3 = routeEnvelope(envelope([offline, end(2)], "envD"), { session: r2.session, ledger: r2.ledger, ctx: ctx() });
  assert.equal(r3.finished, true);
  assert.deepEqual(ids(r3.session), ["p1", "p2", "set_offline", "set_online"]);
});

test("the same chain but envelope 1 handed a STALE session missing the online set", () => {
  // What the phone actually does between envelopes is rebuild `current` from
  // React state. If that read is stale, the applier gets yesterday's session
  // with today's ledger. This documents what the pure layer does with that.
  const adopted: ActiveSession = {
    sessionId: SESSION, startedAt: NOW,
    exercises: [{ exerciseId: "bench-press", idSpace: "anatomy", sets: [
      { id: "p1", weight: 60, reps: 10, done: false },
    ], notes: "" }],
    updatedAt: NOW, unit: "kg",
  } as unknown as ActiveSession;

  const online = log(0, "set_online2");
  const offline = log(1, "set_offline2");
  const r0 = routeEnvelope(envelope([online], "envA2"), { session: adopted, ledger: emptyLedger(), ctx: ctx() });

  // Envelope with the offline set + end, but the session handed in is the
  // PRE-online-set one (stale closure), ledger fresh from disk.
  const r1 = routeEnvelope(envelope([offline, end(2)], "envB2"), { session: adopted, ledger: r0.ledger, ctx: ctx() });
  // The applier cannot know the session is stale: the online set is silently
  // gone from what gets committed, while its event stays "processed".
  assert.deepEqual(ids(r1.session), ["p1", "set_offline2"],
    "stale session in = online set lost, exactly the artifact class observed");
  assert.ok(r1.ledger.processed.includes(online.eventId));
});
