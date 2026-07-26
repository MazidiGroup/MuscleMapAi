// Persisted active session: uniqueness, relaunch, owner isolation, exact IDs.
import assert from "node:assert/strict";
import test from "node:test";

import { MemoryKV } from "../src/owner/kv";
import { Owner } from "../src/owner/scopeKeys";
import { ScopedStore } from "../src/owner/scopedStore";
import {
  __resetSessionLatches,
  endSession,
  mutateSession,
  readActiveSession,
  startSession,
  withExercise,
} from "../src/session/activeSession";

const guest: Owner = { kind: "guest", id: "g_sess000001" };
const account: Owner = { kind: "account", id: "user_sess0001" };

function make(initial: Owner | null = guest) {
  let current: Owner | null = initial;
  const kv = new MemoryKV();
  return { kv, store: new ScopedStore(kv, () => current), setOwner: (o: Owner | null) => (current = o) };
}

test("only one active session can exist per owner", async () => {
  __resetSessionLatches();
  const { store } = make();
  const a = await startSession(store, guest);
  const b = await startSession(store, guest);
  assert.ok(a);
  assert.equal(a!.sessionId, b!.sessionId, "a second start resumes, never duplicates");
});

test("concurrent starts cannot create two sessions", async () => {
  __resetSessionLatches();
  const { store } = make();
  const [a, b, c] = await Promise.all([startSession(store, guest), startSession(store, guest), startSession(store, guest)]);
  assert.equal(a!.sessionId, b!.sessionId);
  assert.equal(b!.sessionId, c!.sessionId);
});

test("an active session survives relaunch", async () => {
  __resetSessionLatches();
  const { kv, store } = make();
  const started = await startSession(store, guest);
  // relaunch: fresh store object over the same persisted device storage
  const restored = await readActiveSession(new ScopedStore(kv, () => guest), guest);
  assert.equal(restored!.sessionId, started!.sessionId);
});

test("each owner only sees their own active session", async () => {
  __resetSessionLatches();
  const { store, setOwner } = make();
  const g = await startSession(store, guest);
  setOwner(account);
  assert.equal(await readActiveSession(store, account), null);
  const a = await startSession(store, account);
  assert.notEqual(a!.sessionId, g!.sessionId);
  setOwner(guest);
  assert.equal((await readActiveSession(store, guest))!.sessionId, g!.sessionId);
});

test("an owner switch during a mutation cannot write to another owner", async () => {
  __resetSessionLatches();
  const { store, setOwner } = make();
  await startSession(store, guest);
  setOwner(account); // owner changed after the mutation was captured
  const res = await mutateSession(store, guest, (s) => withExercise(s, "barbell-bench-press", "anatomy"));
  assert.deepEqual(res, { ok: false, reason: "owner_changed" });
  setOwner(guest);
  assert.deepEqual((await readActiveSession(store, guest))!.exercises, []);
});

test("exercise IDs are preserved exactly with their source ID space", async () => {
  __resetSessionLatches();
  const { store } = make();
  await startSession(store, guest);
  await mutateSession(store, guest, (s) => withExercise(s, "barbell-bench-press", "anatomy"));
  await mutateSession(store, guest, (s) => withExercise(s, "barbell-bench-press", "plan"));
  await mutateSession(store, guest, (s) => withExercise(s, "barbell-bench-press", "anatomy")); // duplicate
  const s = await readActiveSession(store, guest);
  assert.deepEqual(
    s!.exercises.map((e) => [e.exerciseId, e.idSpace]),
    [
      ["barbell-bench-press", "anatomy"],
      ["barbell-bench-press", "plan"],
    ],
    "no merge, no rename, no duplicate within an ID space",
  );
});

test("ending a session clears only that owner's session", async () => {
  __resetSessionLatches();
  const { store, setOwner } = make();
  await startSession(store, guest);
  setOwner(account);
  await startSession(store, account);
  await endSession(store, account);
  assert.equal(await readActiveSession(store, account), null);
  setOwner(guest);
  assert.ok(await readActiveSession(store, guest));
});
