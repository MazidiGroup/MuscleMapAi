// Legacy migration: encodings, collisions, quarantine, markers, idempotence.
import assert from "node:assert/strict";
import test from "node:test";

import { MemoryKV } from "../src/owner/kv";
import { readLegacy } from "../src/owner/legacySources";
import { LEGACY_UNIT, metricsEligible, readQuarantine, recalculatePRs, runMigration } from "../src/owner/migration";
import { Owner, migrationMarkerKey, scopedKey } from "../src/owner/scopeKeys";
import { ScopedStore } from "../src/owner/scopedStore";

const guest: Owner = { kind: "guest", id: "g_test000001" };

// Encoding helpers that reproduce exactly how the app wrote each family of keys.
const singleEncoded = (v: unknown) => JSON.stringify(v);
const doubleEncoded = (v: unknown) => JSON.stringify(JSON.stringify(v));

const WORKOUTS = [
  {
    id: "w1",
    date: 1700000000000,
    durationSec: 3600,
    exercises: [
      { exerciseId: "barbell-bench-press", sets: [{ id: "s1", weight: 100, reps: 5, done: true }], notes: "" },
    ],
  },
  {
    id: "w2",
    date: 1700600000000,
    durationSec: 1800,
    exercises: [
      { exerciseId: "barbell-bench-press", sets: [{ id: "s2", weight: 120, reps: 3, done: true }, { id: "s3", weight: 200, reps: 1, done: false }], notes: "" },
    ],
  },
];

function seed(extra: Record<string, string> = {}) {
  return new MemoryKV({
    "mma.plan.v1": singleEncoded({ days: [{ id: "d1" }] }),
    "mma.plan.answers.v1": singleEncoded({ goal: "muscle" }),
    "mma.plan.seed.v1": singleEncoded(42),
    "mma.plan.onboardingStep.v1": singleEncoded(100),
    "mma.plan.completions.v1": singleEncoded({ "2026-01-01:x": true }),
    "anat.workouts": doubleEncoded(WORKOUTS),
    "anat.prs": doubleEncoded({ byExercise: { "barbell-bench-press": { maxWeight: 120, maxVolume: 500 } }, longestSec: 3600 }),
    "anat.restPref": singleEncoded(90),
    ...extra,
  });
}

function make(kv: MemoryKV, owner: Owner = guest) {
  let current: Owner | null = owner;
  const store = new ScopedStore(kv, () => current);
  return { store, deps: { kv, store, currentOwner: () => current }, setOwner: (o: Owner | null) => (current = o) };
}

test("both legacy encodings are handled explicitly", async () => {
  const kv = seed();
  const plan = await readLegacy<any>(kv, "plan");
  const workouts = await readLegacy<any>(kv, "workouts");
  assert.equal(plan.present && plan.ok && plan.encoding, "single");
  assert.equal(workouts.present && workouts.ok && workouts.encoding, "double");
  assert.deepEqual((workouts as any).value, WORKOUTS);
});

test("migration completes, verifies, writes markers and leaves legacy untouched", async () => {
  const kv = seed();
  const before = kv.snapshot();
  const { store, deps } = make(kv);

  const report = await runMigration(guest, deps);
  assert.equal(report.state, "COMPLETE");
  assert.deepEqual(await store.read(guest, "plan", null), { days: [{ id: "d1" }] });
  assert.equal(await store.read(guest, "restPref", null), 90);
  assert.equal((await store.read<any[]>(guest, "workouts", [])).length, 2);

  for (const k of ["mma.plan.v1", "anat.workouts", "anat.prs", "anat.restPref"]) {
    assert.equal(kv.snapshot()[k], before[k], `${k} must be unchanged`);
  }
  assert.ok(await kv.get(migrationMarkerKey(guest, "workouts")));
});

test("legacy weights keep the kg interpretation in destination provenance", async () => {
  const kv = seed();
  const { deps } = make(kv);
  await runMigration(guest, deps);
  const marker = JSON.parse((await kv.get(migrationMarkerKey(guest, "workouts")))!);
  assert.equal(marker.provenance.unitInterpretation, LEGACY_UNIT);
  assert.equal(marker.provenance.unitInterpretation, "kg");
  // values themselves are never re-computed
  const w = await deps.store.read<any[]>(guest, "workouts", []);
  assert.equal(w.find((x) => x.id === "w2").exercises[0].sets[0].weight, 120);
});

test("migration is idempotent and never duplicates equivalent stable-ID records", async () => {
  const kv = seed();
  const { store, deps } = make(kv);
  await runMigration(guest, deps);
  const first = await store.read<any[]>(guest, "workouts", []);
  const second = await runMigration(guest, deps);
  assert.ok(second.alreadyComplete.includes("workouts"));
  assert.deepEqual(await store.read<any[]>(guest, "workouts", []), first);
});

test("a conflicting same-ID payload is quarantined, not merged", async () => {
  const kv = seed();
  const { store, deps } = make(kv);
  // destination already holds a different payload for w1
  await store.write(guest, "workouts", [{ id: "w1", date: 1, durationSec: 1, exercises: [] }]);
  const report = await runMigration(guest, deps);
  const q = await readQuarantine(kv, guest, "workouts");
  assert.equal(report.state, "QUARANTINED_CONFLICT");
  assert.ok(q.some((r) => r.recordId === "w1" && r.reason === "conflicting_payload"));
  const dest = await store.read<any[]>(guest, "workouts", []);
  assert.equal(dest.filter((w) => w.id === "w1").length, 1, "no duplicate w1");
  assert.equal(dest.find((w) => w.id === "w1").durationSec, 1, "destination payload preserved");
});

test("malformed record IDs are quarantined and never invented", async () => {
  const kv = seed({ "anat.workouts": doubleEncoded([{ date: 1, exercises: [] }, ...WORKOUTS]) });
  const { store, deps } = make(kv);
  const report = await runMigration(guest, deps);
  const q = await readQuarantine(kv, guest, "workouts");
  assert.ok(q.some((r) => r.reason === "malformed_id" && r.recordId === null));
  assert.equal(report.state, "QUARANTINED_CONFLICT");
  const dest = await store.read<any[]>(guest, "workouts", []);
  assert.equal(dest.length, 2, "only records with stable IDs are adopted");
});

test("unparsable source is quarantined and the domain is not marked complete", async () => {
  const kv = seed({ "mma.plan.v1": "{not json" });
  const { deps } = make(kv);
  await runMigration(guest, deps);
  assert.equal(await kv.get(migrationMarkerKey(guest, "plan")), null);
  const q = await readQuarantine(kv, guest, "plan");
  assert.ok(q.some((r) => r.reason === "unparsable_source"));
  assert.equal(kv.snapshot()["mma.plan.v1"], "{not json", "source preserved verbatim");
});

test("an owner change aborts before any marker is written", async () => {
  const kv = seed();
  const { deps, setOwner } = make(kv);
  setOwner({ kind: "guest", id: "g_other00001" });
  const report = await runMigration(guest, deps);
  assert.equal(report.abortedReason, "owner_changed");
  assert.equal(await kv.get(migrationMarkerKey(guest, "plan")), null);
  assert.equal(await kv.get(scopedKey(guest, "plan")), null);
});

test("an interrupted run resumes and only then writes the marker", async () => {
  const kv = seed();
  const { store, deps } = make(kv);
  // simulate interruption after the destination write but before verification
  await store.write(guest, "plan", { days: [{ id: "d1" }] });
  assert.equal(await kv.get(migrationMarkerKey(guest, "plan")), null);
  const report = await runMigration(guest, deps);
  assert.ok(await kv.get(migrationMarkerKey(guest, "plan")), "marker written after verification");
  assert.notEqual(report.state, "NOT_STARTED");
});

test("an account owner never claims unverifiable global legacy data", async () => {
  const kv = seed();
  const account: Owner = { kind: "account", id: "user_ffff6666" };
  const { store, deps } = make(kv, account);
  const report = await runMigration(account, deps);
  assert.equal(report.state, "OWNER_UNRESOLVED");
  assert.equal(report.abortedReason, "not_guest_scope");
  assert.deepEqual(await store.read(account, "workouts", []), []);
  assert.equal(await kv.get(migrationMarkerKey(account, "workouts")), null);
});

test("PRs come from the verified workout containing the heaviest completed set", async () => {
  const prs = recalculatePRs(WORKOUTS);
  const pr = prs.byExercise["barbell-bench-press"];
  assert.equal(pr.maxWeight, 120, "incomplete 200 kg set is excluded");
  assert.equal(pr.achievedAt, 1700600000000);
  assert.equal(pr.workoutId, "w2");
  assert.equal(pr.unit, "kg");
});

test("a legacy PR with no verifiable workout stays unresolved", async () => {
  const kv = seed({
    "anat.prs": doubleEncoded({ byExercise: { "ghost-exercise": { maxWeight: 999, maxVolume: 1 } }, longestSec: 0 }),
  });
  const { deps } = make(kv);
  await runMigration(guest, deps);
  const q = await readQuarantine(kv, guest, "prs");
  assert.ok(q.some((r) => r.recordId === "ghost-exercise" && r.reason === "unverifiable_pr"));
});

test("quarantined records are excluded from metrics", () => {
  const records = [{ id: "w1" }, { id: "w2" }, { id: "w3" }];
  const eligible = metricsEligible(records, [
    { domain: "workouts", reason: "conflicting_payload", recordId: "w2", rawExcerptLength: 0, at: 0 },
  ]);
  assert.deepEqual(eligible.map((r) => r.id), ["w1", "w3"]);
});
