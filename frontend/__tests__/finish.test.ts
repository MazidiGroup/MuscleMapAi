// Phase 2 — finishing a workout: PR rules plus a verified local transaction.
import assert from "node:assert/strict";
import test from "node:test";

import { MemoryKV } from "../src/owner/kv";
import { Owner, scopedKey } from "../src/owner/scopeKeys";
import { ScopedStore } from "../src/owner/scopedStore";
import { commitFinishedWorkout, computePRUpdate } from "../src/anatomy/finishWorkout";
import { EMPTY_PRS, PRs, SessionExercise, Workout } from "../src/anatomy/workoutScope";
import { startSession } from "../src/session/activeSession";
import { readActiveSession, __resetSessionLatches } from "../src/session/activeSession";

const guest: Owner = { kind: "guest", id: "g_finish01" };
const other: Owner = { kind: "account", id: "user_finish01" };

let gen = 0;
const tok = (o: Owner) => ({ kind: o.kind, id: o.id, generation: ++gen });

function make(initial: Owner = guest) {
  let current: any = tok(initial);
  const kv = new MemoryKV();
  return { kv, store: new ScopedStore(kv, () => current), current: () => current, setOwner: (o: Owner) => (current = tok(o)) };
}

const set = (weight: number, reps: number, done = true) => ({ id: `s${weight}_${reps}`, weight, reps, done });
const ex = (exerciseId: string, sets: any[]): SessionExercise => ({ exerciseId, sets, notes: "" });

test("the first time an exercise is logged it sets a baseline, not a PR", () => {
  const res = computePRUpdate(EMPTY_PRS, [ex("bench", [set(60, 5)])], { unit: "kg", durationSec: 900 });
  assert.deepEqual(res.newPRs, [], "there was no record to beat");
  assert.deepEqual(res.prs.byExercise.bench, { maxWeight: 60, maxVolume: 300 });
  assert.equal(res.prs.longestSec, 900);
});

test("beating a stored record is announced with the stored unit", () => {
  const prev: PRs = { byExercise: { bench: { maxWeight: 60, maxVolume: 300 } }, longestSec: 900 };
  const res = computePRUpdate(prev, [ex("bench", [set(65, 5)])], {
    unit: "lb",
    durationSec: 1200,
    nameOf: () => "Bench Press",
  });
  assert.deepEqual(res.newPRs, ["Bench Press: 65 lb", "Bench Press: 325 lb volume", "Longest workout!"]);
  assert.deepEqual(res.prs.byExercise.bench, { maxWeight: 65, maxVolume: 325 });
  assert.equal(res.prs.longestSec, 1200);
});

test("unfinished sets and equal results are not records", () => {
  const prev: PRs = { byExercise: { bench: { maxWeight: 60, maxVolume: 300 } }, longestSec: 1000 };
  const res = computePRUpdate(prev, [ex("bench", [set(80, 5, false), set(60, 5)])], { unit: "kg", durationSec: 800 });
  assert.deepEqual(res.newPRs, []);
  assert.deepEqual(res.prs.byExercise.bench, { maxWeight: 60, maxVolume: 300 });
  assert.equal(res.prs.longestSec, 1000);
});

test("bodyweight-only work never fabricates a weight record", () => {
  const prev: PRs = { byExercise: { pullup: { maxWeight: 0, maxVolume: 0 } }, longestSec: 0 };
  const res = computePRUpdate(prev, [ex("pullup", [set(0, 12)])], { unit: "kg", durationSec: 300 });
  assert.deepEqual(res.newPRs, []);
  assert.deepEqual(res.prs.byExercise.pullup, { maxWeight: 0, maxVolume: 0 });
});

const workout = (id: string): Workout => ({
  id,
  date: 1_700_000_000_000,
  durationSec: 1000,
  exercises: [ex("bench", [set(60, 5)])],
});

test("a successful finish writes History and PRs and releases the session", async () => {
  __resetSessionLatches();
  const { kv, store, current } = make();
  await startSession(store, current());
  const nextPRs: PRs = { byExercise: { bench: { maxWeight: 60, maxVolume: 300 } }, longestSec: 1000 };

  const res = await commitFinishedWorkout(store, current(), guest, {
    workout: workout("w1"),
    previousHistory: [],
    nextPRs,
  });

  assert.ok(res.ok);
  assert.deepEqual(JSON.parse(kv.snapshot()[scopedKey(guest, "workouts")]).map((w: Workout) => w.id), ["w1"]);
  assert.deepEqual(JSON.parse(kv.snapshot()[scopedKey(guest, "prs")]), nextPRs);
  assert.equal(await readActiveSession(store, guest), null, "the active session is released only after both writes");
});

test("a failed PR write rolls History back and keeps the active session", async () => {
  __resetSessionLatches();
  const { kv, store, current } = make();
  await startSession(store, current());
  const previousHistory = [workout("old")];
  await store.writeGuarded(current(), "workouts", previousHistory);

  const realSet = kv.set.bind(kv);
  kv.set = async (key: string, value: string) => {
    if (key.includes(".prs.")) throw new Error("disk full");
    return realSet(key, value);
  };

  const res = await commitFinishedWorkout(store, current(), guest, {
    workout: workout("w2"),
    previousHistory,
    nextPRs: { byExercise: {}, longestSec: 5 },
  });

  kv.set = realSet;
  assert.deepEqual(res, { ok: false, reason: "prs_write_failed" });
  assert.deepEqual(
    JSON.parse(kv.snapshot()[scopedKey(guest, "workouts")]).map((w: Workout) => w.id),
    ["old"],
    "History was rolled back",
  );
  assert.ok(await readActiveSession(store, guest), "the workout the user logged is still there");
});

test("a failed History write commits nothing at all", async () => {
  __resetSessionLatches();
  const { kv, store, current } = make();
  await startSession(store, current());

  const realSet = kv.set.bind(kv);
  kv.set = async (key: string, value: string) => {
    if (key.includes(".workouts.")) throw new Error("disk full");
    return realSet(key, value);
  };

  const res = await commitFinishedWorkout(store, current(), guest, {
    workout: workout("w3"),
    previousHistory: [],
    nextPRs: { byExercise: { bench: { maxWeight: 60, maxVolume: 300 } }, longestSec: 1 },
  });

  kv.set = realSet;
  assert.deepEqual(res, { ok: false, reason: "history_write_failed" });
  assert.equal(kv.snapshot()[scopedKey(guest, "prs")], undefined, "PRs were never touched");
  assert.ok(await readActiveSession(store, guest));
});

test("an owner switch mid-finish cannot write into another owner's History", async () => {
  __resetSessionLatches();
  const { kv, store, current, setOwner } = make();
  const captured = current();
  await startSession(store, captured);
  setOwner(other);

  const res = await commitFinishedWorkout(store, captured, guest, {
    workout: workout("w4"),
    previousHistory: [],
    nextPRs: EMPTY_PRS,
  });

  assert.deepEqual(res, { ok: false, reason: "history_write_failed" });
  assert.equal(kv.snapshot()[scopedKey(other, "workouts")], undefined);
  assert.equal(kv.snapshot()[scopedKey(guest, "workouts")], undefined);
});
