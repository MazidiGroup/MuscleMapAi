// Apple Watch companion — the wire contract, the outbox and exactly-once apply.
//
// The claims under test are the ones that decide whether a user loses a session
// or finds it twice: a redelivered event must not duplicate a set, an offline
// backlog must land complete, an undo must stay undone, and a workout must not
// be committed while part of it is still queued. All pure — the transport is
// simulated by handing envelopes straight to the phone's router.
import assert from "node:assert/strict";
import test from "node:test";

import { ActiveSession } from "../src/session/activeSession";
import { routeEnvelope } from "../src/watch/bridge";
import { ApplyContext, WatchLedger, applyWatchEvents, contiguousUpTo, emptyLedger } from "../src/watch/apply";
import {
  applyAck,
  backoffMs,
  dropRejected,
  emptyOutbox,
  enqueue,
  isDue,
  markAttempted,
  nextBatch,
  pendingCount,
  rejections,
  unackedExerciseKeys,
  unackedSetIds,
} from "../src/watch/outbox";
import {
  WATCH_SCHEMA_VERSION,
  WatchEnvelope,
  WatchEvent,
  WatchEventKind,
  WatchEventPayload,
  orderEvents,
  parseWatchEnvelope,
  parseWatchEvent,
} from "../src/watch/protocol";
import { buildContextPayload, isNewerPayload, mergeSnapshot } from "../src/watch/snapshot";
import { emptySnapshot } from "../src/watch/session";

const NOW = 1_700_000_000_000;
const SESSION = "s_watch_1";

// --- fixtures ---------------------------------------------------------------

let counter = 0;
function ev(kind: WatchEventKind, seq: number, payload: WatchEventPayload, over: Partial<WatchEvent> = {}): WatchEvent {
  counter += 1;
  return {
    schema: WATCH_SCHEMA_VERSION,
    eventId: `ev${counter}`,
    sessionId: SESSION,
    seq,
    at: NOW + seq,
    source: "watch.voice",
    kind,
    payload,
    ...over,
  };
}

function envelope(events: WatchEvent[], id = "env1"): WatchEnvelope {
  return { schema: WATCH_SCHEMA_VERSION, envelopeId: id, sentAt: NOW, events };
}

function ctx(over: Partial<ApplyContext> = {}): ApplyContext {
  return {
    sessionUnit: "kg",
    entitled: true,
    ownerKind: "account",
    ownerId: "user_1",
    now: NOW,
    ...over,
  };
}

const startEv = () => ev("session.start", 0, { startedAt: NOW });
const logEv = (seq: number, setId: string, reps: number, value = 80, unit: "kg" | "lb" = "kg") =>
  ev("set.log", seq, { setId, exerciseId: "bench-press", idSpace: "anatomy", reps, weight: { value, unit } });

function allSets(session: ActiveSession | null) {
  return (session?.exercises ?? []).flatMap((e) => e.sets);
}

// --- protocol ---------------------------------------------------------------

test("a well-formed event parses and a malformed one is refused by field", () => {
  assert.equal(parseWatchEvent(startEv()).ok, true);
  const bad = [
    null,
    {},
    { ...startEv(), eventId: "" },
    { ...startEv(), sessionId: "" },
    { ...startEv(), seq: -1 },
    { ...startEv(), seq: 1.5 },
    { ...startEv(), source: "server" },
    { ...startEv(), kind: "set.delete" },
    { ...logEv(1, "set1", 8), payload: { setId: "set1", exerciseId: "x", idSpace: "anatomy", reps: 0, weight: { value: 1, unit: "kg" } } },
    { ...logEv(1, "set1", 8), payload: { setId: "set1", exerciseId: "x", idSpace: "anatomy", reps: 8, weight: { value: 1, unit: "stone" } } },
  ];
  for (const b of bad) {
    const parsed = parseWatchEvent(b);
    assert.equal(parsed.ok, false, JSON.stringify(b));
    if (!parsed.ok) assert.equal(parsed.reason, "invalid_payload");
  }
});

test("an event from a future schema is refused by version, not misread", () => {
  const parsed = parseWatchEvent({ ...startEv(), schema: WATCH_SCHEMA_VERSION + 1 });
  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.equal(parsed.reason, "schema_unsupported");
});

test("one bad event in an envelope does not discard the good ones", () => {
  const good = logEv(1, "set1", 8);
  const parsed = parseWatchEnvelope(envelope([good, { ...logEv(2, "set2", 8), seq: -5 } as WatchEvent]));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.envelope.events.length, 1);
  assert.equal(parsed.envelope.events[0].eventId, good.eventId);
  assert.equal(parsed.rejected.length, 1);
});

test("events order by their own sequence, never by arrival", () => {
  const a = logEv(3, "c", 8);
  const b = logEv(1, "a", 8);
  const c = logEv(2, "b", 8);
  assert.deepEqual(orderEvents([a, b, c]).map((e) => e.seq), [1, 2, 3]);
});

test("contiguity is what the end-of-workout gate asks about", () => {
  assert.equal(contiguousUpTo([0, 1, 2], 2), true);
  assert.equal(contiguousUpTo([0, 2], 2), false, "1 is missing");
  assert.equal(contiguousUpTo([], -1), true, "nothing required");
});

// --- outbox -----------------------------------------------------------------

test("queueing the same event twice queues it once", () => {
  const e = logEv(1, "set1", 8);
  let box = enqueue(emptyOutbox(), [e], NOW);
  box = enqueue(box, [e], NOW + 100);
  assert.equal(pendingCount(box), 1, "a retry is not a second set");
});

test("a batch goes out in sequence order and is capped", () => {
  const events = Array.from({ length: 30 }, (_, i) => logEv(29 - i, `set${i}`, 8));
  const box = enqueue(emptyOutbox(), events, NOW);
  const batch = nextBatch(box, NOW);
  assert.ok(batch);
  assert.equal(batch!.events.length, 25);
  assert.deepEqual(batch!.events.slice(0, 3).map((e) => e.seq), [0, 1, 2]);
});

test("backoff delays a retry and the entry is never dropped for failing", () => {
  const box0 = enqueue(emptyOutbox(), [logEv(1, "set1", 8)], NOW);
  const batch = nextBatch(box0, NOW)!;
  const box1 = markAttempted(box0, batch, NOW);
  assert.equal(isDue(box1.entries[0], NOW), false, "a failed send waits");
  assert.equal(isDue(box1.entries[0], NOW + backoffMs(1)), true);
  assert.equal(pendingCount(box1), 1, "an unacknowledged event stays queued forever");
});

test("an acknowledgement clears exactly the ids it names", () => {
  const a = logEv(1, "set1", 8);
  const b = logEv(2, "set2", 8);
  const box = enqueue(emptyOutbox(), [a, b], NOW);
  const res = applyAck(box, {
    schema: WATCH_SCHEMA_VERSION,
    envelopeId: "env1",
    accepted: [a.eventId],
    rejected: [],
  });
  assert.deepEqual(res.cleared, [a.eventId]);
  assert.equal(pendingCount(res.outbox), 1, "an unmentioned event is not forgotten");
});

test("a rejection is surfaced once and then dropped, never retried forever", () => {
  const a = logEv(1, "set1", 8);
  const box = enqueue(emptyOutbox(), [a], NOW);
  const res = applyAck(box, {
    schema: WATCH_SCHEMA_VERSION,
    envelopeId: "env1",
    accepted: [],
    rejected: [{ eventId: a.eventId, reason: "unknown_exercise" }],
  });
  assert.equal(rejections(res.outbox).length, 1);
  assert.equal(pendingCount(res.outbox), 0, "a permanent refusal stops being sent");
  assert.equal(dropRejected(res.outbox).entries.length, 0);
});

// --- exactly-once apply ------------------------------------------------------

test("a duplicated delivery does not duplicate the set", () => {
  const events = [startEv(), logEv(1, "set1", 8)];
  const first = applyWatchEvents(null, emptyLedger(), events, ctx());
  assert.equal(allSets(first.session).length, 1);

  const second = applyWatchEvents(first.session, first.ledger, events, ctx());
  assert.equal(allSets(second.session).length, 1, "the retry changed nothing");
  assert.deepEqual(second.accepted.sort(), events.map((e) => e.eventId).sort(), "and was still acknowledged");
});

test("two genuinely identical sets both survive; only a redelivery does not", () => {
  const events = [startEv(), logEv(1, "set1", 8), logEv(2, "set2", 8)];
  const out = applyWatchEvents(null, emptyLedger(), events, ctx());
  assert.equal(allSets(out.session).length, 2, "identity is the event id, not the contents");
});

test("out-of-order arrival converges on the in-order result", () => {
  const events = [startEv(), logEv(1, "set1", 8), logEv(2, "set2", 10)];
  const inOrder = applyWatchEvents(null, emptyLedger(), events, ctx());
  const shuffled = applyWatchEvents(null, emptyLedger(), [events[2], events[0], events[1]], ctx());
  assert.deepEqual(
    allSets(shuffled.session).map((s) => s.id),
    allSets(inOrder.session).map((s) => s.id),
  );
});

test("a set logged on the watch in kilos arrives converted on a phone in pounds", () => {
  const out = applyWatchEvents(null, emptyLedger(), [startEv(), logEv(1, "set1", 5, 100, "kg")], ctx({ sessionUnit: "lb" }));
  // 100 kg / 0.45359237 = 220.46, rounded to whole pounds.
  assert.equal(allSets(out.session)[0].weight, 220, "converted, not relabelled");
});

test("a watch set lands as a completed set with its own id", () => {
  const out = applyWatchEvents(null, emptyLedger(), [startEv(), logEv(1, "set1", 8)], ctx());
  const set = allSets(out.session)[0];
  assert.equal(set.id, "set1", "the watch's id is the set's identity on the phone too");
  assert.equal(set.done, true);
  assert.equal(set.reps, 8);
});

test("a revision applies once and a stale one is discarded", () => {
  const base = applyWatchEvents(null, emptyLedger(), [startEv(), logEv(1, "set1", 8)], ctx());
  const rev2 = ev("set.revise", 2, { setId: "set1", revision: 2, reps: 12, weight: { value: 80, unit: "kg" } });
  const rev1 = ev("set.revise", 3, { setId: "set1", revision: 1, reps: 6, weight: { value: 80, unit: "kg" } });

  const after2 = applyWatchEvents(base.session, base.ledger, [rev2], ctx());
  assert.equal(allSets(after2.session)[0].reps, 12);

  const after1 = applyWatchEvents(after2.session, after2.ledger, [rev1], ctx());
  assert.equal(allSets(after1.session)[0].reps, 12, "an older revision never wins");
  assert.deepEqual(after1.accepted, [rev1.eventId], "and is still acknowledged, not retried");
});

test("an undo is terminal — a redelivered log does not resurrect the set", () => {
  const log = logEv(1, "set1", 8);
  const first = applyWatchEvents(null, emptyLedger(), [startEv(), log], ctx());
  const voided = applyWatchEvents(first.session, first.ledger, [ev("set.void", 2, { setId: "set1" })], ctx());
  assert.equal(allSets(voided.session).length, 0);

  // The phone forgot the event id? It cannot: the ledger holds the tombstone.
  const replay = applyWatchEvents(voided.session, voided.ledger, [{ ...log, eventId: "ev-replay" }], ctx());
  assert.equal(allSets(replay.session).length, 0, "the tombstone outranks a late log");
});

test("an undo that overtakes its own set suppresses it on arrival", () => {
  const start = applyWatchEvents(null, emptyLedger(), [startEv()], ctx());
  const voidFirst = applyWatchEvents(start.session, start.ledger, [ev("set.void", 2, { setId: "set9" })], ctx());
  const late = applyWatchEvents(voidFirst.session, voidFirst.ledger, [logEv(1, "set9", 8)], ctx());
  assert.equal(allSets(late.session).length, 0, "the set never materialises");
  assert.equal(late.accepted.length, 1);
});

test("a revision for a set that has not arrived is held, not invented", () => {
  const start = applyWatchEvents(null, emptyLedger(), [startEv()], ctx());
  const rev = ev("set.revise", 5, { setId: "ghost", revision: 1, reps: 8, weight: { value: 80, unit: "kg" } });
  const out = applyWatchEvents(start.session, start.ledger, [rev], ctx());
  assert.deepEqual(out.deferred, [rev.eventId]);
  assert.equal(allSets(out.session).length, 0);
});

// --- finishing --------------------------------------------------------------

test("a workout is not committed while part of it is still queued", () => {
  // Sets 1 and 3 arrive; set 2 is still on the watch. The end event must wait.
  const events = [startEv(), logEv(1, "set1", 8), ev("session.end", 4, { endedAt: NOW + 1000 })];
  const out = applyWatchEvents(null, emptyLedger(), events, ctx());
  assert.equal(out.finished, false, "seq 2 and 3 were never seen");
  assert.equal(out.deferred.length, 1);

  const rest = applyWatchEvents(out.session, out.ledger, [logEv(2, "set2", 8), logEv(3, "set3", 8)], ctx());
  const end = applyWatchEvents(rest.session, rest.ledger, [events[2]], ctx());
  assert.equal(end.finished, true, "with the backlog in, the workout finishes");
  assert.equal(allSets(end.session).length, 3);
});

test("a late redelivery after the workout is saved does not start a second one", () => {
  const events = [startEv(), logEv(1, "set1", 8), ev("session.end", 2, { endedAt: NOW + 1000 })];
  const done = applyWatchEvents(null, emptyLedger(), events, ctx());
  assert.equal(done.finished, true);
  assert.equal(done.ledger.sessionId, null, "the session is retired");
  assert.equal(done.ledger.closed.length, 1, "but remembered");

  // The caller commits and clears the session; the watch retries anyway.
  const replay = applyWatchEvents(null, done.ledger, events, ctx());
  assert.equal(replay.session, null, "no second workout is created");
  assert.deepEqual(replay.accepted.sort(), events.map((e) => e.eventId).sort());
});

// --- session binding ---------------------------------------------------------

test("events for a different session are held, never merged into the running one", () => {
  const mine = applyWatchEvents(null, emptyLedger(), [startEv(), logEv(1, "set1", 8)], ctx());
  const other = ev("set.log", 1, {
    setId: "otherSet",
    exerciseId: "squat",
    idSpace: "anatomy",
    reps: 5,
    weight: { value: 100, unit: "kg" },
  }, { sessionId: "s_other" });

  const out = applyWatchEvents(mine.session, mine.ledger, [other], ctx());
  assert.deepEqual(out.deferred, [other.eventId], "two workouts must not become one");
  assert.equal(allSets(out.session).length, 1);
});

test("a whole workout recorded with no phone lands complete when it reconnects", () => {
  const backlog = [
    startEv(),
    ev("exercise.add", 1, { exerciseId: "bench-press", idSpace: "anatomy" }),
    logEv(2, "set1", 10, 60),
    logEv(3, "set2", 8, 80),
    logEv(4, "set3", 6, 90),
    ev("session.end", 5, { endedAt: NOW + 3_600_000 }),
  ];
  const out = applyWatchEvents(null, emptyLedger(), backlog, ctx());
  assert.equal(out.finished, true);
  assert.equal(out.session?.startedAt, NOW, "the duration is the user's, not the sync's");
  assert.deepEqual(allSets(out.session).map((s) => s.reps), [10, 8, 6]);
  assert.equal(out.rejected.length, 0);
});

// --- entitlement at the phone boundary ---------------------------------------

test("the phone re-checks entitlement and refuses a write it does not authorise", () => {
  const out = applyWatchEvents(null, emptyLedger(), [startEv(), logEv(1, "set1", 8)], ctx({ entitled: false }));
  assert.equal(out.session, null);
  assert.equal(out.accepted.length, 0);
  assert.equal(out.rejected.length, 2);
  assert.equal(out.rejected[0].reason, "not_entitled");
});

test("an unknown exercise is refused rather than written under an invented id", () => {
  const out = applyWatchEvents(null, emptyLedger(), [startEv(), logEv(1, "set1", 8)], ctx({
    knowsExercise: () => false,
  }));
  assert.equal(out.rejected.some((r) => r.reason === "unknown_exercise"), true);
  assert.equal(allSets(out.session).length, 0);
});

// --- the router -------------------------------------------------------------

test("the router answers with an acknowledgement the outbox can act on", () => {
  const events = [startEv(), logEv(1, "set1", 8)];
  const res = routeEnvelope(envelope(events), { session: null, ledger: emptyLedger(), ctx: ctx() });
  assert.equal(res.ack.envelopeId, "env1");
  assert.deepEqual(res.ack.accepted.sort(), events.map((e) => e.eventId).sort());

  const box = enqueue(emptyOutbox(), events, NOW);
  assert.equal(pendingCount(applyAck(box, res.ack).outbox), 0, "the watch may now forget them");
});

test("an unreadable envelope acknowledges nothing, so nothing is lost", () => {
  const res = routeEnvelope({ nonsense: true }, { session: null, ledger: emptyLedger(), ctx: ctx() });
  assert.deepEqual(res.ack.accepted, []);
  assert.equal(res.session, null);
});

test("a round trip through the outbox delivers each set exactly once", () => {
  const events = [startEv(), logEv(1, "set1", 8), logEv(2, "set2", 8), logEv(3, "set3", 8)];
  let box = enqueue(emptyOutbox(), events, NOW);
  let session: ActiveSession | null = null;
  let ledger: WatchLedger = emptyLedger();
  let now = NOW;
  let sends = 0;

  // Two failed sends, then a successful one, then a spurious replay.
  for (const succeed of [false, false, true, true]) {
    const batch = nextBatch(box, now);
    if (!batch) break;
    sends += 1;
    box = markAttempted(box, batch, now);
    if (succeed) {
      const res = routeEnvelope(batch, { session, ledger, ctx: ctx({ now }) });
      session = res.session;
      ledger = res.ledger;
      box = applyAck(box, res.ack).outbox;
    }
    now += backoffMs(4);
  }

  assert.ok(sends >= 3);
  assert.equal(allSets(session).length, 3, "three sets, however many times they were sent");
  assert.equal(pendingCount(box), 0);
});

// --- snapshot ---------------------------------------------------------------

const activeSession: ActiveSession = {
  schema: 1,
  sessionId: SESSION,
  ownerKind: "account",
  ownerId: "user_1",
  startedAt: NOW,
  updatedAt: NOW,
  exercises: [
    {
      exerciseId: "bench-press",
      idSpace: "anatomy",
      notes: "",
      sets: [
        { id: "p1", weight: 80, reps: 8, done: true },
        { id: "p2", weight: 80, reps: 0, done: false },
      ],
    },
  ],
};

test("the snapshot carries only completed sets and no notes", () => {
  const payload = buildContextPayload({
    session: activeSession,
    unit: "kg",
    restSeconds: 90,
    entitlement: { access: true, state: "ready", verifiedAt: NOW },
    revision: 1,
    now: NOW,
    nameOf: () => "Bench Press",
  });
  assert.equal(payload.session?.exercises[0].sets.length, 1, "an empty row is not a result");
  assert.equal(payload.session?.exercises[0].name, "Bench Press");
  assert.equal(JSON.stringify(payload).includes("notes"), false);
});

test("an older application context is discarded by revision", () => {
  const make = (revision: number) =>
    buildContextPayload({
      session: null,
      unit: "kg",
      restSeconds: 90,
      entitlement: { access: true, state: "ready", verifiedAt: NOW },
      revision,
      now: NOW,
    });
  assert.equal(isNewerPayload(3, make(2)), false);
  assert.equal(isNewerPayload(3, make(4)), true);
  assert.equal(isNewerPayload(null, make(1)), true);
});

test("a snapshot never removes a set the phone has not acknowledged yet", () => {
  const payload = buildContextPayload({
    session: activeSession,
    unit: "kg",
    restSeconds: 90,
    entitlement: { access: true, state: "ready", verifiedAt: NOW },
    revision: 2,
    now: NOW,
    nameOf: () => "Bench Press",
  });

  const local = {
    ...emptySnapshot("kg"),
    sessionId: SESSION,
    startedAt: NOW,
    grantedAt: NOW,
    exercises: [
      {
        exerciseId: "bench-press",
        idSpace: "anatomy" as const,
        name: "Bench Press",
        targetReps: 8,
        sets: [
          { setId: "p1", reps: 8, weight: { value: 80, unit: "kg" as const }, warmup: false, voided: false, revision: 0, source: "phone" as const, at: 0 },
          { setId: "w1", reps: 6, weight: { value: 85, unit: "kg" as const }, warmup: false, voided: false, revision: 0, source: "watch.voice" as const, at: NOW },
        ],
      },
    ],
  };

  const merged = mergeSnapshot(local, payload, { unackedSetIds: new Set(["w1"]), now: NOW });
  assert.deepEqual(merged.snapshot.exercises[0].sets.map((s) => s.setId), ["p1", "w1"]);
});

test("a phone with no workout does not wipe a watch still holding unsynced work", () => {
  const payload = buildContextPayload({
    session: null,
    unit: "kg",
    restSeconds: 90,
    entitlement: { access: true, state: "ready", verifiedAt: NOW },
    revision: 5,
    now: NOW,
  });
  const local = { ...emptySnapshot("kg"), sessionId: SESSION, startedAt: NOW, grantedAt: NOW };
  const held = mergeSnapshot(local, payload, { unackedSetIds: new Set(["w1"]), now: NOW });
  assert.equal(held.snapshot.sessionId, SESSION, "the phone has simply not caught up");

  const cleared = mergeSnapshot(local, payload, { unackedSetIds: new Set(), now: NOW });
  assert.equal(cleared.snapshot.sessionId, null, "with nothing outstanding it clears");
});

test("the outbox reports exactly what the phone has not confirmed", () => {
  const add = ev("exercise.add", 1, { exerciseId: "squat", idSpace: "anatomy" });
  const log = logEv(2, "set1", 8);
  const voidEv = ev("set.void", 3, { setId: "set1" });
  const box = enqueue(emptyOutbox(), [add, log, voidEv], NOW);

  assert.deepEqual([...unackedSetIds(box)], ["set1"], "only a logged set counts as an unsynced set");
  assert.deepEqual([...unackedExerciseKeys(box)], ["anatomy:squat"]);

  const acked = applyAck(box, {
    schema: WATCH_SCHEMA_VERSION,
    envelopeId: "env1",
    accepted: [add.eventId, log.eventId, voidEv.eventId],
    rejected: [],
  }).outbox;
  assert.equal(unackedSetIds(acked).size, 0);
  assert.equal(unackedExerciseKeys(acked).size, 0);
});

test("an exercise the phone dropped disappears; one it has not seen yet stays", () => {
  const payload = buildContextPayload({
    session: activeSession,
    unit: "kg",
    restSeconds: 90,
    entitlement: { access: true, state: "ready", verifiedAt: NOW },
    revision: 9,
    now: NOW,
    nameOf: () => "Bench Press",
  });

  const withExtra = {
    ...emptySnapshot("kg"),
    sessionId: SESSION,
    startedAt: NOW,
    grantedAt: NOW,
    exercises: [
      { exerciseId: "bench-press", idSpace: "anatomy" as const, name: "Bench Press", targetReps: 8, sets: [] },
      { exerciseId: "squat", idSpace: "anatomy" as const, name: "Squat", targetReps: 5, sets: [] },
    ],
  };

  const stillQueued = mergeSnapshot(withExtra, payload, {
    unackedSetIds: new Set(),
    unackedExerciseKeys: new Set(["anatomy:squat"]),
    now: NOW,
  });
  assert.deepEqual(
    stillQueued.snapshot.exercises.map((e) => e.exerciseId),
    ["bench-press", "squat"],
    "the add has not reached the phone yet",
  );

  const settled = mergeSnapshot(withExtra, payload, { unackedSetIds: new Set(), now: NOW });
  assert.deepEqual(
    settled.snapshot.exercises.map((e) => e.exerciseId),
    ["bench-press"],
    "with nothing outstanding, the phone is right",
  );
});

test("the entitlement always comes from the phone, even when the workout does not", () => {
  const payload = buildContextPayload({
    session: null,
    unit: "kg",
    restSeconds: 90,
    entitlement: { access: false, state: "ready", verifiedAt: NOW },
    revision: 6,
    now: NOW,
  });
  const local = { ...emptySnapshot("kg"), sessionId: SESSION, grantedAt: NOW };
  const merged = mergeSnapshot(local, payload, { unackedSetIds: new Set(["w1"]), now: NOW });
  assert.equal(merged.entitlement.access, false);
  assert.equal(merged.entitlement.verifiedAt, NOW);
});
