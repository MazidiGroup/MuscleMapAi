// Legacy handling: unclaimed policy, lossless quarantine, adoption discipline.
import assert from "node:assert/strict";
import test from "node:test";

import { MemoryKV } from "../src/owner/kv";
import { readLegacy } from "../src/owner/legacySources";
import {
  LEGACY_CLAIM_POLICY,
  LEGACY_UNIT,
  adoptLegacy,
  metricsEligible,
  readQuarantine,
  readUnclaimedQuarantine,
  readUnclaimedReport,
  recalculatePRs,
  scanLegacy,
} from "../src/owner/migration";
import { Owner, UNCLAIMED_REPORT_KEY, migrationMarkerKey, scopedKey } from "../src/owner/scopeKeys";
import { OwnerToken, ScopedStore } from "../src/owner/scopedStore";

const guest: Owner = { kind: "guest", id: "g_test000001" };
const account: Owner = { kind: "account", id: "user_ffff6666" };
const APPROVAL = { humanApproved: true, approvedBy: "test:human" };

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
      {
        exerciseId: "barbell-bench-press",
        sets: [
          { id: "s2", weight: 120, reps: 3, done: true },
          { id: "s3", weight: 200, reps: 1, done: false },
        ],
        notes: "",
      },
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
    "anat.prs": doubleEncoded({
      byExercise: { "barbell-bench-press": { maxWeight: 120, maxVolume: 500 } },
      longestSec: 3600,
    }),
    "anat.restPref": singleEncoded(90),
    ...extra,
  });
}

function make(kv: MemoryKV, owner: Owner = guest) {
  let current: OwnerToken | null = { kind: owner.kind, id: owner.id, generation: 1 };
  const store = new ScopedStore(kv, () => current);
  return {
    store,
    deps: { kv, store, currentOwner: () => current },
    setOwner: (o: OwnerToken | null) => (current = o),
  };
}

test("both legacy encodings are handled explicitly", async () => {
  const kv = seed();
  const plan = await readLegacy<any>(kv, "plan");
  const workouts = await readLegacy<any>(kv, "workouts");
  assert.equal(plan.present && plan.ok && plan.encoding, "single");
  assert.equal(workouts.present && workouts.ok && workouts.encoding, "double");
  assert.deepEqual((workouts as any).value, WORKOUTS);
});

test("the claim policy is unclaimed_without_verified_owner", () => {
  assert.equal(LEGACY_CLAIM_POLICY, "unclaimed_without_verified_owner");
});

test("a scan claims nothing: no destination data, no marker, sources untouched", async () => {
  const kv = seed();
  const before = kv.snapshot();
  const { store } = make(kv);

  const report = await scanLegacy(kv);
  assert.equal(report.state, "UNCLAIMED_LEGACY");
  assert.deepEqual(report.markersWritten, []);
  assert.ok(report.domains.find((d) => d.domain === "workouts" && d.state === "UNCLAIMED_LEGACY"));
  assert.equal(report.domains.find((d) => d.domain === "workouts")!.records, 2);

  for (const owner of [guest, account]) {
    for (const domain of ["plan", "workouts", "prs", "restPref"] as const) {
      assert.equal(await kv.get(scopedKey(owner, domain)), null, `${domain} must stay unassigned`);
      assert.equal(await kv.get(migrationMarkerKey(owner, domain)), null, "no completion marker");
    }
  }
  assert.deepEqual(await store.read(guest, "workouts", []), []);
  for (const k of Object.keys(before)) assert.equal(kv.snapshot()[k], before[k], `${k} unchanged`);
});

test("guest creation and sign-in never claim ownerless legacy data", async () => {
  const kv = seed();
  const { store, setOwner } = make(kv);
  await scanLegacy(kv); // what launch does
  setOwner({ kind: "account", id: account.id, generation: 2 }); // sign-in
  await scanLegacy(kv); // launch/auth change again
  assert.deepEqual(await store.read(account, "plan", null), null);
  assert.deepEqual(await store.read(guest, "plan", null), null);
  assert.equal(await kv.get(migrationMarkerKey(account, "plan")), null);
});

test("unparsable ownerless sources are quarantined losslessly at device level", async () => {
  const kv = seed({ "mma.plan.v1": "{not json" });
  await scanLegacy(kv);
  const q = await readUnclaimedQuarantine(kv, "plan");
  assert.equal(q.length, 1);
  assert.equal(q[0].reason, "unparsable_source");
  assert.equal(q[0].payload, "{not json", "exact source text preserved");
  assert.equal(q[0].sourceKey, "mma.plan.v1");
  assert.ok(q[0].payloadHash.startsWith("fnv1a64:"));
  assert.equal(kv.snapshot()["mma.plan.v1"], "{not json", "source itself untouched");
  const report = await readUnclaimedReport(kv);
  assert.ok(report && report.policy === LEGACY_CLAIM_POLICY);
  assert.ok(await kv.get(UNCLAIMED_REPORT_KEY));
});

test("adoption without explicit human approval is refused", async () => {
  const kv = seed();
  const { store, deps } = make(kv);
  for (const bad of [undefined, {}, { humanApproved: false, approvedBy: "x" }, { humanApproved: true, approvedBy: "" }]) {
    const r = await adoptLegacy(guest, bad as any, deps);
    assert.equal(r.abortedReason, "approval_missing");
    assert.equal(r.state, "UNCLAIMED_LEGACY");
  }
  assert.deepEqual(await store.read(guest, "plan", null), null);
  assert.equal(await kv.get(migrationMarkerKey(guest, "plan")), null);
});

test("approved adoption copies, verifies, marks and leaves legacy untouched", async () => {
  const kv = seed();
  const before = kv.snapshot();
  const { store, deps } = make(kv);
  const report = await adoptLegacy(guest, APPROVAL, deps);
  assert.equal(report.state, "COMPLETE");
  assert.deepEqual(await store.read(guest, "plan", null), { days: [{ id: "d1" }] });
  assert.equal(await store.read(guest, "restPref", null), 90);
  assert.equal((await store.read<any[]>(guest, "workouts", [])).length, 2);
  for (const k of ["mma.plan.v1", "anat.workouts", "anat.prs", "anat.restPref"]) {
    assert.equal(kv.snapshot()[k], before[k], `${k} must be unchanged`);
  }
  const marker = JSON.parse((await kv.get(migrationMarkerKey(guest, "workouts")))!);
  assert.equal(marker.provenance.approvedBy, "test:human");
  assert.equal(marker.provenance.claimPolicy, LEGACY_CLAIM_POLICY);
});

test("adopted legacy weights keep the kg interpretation and exact values", async () => {
  const kv = seed();
  const { store, deps } = make(kv);
  await adoptLegacy(guest, APPROVAL, deps);
  const marker = JSON.parse((await kv.get(migrationMarkerKey(guest, "workouts")))!);
  assert.equal(marker.provenance.unitInterpretation, LEGACY_UNIT);
  assert.equal(marker.provenance.unitInterpretation, "kg");
  const w = await store.read<any[]>(guest, "workouts", []);
  assert.equal(w.find((x) => x.id === "w2").exercises[0].sets[0].weight, 120);
});

test("adoption is idempotent and never duplicates equivalent stable-ID records", async () => {
  const kv = seed();
  const { store, deps } = make(kv);
  await adoptLegacy(guest, APPROVAL, deps);
  const first = await store.read<any[]>(guest, "workouts", []);
  const second = await adoptLegacy(guest, APPROVAL, deps);
  assert.ok(second.alreadyComplete.includes("workouts"));
  assert.deepEqual(await store.read<any[]>(guest, "workouts", []), first);
});

test("a conflicting same-ID payload is quarantined losslessly with a destination reference", async () => {
  const kv = seed();
  const { store, deps } = make(kv);
  const destinationRecord = { id: "w1", date: 1, durationSec: 1, exercises: [] };
  await store.writeGuarded({ ...guest, generation: 1 }, "workouts", [destinationRecord]);

  const report = await adoptLegacy(guest, APPROVAL, deps);
  const q = await readQuarantine(kv, guest, "workouts");
  assert.equal(report.state, "QUARANTINED_CONFLICT");
  const rec = q.find((r) => r.recordId === "w1" && r.reason === "conflicting_payload")!;
  assert.ok(rec, "conflict recorded");
  assert.deepEqual(JSON.parse(rec.payload), WORKOUTS[0], "full conflicting payload preserved");
  assert.equal(rec.sourceKey, "anat.workouts");
  assert.equal(rec.sourceEncoding, "double");
  assert.equal(rec.sourceDomain, "workouts");
  assert.ok(rec.payloadHash.startsWith("fnv1a64:"));
  assert.ok(rec.destinationRef && rec.destinationRef.recordId === "w1");
  assert.equal(rec.destinationRef!.key, store.keyFor(guest, "workouts"));
  assert.ok(rec.detectedAt > 0 && rec.migrationVersion === 1);

  const dest = await store.read<any[]>(guest, "workouts", []);
  assert.equal(dest.filter((w) => w.id === "w1").length, 1, "no duplicate w1");
  assert.equal(dest.find((w) => w.id === "w1").durationSec, 1, "destination payload preserved");
});

test("malformed record IDs are quarantined with their full payload", async () => {
  const kv = seed({ "anat.workouts": doubleEncoded([{ date: 1, exercises: [] }, ...WORKOUTS]) });
  const { store, deps } = make(kv);
  await adoptLegacy(guest, APPROVAL, deps);
  const q = await readQuarantine(kv, guest, "workouts");
  const rec = q.find((r) => r.reason === "malformed_id")!;
  assert.ok(rec);
  assert.deepEqual(JSON.parse(rec.payload), { date: 1, exercises: [] });
  assert.equal((await store.read<any[]>(guest, "workouts", [])).length, 2);
});

test("an owner change aborts adoption before any marker is written", async () => {
  const kv = seed();
  const { deps, setOwner } = make(kv);
  setOwner({ kind: "guest", id: "g_other00001", generation: 2 });
  const report = await adoptLegacy(guest, APPROVAL, deps);
  assert.equal(report.abortedReason, "owner_changed");
  assert.equal(await kv.get(migrationMarkerKey(guest, "plan")), null);
  assert.equal(await kv.get(scopedKey(guest, "plan")), null);
});

test("an interrupted adoption resumes and only then writes the marker", async () => {
  const kv = seed();
  const { store, deps } = make(kv);
  await store.writeGuarded({ ...guest, generation: 1 }, "plan", { days: [{ id: "d1" }] });
  assert.equal(await kv.get(migrationMarkerKey(guest, "plan")), null);
  await adoptLegacy(guest, APPROVAL, deps);
  assert.ok(await kv.get(migrationMarkerKey(guest, "plan")), "marker written after verification");
});

test("PRs come from the verified workout containing the heaviest completed set", () => {
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
  await adoptLegacy(guest, APPROVAL, deps);
  const q = await readQuarantine(kv, guest, "prs");
  const rec = q.find((r) => r.recordId === "ghost-exercise" && r.reason === "unverifiable_pr")!;
  assert.ok(rec);
  assert.deepEqual(JSON.parse(rec.payload), { maxWeight: 999, maxVolume: 1 });
});

test("quarantined records are excluded from metrics", () => {
  const records = [{ id: "w1" }, { id: "w2" }, { id: "w3" }];
  const eligible = metricsEligible(records, [
    {
      sourceKey: "anat.workouts",
      sourceDomain: "workouts",
      sourceEncoding: "double",
      recordId: "w2",
      payload: "{}",
      payloadHash: "fnv1a64:0",
      reason: "conflicting_payload",
      migrationVersion: 1,
      detectedAt: 0,
      destinationRef: null,
    },
  ]);
  assert.deepEqual(eligible.map((r) => r.id), ["w1", "w3"]);
});
