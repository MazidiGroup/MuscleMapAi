// Integration tests against the PRODUCTION data-access adapters:
//   - src/plan/planStore.ts        (live Plan store + its scope binding)
//   - src/anatomy/workoutScope.ts  (the persistence layer WorkoutProvider calls)
//   - src/units/unitPreference.ts  (the one stored unit preference)
import assert from "node:assert/strict";
import test from "node:test";

import { MemoryKV } from "../src/owner/kv";
import { migrationMarkerKey, scopedKey } from "../src/owner/scopeKeys";
import { OwnerToken, ScopedStore } from "../src/owner/scopedStore";
import { scanLegacy } from "../src/owner/migration";
import { setPlanScope, usePlanStore } from "../src/plan/planStore";
import {
  EMPTY_PRS,
  buildActiveSession,
  clearActiveSession,
  hydrateWorkoutScope,
  persistActiveSession,
  persistHistory,
  persistPRs,
  persistRestPref,
} from "../src/anatomy/workoutScope";
import { resolveUnitPreference, setUnitPreference } from "../src/units/unitPreference";

const ANSWERS = { goal: "muscle", exp: "beginner", days: [0, 2, 4], equip: ["gym"], focus: [], posture: false } as any;

let gen = 0;
const tok = (kind: "account" | "guest", id: string): OwnerToken => ({ kind, id, generation: ++gen });
const ownerOf = (t: OwnerToken) => ({ kind: t.kind, id: t.id });

function harness() {
  const kv = new MemoryKV();
  let current: OwnerToken | null = null;
  const store = new ScopedStore(kv, () => current);
  const switchTo = async (t: OwnerToken | null) => {
    current = t;
    setPlanScope(t ? { store, token: t } : null);
    usePlanStore.getState().resetForOwner();
    if (t) await usePlanStore.getState().hydrate();
  };
  /** Makes `t` the live owner without touching the Plan store. */
  const use = (t: OwnerToken | null) => (current = t);
  return { kv, store, switchTo, use, current: () => current };
}

const WORKOUT = {
  id: "w-live-1",
  date: 1700000000000,
  durationSec: 1200,
  exercises: [{ exerciseId: "barbell-bench-press", sets: [{ id: "s1", weight: 80, reps: 5, done: true }], notes: "" }],
};

// ---------------------------------------------------------------- Plan adapter

test("the live Plan store writes only owner-scoped keys, never a legacy key", async () => {
  const h = harness();
  const guest = tok("guest", "g_live0001");
  await h.switchTo(guest);

  usePlanStore.getState().setStep(2);
  usePlanStore.getState().setAnswers({ goal: "muscle" });
  usePlanStore.getState().rebuildFromAnswers(ANSWERS);
  usePlanStore.getState().toggleCompletion("2026-01-02", "barbell-bench-press", true);
  await new Promise((r) => setTimeout(r, 10));

  const keys = Object.keys(h.kv.snapshot());
  assert.ok(keys.length > 0);
  for (const k of keys) assert.match(k, /^mma\.own\.v1\./, `unexpected key written: ${k}`);
  assert.ok(keys.includes(scopedKey(ownerOf(guest), "plan")));
  assert.ok(keys.includes(scopedKey(ownerOf(guest), "planCompletions")));
});

test("Plan data written as guest is invisible to account A and vice versa", async () => {
  const h = harness();
  const guest = tok("guest", "g_live0002");
  const accountA = tok("account", "user_A_live");
  const accountB = tok("account", "user_B_live");

  await h.switchTo(guest);
  usePlanStore.getState().rebuildFromAnswers(ANSWERS);
  usePlanStore.getState().toggleCompletion("2026-01-02", "guest-only", true);
  await new Promise((r) => setTimeout(r, 10));
  const guestPlan = usePlanStore.getState().plan;
  assert.ok(guestPlan);

  await h.switchTo(accountA); // sign-in: nothing is transferred
  assert.equal(usePlanStore.getState().plan, null);
  assert.deepEqual(usePlanStore.getState().completions, {});
  assert.equal(usePlanStore.getState().step, 0);
  usePlanStore.getState().rebuildFromAnswers({ ...ANSWERS, days: [1, 3] });
  usePlanStore.getState().toggleCompletion("2026-01-02", "account-a-only", true);
  await new Promise((r) => setTimeout(r, 10));

  await h.switchTo(accountB); // account switch: no A data
  assert.equal(usePlanStore.getState().plan, null);
  assert.deepEqual(usePlanStore.getState().completions, {});

  await h.switchTo(guest); // sign-out: the guest Plan comes back untouched
  assert.deepEqual(usePlanStore.getState().completions, { "2026-01-02:guest-only": true });
  assert.deepEqual(usePlanStore.getState().plan, JSON.parse(JSON.stringify(guestPlan)));
});

test("an unresolved owner exposes no Plan data and writes nothing", async () => {
  const h = harness();
  await h.switchTo(null);
  await usePlanStore.getState().hydrate();
  assert.equal(usePlanStore.getState().plan, null);
  assert.equal(usePlanStore.getState().hydrated, false, "no read before owner resolution");
  usePlanStore.getState().setStep(3);
  usePlanStore.getState().rebuildFromAnswers(ANSWERS);
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(h.kv.snapshot(), {}, "no scoped or legacy write without an owner");
});

test("the live Plan store never exposes ownerless legacy records", async () => {
  const h = harness();
  h.kv.set("mma.plan.v1", JSON.stringify({ days: [{ id: "legacy-day" }] }));
  h.kv.set("mma.plan.completions.v1", JSON.stringify({ "2020-01-01:legacy": true }));
  await scanLegacy(h.kv);
  const guest = tok("guest", "g_live0003");
  await h.switchTo(guest);
  assert.equal(usePlanStore.getState().plan, null, "legacy plan is unclaimed, not shown");
  assert.deepEqual(usePlanStore.getState().completions, {});
  assert.equal(await h.kv.get(migrationMarkerKey(ownerOf(guest), "plan")), null);
  assert.equal(h.kv.snapshot()["mma.plan.v1"], JSON.stringify({ days: [{ id: "legacy-day" }] }));
});

test("an owner change during Plan hydration cannot publish stale data", async () => {
  const h = harness();
  const first = tok("guest", "g_slow0001");
  const second = tok("account", "user_fast001");
  const store = h.store;
  await store.writeGuarded(first, "plan", { days: [{ id: "stale" }] });

  // bind the first owner, start hydration, then switch before it resolves
  setPlanScope({ store, token: first });
  usePlanStore.getState().resetForOwner();
  const pending = usePlanStore.getState().hydrate();
  setPlanScope({ store, token: second });
  await pending;
  assert.equal(usePlanStore.getState().plan, null, "late resolution for the old owner is dropped");
});

test("an owner change during a Plan mutation does not delete the existing value", async () => {
  const h = harness();
  const guest = tok("guest", "g_live0004");
  await h.switchTo(guest);
  usePlanStore.getState().rebuildFromAnswers(ANSWERS);
  await new Promise((r) => setTimeout(r, 10));
  const canonical = await h.store.read(ownerOf(guest), "plan", null);
  assert.ok(canonical);

  // mutate, but the scope switches to another owner before the write lands
  usePlanStore.getState().setStep(4);
  setPlanScope({ store: h.store, token: tok("account", "user_switch01") });
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(await h.store.read(ownerOf(guest), "plan", null), canonical, "canonical Plan untouched");
});

// ------------------------------------------------------------- Workout adapter

test("the live Workout adapter is owner-isolated for history, PRs, rest and units", async () => {
  const h = harness();
  const guest = tok("guest", "g_wk00001");
  const accountA = tok("account", "user_wkA");
  const accountB = tok("account", "user_wkB");

  h.use(guest);
  await persistHistory(h.store, guest, [WORKOUT]);
  await persistPRs(h.store, guest, { byExercise: { "barbell-bench-press": { maxWeight: 80, maxVolume: 400 } }, longestSec: 1200 });
  await persistRestPref(h.store, guest, 120);
  await setUnitPreference(h.store, guest, "kg");

  h.use(accountA);
  await persistHistory(h.store, accountA, [{ ...WORKOUT, id: "w-A" }]);
  await setUnitPreference(h.store, accountA, "lb");

  const g = await hydrateWorkoutScope(h.store, ownerOf(guest));
  const a = await hydrateWorkoutScope(h.store, ownerOf(accountA));
  const b = await hydrateWorkoutScope(h.store, ownerOf(accountB));

  assert.deepEqual(g.history.map((w) => w.id), ["w-live-1"]);
  assert.equal(g.restPref, 120);
  assert.equal(g.unit, "kg");
  assert.deepEqual(a.history.map((w) => w.id), ["w-A"]);
  assert.equal(a.unit, "lb");
  assert.equal(a.restPref, 60, "defaults, not the guest's value");
  assert.deepEqual(b.history, [], "account B sees nothing from A or the guest");
  assert.deepEqual(b.prs, EMPTY_PRS);

  for (const k of Object.keys(h.kv.snapshot())) assert.match(k, /^mma\.own\.v1\./);
});

test("an unresolved owner returns no Workout data", async () => {
  const h = harness();
  const snap = await hydrateWorkoutScope(h.store, null);
  assert.deepEqual(snap.history, []);
  assert.deepEqual(snap.prs, EMPTY_PRS);
  assert.equal(snap.active, null);
  assert.equal(snap.unit, "kg");
  const res = await persistHistory(h.store, null, [WORKOUT]);
  assert.deepEqual(res, { ok: false, reason: "unresolved_owner" });
  assert.deepEqual(h.kv.snapshot(), {});
});

test("the live Workout adapter never exposes ownerless legacy history", async () => {
  const h = harness();
  h.kv.set("anat.workouts", JSON.stringify(JSON.stringify([{ id: "legacy-w", date: 1, exercises: [] }])));
  h.kv.set("anat.restPref", JSON.stringify(999));
  await scanLegacy(h.kv);
  const guest = tok("guest", "g_wk00002");
  const snap = await hydrateWorkoutScope(h.store, ownerOf(guest));
  assert.deepEqual(snap.history, []);
  assert.equal(snap.restPref, 60);
  assert.equal(h.kv.snapshot()["anat.restPref"], JSON.stringify(999), "legacy source untouched");
});

test("the persisted active session is owner-scoped, unique and keeps exact ids", async () => {
  const h = harness();
  const guest = tok("guest", "g_wk00003");
  const accountA = tok("account", "user_wkC");

  h.use(guest);
  const s1 = buildActiveSession(guest, "s_fixed_1", 1700000000000, [
    { exerciseId: "barbell-bench-press", sets: [], notes: "" },
  ]);
  await persistActiveSession(h.store, guest, s1);
  const s2 = buildActiveSession(guest, "s_fixed_1", 1700000000000, [
    { exerciseId: "barbell-bench-press", sets: [{ id: "x", weight: 60, reps: 8, done: true }], notes: "" },
  ]);
  await persistActiveSession(h.store, guest, s2); // same session id, updated content

  const g = await hydrateWorkoutScope(h.store, ownerOf(guest));
  assert.equal(g.active!.sessionId, "s_fixed_1", "one active session per owner");
  assert.equal(g.active!.exercises[0].exerciseId, "barbell-bench-press");
  assert.equal(g.active!.exercises[0].idSpace, "anatomy");
  assert.equal(g.active!.exercises[0].sets.length, 1);

  const a = await hydrateWorkoutScope(h.store, ownerOf(accountA));
  assert.equal(a.active, null, "another owner sees no session");

  await clearActiveSession(h.store, ownerOf(guest));
  assert.equal((await hydrateWorkoutScope(h.store, ownerOf(guest))).active, null);
  assert.deepEqual((await hydrateWorkoutScope(h.store, ownerOf(guest))).history, [], "only the session was cleared");
});

test("an owner change during a Workout mutation keeps the canonical history", async () => {
  const h = harness();
  const guest = tok("guest", "g_wk00004");
  h.use(guest);
  await persistHistory(h.store, guest, [WORKOUT]);
  const stale = guest;
  // the resolver has since moved on
  const res = await persistHistory(h.store, { ...stale, generation: stale.generation + 99 }, []);
  assert.equal(res.ok, false);
  assert.deepEqual((await hydrateWorkoutScope(h.store, ownerOf(guest))).history.map((w) => w.id), ["w-live-1"]);
});

test("Workout and History resolve the same stored unit preference", async () => {
  const h = harness();
  const guest = tok("guest", "g_wk00005");
  h.use(guest);
  await setUnitPreference(h.store, guest, "lb");
  const workoutView = await hydrateWorkoutScope(h.store, ownerOf(guest));
  const historyView = await resolveUnitPreference(h.store, ownerOf(guest), "en-GB");
  assert.equal(workoutView.unit, "lb");
  assert.equal(historyView.unit, "lb");
  assert.equal(historyView.source, "stored");
});
