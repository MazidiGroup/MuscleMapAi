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

let gen = 0;
const tok = (o: Owner) => ({ kind: o.kind, id: o.id, generation: ++gen });

function make(initial: Owner = guest) {
  let current: any = tok(initial);
  const kv = new MemoryKV();
  return {
    kv,
    store: new ScopedStore(kv, () => current),
    current: () => current,
    setOwner: (o: Owner) => (current = tok(o)),
  };
}

test("only one active session can exist per owner", async () => {
  __resetSessionLatches();
  const { store, current } = make();
  const a = await startSession(store, current());
  const b = await startSession(store, current());
  assert.ok(a);
  assert.equal(a!.sessionId, b!.sessionId, "a second start resumes, never duplicates");
});

test("concurrent starts cannot create two sessions", async () => {
  __resetSessionLatches();
  const { store, current } = make();
  const [a, b, c] = await Promise.all([startSession(store, current()), startSession(store, current()), startSession(store, current())]);
  assert.equal(a!.sessionId, b!.sessionId);
  assert.equal(b!.sessionId, c!.sessionId);
});

test("an active session survives relaunch", async () => {
  __resetSessionLatches();
  const { kv, store, current } = make();
  const started = await startSession(store, current());
  // relaunch: fresh store object over the same persisted device storage
  const restored = await readActiveSession(new ScopedStore(kv, () => current()), guest);
  assert.equal(restored!.sessionId, started!.sessionId);
});

test("each owner only sees their own active session", async () => {
  __resetSessionLatches();
  const { store, setOwner, current } = make();
  const g = await startSession(store, current());
  setOwner(account);
  assert.equal(await readActiveSession(store, account), null);
  const a = await startSession(store, current());
  assert.notEqual(a!.sessionId, g!.sessionId);
  setOwner(guest);
  assert.equal((await readActiveSession(store, guest))!.sessionId, g!.sessionId);
});

test("an owner switch during a mutation cannot write to another owner", async () => {
  __resetSessionLatches();
  const { store, setOwner, current } = make();
  const captured = current();
  await startSession(store, captured);
  setOwner(account); // owner changed after the mutation was captured
  const res = await mutateSession(store, captured, (s) => withExercise(s, "barbell-bench-press", "anatomy"));
  assert.deepEqual(res, { ok: false, reason: "owner_changed" });
  setOwner(guest);
  assert.deepEqual((await readActiveSession(store, guest))!.exercises, []);
});

test("exercise IDs are preserved exactly with their source ID space", async () => {
  __resetSessionLatches();
  const { store, current } = make();
  await startSession(store, current());
  await mutateSession(store, current(), (s) => withExercise(s, "barbell-bench-press", "anatomy"));
  await mutateSession(store, current(), (s) => withExercise(s, "barbell-bench-press", "plan"));
  await mutateSession(store, current(), (s) => withExercise(s, "barbell-bench-press", "anatomy")); // duplicate
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
  const { store, setOwner, current } = make();
  await startSession(store, current());
  setOwner(account);
  await startSession(store, current());
  await endSession(store, account);
  assert.equal(await readActiveSession(store, account), null);
  setOwner(guest);
  assert.ok(await readActiveSession(store, guest));
});

// --- the card stack can never index past the session -------------------------
//
// The white-screen crash: start a workout, back out without finishing, open a
// different day from Today and tap "Continue workout". The Workout tab is frozen
// behind the other tab (freezeOnBlur), so its exercise index still points into
// the workout it last showed; the stack rendered `items[undefined]` for a
// shorter session and the whole tree came down. The index is now clamped at
// the point of use (both in the tab and inside the stack) and the stack is
// remounted per session id. These assertions pin the shape of that guard.
test("the exercise stack clamps its index in-render and skips missing items", () => {
  const fs = require("node:fs") as typeof import("node:fs");
  const path = require("node:path") as typeof import("node:path");
  const root = process.env.MMA_TEST_ROOT as string;
  const stack = fs.readFileSync(path.join(root, "src/anatomy/ExerciseStack.tsx"), "utf8");
  assert.match(stack, /const safeIndex = total > 0 \? Math\.min\(Math\.max\(0, index\), total - 1\) : 0;/, "clamped before any use");
  assert.match(stack, /const item = items\[i\];\s*if \(!item\) return null;/, "a missing item renders nothing, never a crash");
  assert.ok(!/Math\.abs\(i - index\)/.test(stack), "no neighbourhood arithmetic on the raw index");

  const tab = fs.readFileSync(path.join(root, "app/(tabs)/workout.tsx"), "utf8");
  assert.match(tab, /const safeCurrent = sessionLength > 0 \? Math\.min\(Math\.max\(0, current\), sessionLength - 1\) : 0;/);
  assert.match(tab, /index=\{safeCurrent\}/, "the stack is driven by the clamped index");
  assert.match(tab, /key=\{w\.sessionId \?\? "session"\}/, "a new workout remounts the stack");
  assert.ok(!/w\.session\[Math\.min\(current/.test(tab), "the front card is read through the clamp");
});
