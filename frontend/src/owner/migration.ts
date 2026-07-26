// Legacy → owner-scoped migration.
//
// State machine (frozen manifest §9.1):
//   NOT_STARTED → OWNER_UNRESOLVED | SOURCE_SNAPSHOT → DESTINATION_PREPARED
//   → COPY_IN_PROGRESS → VERIFYING → COMPLETE | PARTIAL | QUARANTINED_CONFLICT
//
// Guarantees implemented here:
//  - legacy sources are read-only and never mutated or deleted;
//  - copy → verify → marker journalling (marker only after verification);
//  - idempotent and retry-safe; equivalent stable-ID payloads never duplicate;
//  - conflicting same-ID payloads and malformed IDs are quarantined, not merged;
//  - an owner change aborts before any marker is written;
//  - unresolved/quarantined records are excluded from metrics;
//  - legacy unlabelled weights are preserved as kg and that interpretation is
//    recorded in the destination provenance (never numerically reinterpreted).
//
// Claim policy: global legacy data has no verifiable owner. It is therefore
// only ever adopted by the stable DEVICE GUEST scope. Signing in never claims
// it (manifest §9.2 rule 7).

import { KV } from "./kv";
import { LEGACY_SOURCES, LegacyDomain, LegacyRead, snapshotLegacy } from "./legacySources";
import { Domain, MIGRATION_VERSION, Owner, migrationMarkerKey, quarantineKey } from "./scopeKeys";
import { OwnerToken, ScopedStore, sameOwner } from "./scopedStore";

export type MigrationState =
  | "NOT_STARTED"
  | "OWNER_UNRESOLVED"
  | "SOURCE_SNAPSHOT"
  | "DESTINATION_PREPARED"
  | "COPY_IN_PROGRESS"
  | "VERIFYING"
  | "COMPLETE"
  | "PARTIAL"
  | "QUARANTINED_CONFLICT";

export const LEGACY_CLAIM_POLICY = "device_guest_only" as const;

/** Unit interpretation for every legacy weight value. Never re-computed. */
export const LEGACY_UNIT: "kg" = "kg";

export type Provenance = {
  source: string;
  encoding: "single" | "double";
  migrationVersion: number;
  claimPolicy: typeof LEGACY_CLAIM_POLICY;
  /** Only set for domains that carry weights. */
  unitInterpretation?: typeof LEGACY_UNIT;
  verifiedAt: number;
};

export type QuarantineRecord = {
  domain: LegacyDomain;
  reason: "conflicting_payload" | "malformed_id" | "unparsable_source" | "untrusted_duplicate" | "unverifiable_pr";
  recordId: string | null;
  rawExcerptLength: number;
  at: number;
};

export type MigrationReport = {
  state: MigrationState;
  owner: OwnerToken | null;
  domains: Partial<Record<Domain, { state: MigrationState; copied: number; skipped: number; quarantined: number }>>;
  quarantined: QuarantineRecord[];
  /** Domains that already had a verified marker on this run. */
  alreadyComplete: Domain[];
  abortedReason?: "owner_changed" | "owner_unresolved" | "not_guest_scope";
};

type LegacyWorkout = { id?: unknown; date?: unknown; durationSec?: unknown; exercises?: unknown };

const SCALAR_MAP: [LegacyDomain, Domain][] = [
  ["plan", "plan"],
  ["planAnswers", "planAnswers"],
  ["planSeed", "planSeed"],
  ["onboardingStep", "onboardingStep"],
  ["planCompletions", "planCompletions"],
  ["restPref", "restPref"],
];

function canonical(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) out[k] = sortDeep((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}

function isUsableRecordId(id: unknown): id is string {
  return typeof id === "string" && id.trim().length > 0;
}

/**
 * Personal records are recalculated from verified completed History so that the
 * achieving date always comes from the workout containing the heaviest
 * completed set for that exact exercise ID (decision 4.6). Migration time,
 * import time and "now" are never used as an achieving date.
 */
export function recalculatePRs(workouts: any[]): {
  byExercise: Record<string, { maxWeight: number; achievedAt: number; workoutId: string; unit: typeof LEGACY_UNIT }>;
} {
  const byExercise: Record<string, { maxWeight: number; achievedAt: number; workoutId: string; unit: typeof LEGACY_UNIT }> = {};
  for (const w of workouts) {
    const date = typeof w?.date === "number" ? w.date : null;
    const workoutId = isUsableRecordId(w?.id) ? w.id : null;
    if (date === null || workoutId === null) continue;
    for (const e of Array.isArray(w?.exercises) ? w.exercises : []) {
      const exId = e?.exerciseId;
      if (!isUsableRecordId(exId)) continue;
      for (const s of Array.isArray(e?.sets) ? e.sets : []) {
        if (!s?.done) continue; // incomplete sets never contribute
        const weight = typeof s?.weight === "number" ? s.weight : 0;
        if (weight <= 0) continue;
        const cur = byExercise[exId];
        if (!cur || weight > cur.maxWeight || (weight === cur.maxWeight && date < cur.achievedAt)) {
          byExercise[exId] = { maxWeight: weight, achievedAt: date, workoutId, unit: LEGACY_UNIT };
        }
      }
    }
  }
  return { byExercise };
}

async function markerFor(kv: KV, owner: Owner, domain: Domain) {
  const raw = await kv.get(migrationMarkerKey(owner, domain));
  return raw ? (JSON.parse(raw) as { provenance: Provenance }) : null;
}

async function appendQuarantine(kv: KV, owner: Owner, domain: Domain, rec: QuarantineRecord) {
  const key = quarantineKey(owner, domain as Domain);
  const raw = await kv.get(key);
  const list: QuarantineRecord[] = raw ? JSON.parse(raw) : [];
  list.push(rec);
  await kv.set(key, JSON.stringify(list));
}

export async function readQuarantine(kv: KV, owner: Owner, domain: Domain): Promise<QuarantineRecord[]> {
  const raw = await kv.get(quarantineKey(owner, domain));
  return raw ? (JSON.parse(raw) as QuarantineRecord[]) : [];
}

export type MigrationDeps = {
  kv: KV;
  store: ScopedStore;
  /** Live owner — checked before every commit and before every marker write. */
  currentOwner: () => OwnerToken | null;
  now?: () => number;
};

/**
 * Runs migration for one owner. Safe to call repeatedly: verified domains are
 * skipped, interrupted domains resume from the immutable source snapshot.
 */
export async function runMigration(owner: Owner, deps: MigrationDeps): Promise<MigrationReport> {
  const now = deps.now ?? Date.now;
  const report: MigrationReport = {
    state: "NOT_STARTED",
    owner: { kind: owner.kind, id: owner.id },
    domains: {},
    quarantined: [],
    alreadyComplete: [],
  };

  if (owner.kind !== "guest") {
    // Unverifiable global ownership: never claimed by an account merely because
    // someone signed in. Source stays intact; no marker is written.
    report.state = "OWNER_UNRESOLVED";
    report.abortedReason = "not_guest_scope";
    return report;
  }
  if (!sameOwner(owner, deps.currentOwner())) {
    report.state = "OWNER_UNRESOLVED";
    report.abortedReason = "owner_changed";
    return report;
  }

  // ---- SOURCE_SNAPSHOT (read-only) ----
  const snapshot = await snapshotLegacy(deps.kv);
  report.state = "SOURCE_SNAPSHOT";

  let anyPartial = false;
  let anyQuarantine = false;

  const commit = async (domain: Domain, value: unknown, prov: Provenance, counts: { copied: number; skipped: number; quarantined: number }) => {
    // ---- DESTINATION_PREPARED → COPY_IN_PROGRESS ----
    const write = await deps.store.write(owner, domain, value);
    if (!write.ok) {
      report.domains[domain] = { state: "OWNER_UNRESOLVED", ...counts, copied: 0 };
      report.abortedReason = write.reason === "owner_changed" ? "owner_changed" : "owner_unresolved";
      return false;
    }    // ---- VERIFYING: read the destination back and compare canonically ----
    const readBack = await deps.store.read<unknown>(owner, domain, null);
    if (canonical(readBack) !== canonical(value)) {
      report.domains[domain] = { state: "PARTIAL", ...counts };
      anyPartial = true;
      return false;
    }
    // ---- marker only after verification, and only if the owner is unchanged ----
    if (!sameOwner(owner, deps.currentOwner())) {
      report.abortedReason = "owner_changed";
      report.domains[domain] = { state: "PARTIAL", ...counts };
      anyPartial = true;
      return false;
    }
    await deps.kv.set(
      migrationMarkerKey(owner, domain),
      JSON.stringify({ migrationVersion: MIGRATION_VERSION, domain, provenance: prov }),
    );
    report.domains[domain] = { state: "COMPLETE", ...counts };
    return true;
  };

  // ---- scalar domains ----
  for (const [legacyDomain, domain] of SCALAR_MAP) {
    if (await markerFor(deps.kv, owner, domain)) {
      report.alreadyComplete.push(domain);
      continue;
    }
    const src = snapshot[legacyDomain] as LegacyRead<unknown>;
    if (!src.present) {
      report.domains[domain] = { state: "COMPLETE", copied: 0, skipped: 0, quarantined: 0 };
      await deps.kv.set(
        migrationMarkerKey(owner, domain),
        JSON.stringify({
          migrationVersion: MIGRATION_VERSION,
          domain,
          provenance: {
            source: LEGACY_SOURCES[legacyDomain].key,
            encoding: LEGACY_SOURCES[legacyDomain].encoding,
            migrationVersion: MIGRATION_VERSION,
            claimPolicy: LEGACY_CLAIM_POLICY,
            verifiedAt: now(),
          } satisfies Provenance,
        }),
      );
      continue;
    }
    if (!src.ok) {
      const rec: QuarantineRecord = {
        domain: legacyDomain,
        reason: "unparsable_source",
        recordId: null,
        rawExcerptLength: src.raw.length,
        at: now(),
      };
      await appendQuarantine(deps.kv, owner, domain, rec);
      report.quarantined.push(rec);
      report.domains[domain] = { state: "QUARANTINED_CONFLICT", copied: 0, skipped: 0, quarantined: 1 };
      anyQuarantine = true;
      continue;
    }

    // Idempotence: an equivalent canonical payload already at the destination
    // is treated as already migrated instead of being rewritten/duplicated.
    const existing = await deps.store.read<unknown>(owner, domain, null);
    if (existing !== null && canonical(existing) !== canonical(src.value)) {
      const rec: QuarantineRecord = {
        domain: legacyDomain,
        reason: "conflicting_payload",
        recordId: domain,
        rawExcerptLength: src.raw.length,
        at: now(),
      };
      await appendQuarantine(deps.kv, owner, domain, rec);
      report.quarantined.push(rec);
      report.domains[domain] = { state: "QUARANTINED_CONFLICT", copied: 0, skipped: 1, quarantined: 1 };
      anyQuarantine = true;
      continue;
    }

    const prov: Provenance = {
      source: LEGACY_SOURCES[legacyDomain].key,
      encoding: src.encoding,
      migrationVersion: MIGRATION_VERSION,
      claimPolicy: LEGACY_CLAIM_POLICY,
      verifiedAt: now(),
    };
    const ok = await commit(domain, src.value, prov, { copied: 1, skipped: 0, quarantined: 0 });
    if (!ok && report.abortedReason === "owner_changed") return { ...report, state: "PARTIAL" };
  }

  // ---- workouts (record-level collision rules) ----
  if (await markerFor(deps.kv, owner, "workouts")) {
    report.alreadyComplete.push("workouts");
  } else {
    const src = snapshot.workouts as LegacyRead<LegacyWorkout[]>;
    const existing = await deps.store.read<any[]>(owner, "workouts", []);
    const byId = new Map<string, any>();
    for (const w of existing) if (isUsableRecordId(w?.id)) byId.set(w.id, w);

    let copied = 0;
    let skipped = 0;
    let quarantined = 0;

    if (src.present && src.ok && Array.isArray(src.value)) {
      for (const w of src.value) {
        if (!isUsableRecordId(w?.id)) {
          const rec: QuarantineRecord = {
            domain: "workouts",
            reason: "malformed_id",
            recordId: null,
            rawExcerptLength: JSON.stringify(w ?? null).length,
            at: now(),
          };
          await appendQuarantine(deps.kv, owner, "workouts", rec);
          report.quarantined.push(rec);
          quarantined++;
          continue;
        }
        const prev = byId.get(w.id);
        if (!prev) {
          byId.set(w.id, w);
          copied++;
        } else if (canonical(prev) === canonical(w)) {
          skipped++; // already migrated — never duplicated
        } else {
          const rec: QuarantineRecord = {
            domain: "workouts",
            reason: "conflicting_payload",
            recordId: w.id,
            rawExcerptLength: JSON.stringify(w).length,
            at: now(),
          };
          await appendQuarantine(deps.kv, owner, "workouts", rec);
          report.quarantined.push(rec);
          quarantined++;
        }
      }
    } else if (src.present && !src.ok) {
      const rec: QuarantineRecord = {
        domain: "workouts",
        reason: "unparsable_source",
        recordId: null,
        rawExcerptLength: src.raw.length,
        at: now(),
      };
      await appendQuarantine(deps.kv, owner, "workouts", rec);
      report.quarantined.push(rec);
      quarantined++;
    }

    if (quarantined > 0) anyQuarantine = true;

    const merged = [...byId.values()].sort((a, b) => (b?.date ?? 0) - (a?.date ?? 0));
    const prov: Provenance = {
      source: LEGACY_SOURCES.workouts.key,
      encoding: src.present && src.ok ? src.encoding : "double",
      migrationVersion: MIGRATION_VERSION,
      claimPolicy: LEGACY_CLAIM_POLICY,
      unitInterpretation: LEGACY_UNIT,
      verifiedAt: now(),
    };
    const ok = await commit("workouts", merged, prov, { copied, skipped, quarantined });
    if (!ok && report.abortedReason === "owner_changed") return { ...report, state: "PARTIAL" };

    // ---- PRs: recalculated from the verified destination History only ----
    if (ok) {
      const verified = await deps.store.read<any[]>(owner, "workouts", []);
      const prs = recalculatePRs(verified);
      const legacyPRs = snapshot.prs as LegacyRead<any>;
      if (legacyPRs.present && legacyPRs.ok && legacyPRs.value?.byExercise) {
        for (const exId of Object.keys(legacyPRs.value.byExercise)) {
          if (!prs.byExercise[exId]) {
            // A legacy PR with no verifiable achieving workout stays unresolved.
            const rec: QuarantineRecord = {
              domain: "prs",
              reason: "unverifiable_pr",
              recordId: exId,
              rawExcerptLength: JSON.stringify(legacyPRs.value.byExercise[exId]).length,
              at: now(),
            };
            await appendQuarantine(deps.kv, owner, "prs", rec);
            report.quarantined.push(rec);
            anyQuarantine = true;
          }
        }
      }
      const prProv: Provenance = {
        source: `${LEGACY_SOURCES.workouts.key} (recalculated)`,
        encoding: "double",
        migrationVersion: MIGRATION_VERSION,
        claimPolicy: LEGACY_CLAIM_POLICY,
        unitInterpretation: LEGACY_UNIT,
        verifiedAt: now(),
      };
      if (!(await markerFor(deps.kv, owner, "prs"))) {
        await commit("prs", prs, prProv, {
          copied: Object.keys(prs.byExercise).length,
          skipped: 0,
          quarantined: report.quarantined.filter((q) => q.domain === "prs").length,
        });
      } else {
        report.alreadyComplete.push("prs");
      }
    }
  }

  report.state = report.abortedReason
    ? "PARTIAL"
    : anyQuarantine
      ? "QUARANTINED_CONFLICT"
      : anyPartial
        ? "PARTIAL"
        : "COMPLETE";
  return report;
}

/** Metrics helper: quarantined/unresolved records never contribute to totals. */
export function metricsEligible<T extends { id?: unknown }>(records: T[], quarantined: QuarantineRecord[]): T[] {
  const bad = new Set(quarantined.map((q) => q.recordId).filter(Boolean) as string[]);
  return records.filter((r) => isUsableRecordId(r?.id) && !bad.has(r.id as string));
}
