// Legacy data handling.
//
// POLICY: `unclaimed_without_verified_owner`.
// The ten legacy keys are device-global and carry no ownership evidence. A newly
// generated local guest id does not prove ownership of records that already
// existed, and signing in proves nothing about them either. Therefore NOTHING is
// adopted automatically: `scanLegacy` only reports, never writes destination data
// and never writes a completion marker.
//
// `adoptLegacy` implements the full copy → verify → marker state machine for a
// FUTURE explicit, human-approved adoption flow. It refuses to run unless an
// explicit approval is passed, so it can never be triggered by sign-in, guest
// creation or app launch.
//
// Legacy sources are read-only everywhere in this module: they are never
// written, normalised or deleted.

import { canonicalHash, canonicalJSON } from "./encoding";
import { KV } from "./kv";
import { LEGACY_SOURCES, LegacyDomain, LegacyRead, snapshotLegacy } from "./legacySources";
import {
  Domain,
  MIGRATION_VERSION,
  Owner,
  UNCLAIMED_REPORT_KEY,
  migrationMarkerKey,
  quarantineKey,
  unclaimedQuarantineKey,
} from "./scopeKeys";
import { OwnerToken, ScopedStore, sameOwner } from "./scopedStore";

export type MigrationState =
  | "NOT_STARTED"
  | "UNCLAIMED_LEGACY"
  | "OWNER_UNRESOLVED"
  | "SOURCE_SNAPSHOT"
  | "DESTINATION_PREPARED"
  | "COPY_IN_PROGRESS"
  | "VERIFYING"
  | "COMPLETE"
  | "PARTIAL"
  | "QUARANTINED_CONFLICT";

export const LEGACY_CLAIM_POLICY = "unclaimed_without_verified_owner" as const;

/** Unit interpretation for every legacy weight value. Never re-computed. */
export const LEGACY_UNIT: "kg" = "kg";

export type QuarantineReason =
  | "conflicting_payload"
  | "malformed_id"
  | "unparsable_source"
  | "untrusted_duplicate"
  | "unverifiable_pr";

/**
 * Lossless quarantine evidence. `payload` holds the exact conflicting record (or
 * the exact raw source string when the source could not be parsed), so a
 * conflict is always recoverable without re-reading anything.
 */
export type QuarantineRecord = {
  sourceKey: string;
  sourceDomain: LegacyDomain;
  sourceEncoding: "single" | "double" | "unknown";
  recordId: string | null;
  /** Exact payload, JSON-encoded, or the raw source text verbatim. */
  payload: string;
  payloadHash: string;
  reason: QuarantineReason;
  migrationVersion: number;
  detectedAt: number;
  /** Canonical destination record this conflicts with, when one exists. */
  destinationRef: { key: string; recordId: string | null; hash: string } | null;
};

export type Provenance = {
  source: string;
  encoding: "single" | "double";
  migrationVersion: number;
  claimPolicy: typeof LEGACY_CLAIM_POLICY;
  /** Only set for domains that carry weights. */
  unitInterpretation?: typeof LEGACY_UNIT;
  /** Free-text record of who authorised the adoption. */
  approvedBy: string;
  verifiedAt: number;
};

export type UnclaimedDomainReport = {
  domain: LegacyDomain;
  sourceKey: string;
  state: "UNCLAIMED_LEGACY" | "NO_SOURCE" | "QUARANTINED_CONFLICT";
  encoding: "single" | "double" | "unknown";
  /** Record count when the source is a countable collection. */
  records: number | null;
  hash: string | null;
};

export type ScanReport = {
  policy: typeof LEGACY_CLAIM_POLICY;
  state: "UNCLAIMED_LEGACY" | "NOT_STARTED";
  scannedAt: number;
  domains: UnclaimedDomainReport[];
  quarantined: QuarantineRecord[];
  /** Always empty: a scan never claims and never marks. */
  markersWritten: never[];
};

export type MigrationReport = {
  state: MigrationState;
  policy: typeof LEGACY_CLAIM_POLICY;
  owner: OwnerToken | null;
  domains: Partial<Record<Domain, { state: MigrationState; copied: number; skipped: number; quarantined: number }>>;
  quarantined: QuarantineRecord[];
  alreadyComplete: Domain[];
  abortedReason?: "owner_changed" | "owner_unresolved" | "approval_missing";
};

const SCALAR_MAP: [LegacyDomain, Domain][] = [
  ["plan", "plan"],
  ["planAnswers", "planAnswers"],
  ["planSeed", "planSeed"],
  ["onboardingStep", "onboardingStep"],
  ["planCompletions", "planCompletions"],
  ["restPref", "restPref"],
];

function isUsableRecordId(id: unknown): id is string {
  return typeof id === "string" && id.trim().length > 0;
}

async function appendQuarantine(kv: KV, key: string, rec: QuarantineRecord) {
  const raw = await kv.get(key);
  const list: QuarantineRecord[] = raw ? JSON.parse(raw) : [];
  list.push(rec);
  await kv.set(key, JSON.stringify(list));
}

export async function readQuarantine(kv: KV, owner: Owner, domain: Domain): Promise<QuarantineRecord[]> {
  const raw = await kv.get(quarantineKey(owner, domain));
  return raw ? (JSON.parse(raw) as QuarantineRecord[]) : [];
}

export async function readUnclaimedQuarantine(kv: KV, domain: string): Promise<QuarantineRecord[]> {
  const raw = await kv.get(unclaimedQuarantineKey(domain));
  return raw ? (JSON.parse(raw) as QuarantineRecord[]) : [];
}

export async function readUnclaimedReport(kv: KV): Promise<ScanReport | null> {
  const raw = await kv.get(UNCLAIMED_REPORT_KEY);
  return raw ? (JSON.parse(raw) as ScanReport) : null;
}

/**
 * Personal records are only ever derived from verified completed History, so the
 * achieving date comes from the workout containing the heaviest completed set for
 * that exact exercise id. Migration time, import time and "now" are never used.
 */
export function recalculatePRs(workouts: any[]): {
  byExercise: Record<string, { maxWeight: number; achievedAt: number; workoutId: string; unit: typeof LEGACY_UNIT }>;
} {
  const byExercise: Record<
    string,
    { maxWeight: number; achievedAt: number; workoutId: string; unit: typeof LEGACY_UNIT }
  > = {};
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

/** Metrics helper: quarantined/unresolved records never contribute to totals. */
export function metricsEligible<T extends { id?: unknown }>(records: T[], quarantined: QuarantineRecord[]): T[] {
  const bad = new Set(quarantined.map((q) => q.recordId).filter(Boolean) as string[]);
  return records.filter((r) => isUsableRecordId(r?.id) && !bad.has(r.id as string));
}

// ---------------------------------------------------------------------------
// Scan — the only path that runs automatically.
// ---------------------------------------------------------------------------

/**
 * Reports what ownerless legacy data exists. Writes NO destination data, NO
 * completion marker and never touches a legacy source. Malformed sources are
 * copied losslessly into a device-level (not owner-scoped) quarantine so they
 * stay recoverable without attributing them to anyone.
 */
export async function scanLegacy(kv: KV, now: () => number = Date.now): Promise<ScanReport> {
  const snapshot = await snapshotLegacy(kv);
  const domains: UnclaimedDomainReport[] = [];
  const quarantined: QuarantineRecord[] = [];

  for (const legacyDomain of Object.keys(LEGACY_SOURCES) as LegacyDomain[]) {
    const src = snapshot[legacyDomain] as LegacyRead<unknown>;
    const sourceKey = LEGACY_SOURCES[legacyDomain].key;
    if (!src.present) {
      domains.push({ domain: legacyDomain, sourceKey, state: "NO_SOURCE", encoding: "unknown", records: null, hash: null });
      continue;
    }
    if (!src.ok) {
      const rec: QuarantineRecord = {
        sourceKey,
        sourceDomain: legacyDomain,
        sourceEncoding: "unknown",
        recordId: null,
        payload: src.raw, // exact raw source text — lossless
        payloadHash: canonicalHash(src.raw),
        reason: "unparsable_source",
        migrationVersion: MIGRATION_VERSION,
        detectedAt: now(),
        destinationRef: null,
      };
      await appendQuarantine(kv, unclaimedQuarantineKey(legacyDomain), rec);
      quarantined.push(rec);
      domains.push({
        domain: legacyDomain,
        sourceKey,
        state: "QUARANTINED_CONFLICT",
        encoding: "unknown",
        records: null,
        hash: canonicalHash(src.raw),
      });
      continue;
    }
    domains.push({
      domain: legacyDomain,
      sourceKey,
      state: "UNCLAIMED_LEGACY",
      encoding: src.encoding,
      records: Array.isArray(src.value) ? src.value.length : null,
      hash: canonicalHash(src.value),
    });
  }

  const report: ScanReport = {
    policy: LEGACY_CLAIM_POLICY,
    state: domains.some((d) => d.state !== "NO_SOURCE") ? "UNCLAIMED_LEGACY" : "NOT_STARTED",
    scannedAt: now(),
    domains,
    quarantined,
    markersWritten: [],
  };
  await kv.set(UNCLAIMED_REPORT_KEY, JSON.stringify(report));
  return report;
}

// ---------------------------------------------------------------------------
// Adoption — future flow, explicit approval required.
// ---------------------------------------------------------------------------

export type AdoptionDeps = {
  kv: KV;
  store: ScopedStore;
  /** Live owner token — checked before every commit and before every marker. */
  currentOwner: () => OwnerToken | null;
  now?: () => number;
};

export type AdoptionApproval = {
  /** Must be exactly true; a missing or false value aborts. */
  humanApproved: boolean;
  /** Recorded in provenance, e.g. "user:settings.adopt-local-data". */
  approvedBy: string;
};

/**
 * Copies ownerless legacy data into one owner's namespace. NOT called anywhere
 * automatically — sign-in, guest creation and launch never reach this function.
 */
export async function adoptLegacy(
  owner: Owner,
  approval: AdoptionApproval,
  deps: AdoptionDeps,
): Promise<MigrationReport> {
  const now = deps.now ?? Date.now;
  const captured = deps.currentOwner();
  const report: MigrationReport = {
    state: "NOT_STARTED",
    policy: LEGACY_CLAIM_POLICY,
    owner: captured,
    domains: {},
    quarantined: [],
    alreadyComplete: [],
  };

  if (approval?.humanApproved !== true || !approval.approvedBy) {
    report.state = "UNCLAIMED_LEGACY";
    report.abortedReason = "approval_missing";
    return report;
  }
  if (!captured || captured.kind !== owner.kind || captured.id !== owner.id) {
    report.state = "OWNER_UNRESOLVED";
    report.abortedReason = "owner_changed";
    return report;
  }

  const snapshot = await snapshotLegacy(deps.kv);
  report.state = "SOURCE_SNAPSHOT";

  let anyQuarantine = false;
  let anyPartial = false;

  const markerFor = async (domain: Domain) => {
    const raw = await deps.kv.get(migrationMarkerKey(owner, domain));
    return raw ? (JSON.parse(raw) as { provenance: Provenance }) : null;
  };

  const commit = async (
    domain: Domain,
    value: unknown,
    prov: Provenance,
    counts: { copied: number; skipped: number; quarantined: number },
  ) => {
    const write = await deps.store.writeGuarded(captured, domain, value);
    if (!write.ok) {
      report.domains[domain] = { state: "OWNER_UNRESOLVED", ...counts, copied: 0 };
      report.abortedReason = write.reason === "owner_changed" ? "owner_changed" : "owner_unresolved";
      return false;
    }
    const readBack = await deps.store.read<unknown>(owner, domain, null);
    if (canonicalJSON(readBack) !== canonicalJSON(value)) {
      report.domains[domain] = { state: "PARTIAL", ...counts };
      anyPartial = true;
      return false;
    }
    if (!sameOwner(captured, deps.currentOwner())) {
      report.domains[domain] = { state: "PARTIAL", ...counts };
      report.abortedReason = "owner_changed";
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

  const provFor = (legacyDomain: LegacyDomain, encoding: "single" | "double", withUnit: boolean): Provenance => ({
    source: LEGACY_SOURCES[legacyDomain].key,
    encoding,
    migrationVersion: MIGRATION_VERSION,
    claimPolicy: LEGACY_CLAIM_POLICY,
    ...(withUnit ? { unitInterpretation: LEGACY_UNIT } : {}),
    approvedBy: approval.approvedBy,
    verifiedAt: now(),
  });

  // ---- scalar domains ----
  for (const [legacyDomain, domain] of SCALAR_MAP) {
    if (await markerFor(domain)) {
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
          provenance: provFor(legacyDomain, LEGACY_SOURCES[legacyDomain].encoding, false),
        }),
      );
      continue;
    }
    if (!src.ok) {
      const rec: QuarantineRecord = {
        sourceKey: LEGACY_SOURCES[legacyDomain].key,
        sourceDomain: legacyDomain,
        sourceEncoding: "unknown",
        recordId: null,
        payload: src.raw,
        payloadHash: canonicalHash(src.raw),
        reason: "unparsable_source",
        migrationVersion: MIGRATION_VERSION,
        detectedAt: now(),
        destinationRef: null,
      };
      await appendQuarantine(deps.kv, quarantineKey(owner, domain), rec);
      report.quarantined.push(rec);
      report.domains[domain] = { state: "QUARANTINED_CONFLICT", copied: 0, skipped: 0, quarantined: 1 };
      anyQuarantine = true;
      continue;
    }

    const existing = await deps.store.read<unknown>(owner, domain, null);
    if (existing !== null && canonicalJSON(existing) !== canonicalJSON(src.value)) {
      const rec: QuarantineRecord = {
        sourceKey: LEGACY_SOURCES[legacyDomain].key,
        sourceDomain: legacyDomain,
        sourceEncoding: src.encoding,
        recordId: domain,
        payload: JSON.stringify(src.value),
        payloadHash: canonicalHash(src.value),
        reason: "conflicting_payload",
        migrationVersion: MIGRATION_VERSION,
        detectedAt: now(),
        destinationRef: {
          key: deps.store.keyFor(owner, domain),
          recordId: domain,
          hash: canonicalHash(existing),
        },
      };
      await appendQuarantine(deps.kv, quarantineKey(owner, domain), rec);
      report.quarantined.push(rec);
      report.domains[domain] = { state: "QUARANTINED_CONFLICT", copied: 0, skipped: 1, quarantined: 1 };
      anyQuarantine = true;
      continue;
    }

    const ok = await commit(domain, src.value, provFor(legacyDomain, src.encoding, false), {
      copied: 1,
      skipped: 0,
      quarantined: 0,
    });
    if (!ok && report.abortedReason === "owner_changed") return { ...report, state: "PARTIAL" };
  }

  // ---- workouts (record-level collision rules) ----
  if (await markerFor("workouts")) {
    report.alreadyComplete.push("workouts");
  } else {
    const src = snapshot.workouts as LegacyRead<any[]>;
    const existing = await deps.store.read<any[]>(owner, "workouts", []);
    const byId = new Map<string, any>();
    for (const w of existing) if (isUsableRecordId(w?.id)) byId.set(w.id, w);

    let copied = 0;
    let skipped = 0;
    let quarantined = 0;

    const quarantineWorkout = async (rec: QuarantineRecord) => {
      await appendQuarantine(deps.kv, quarantineKey(owner, "workouts"), rec);
      report.quarantined.push(rec);
      quarantined++;
    };

    if (src.present && src.ok && Array.isArray(src.value)) {
      for (const w of src.value) {
        if (!isUsableRecordId(w?.id)) {
          await quarantineWorkout({
            sourceKey: LEGACY_SOURCES.workouts.key,
            sourceDomain: "workouts",
            sourceEncoding: src.encoding,
            recordId: null,
            payload: JSON.stringify(w ?? null),
            payloadHash: canonicalHash(w ?? null),
            reason: "malformed_id",
            migrationVersion: MIGRATION_VERSION,
            detectedAt: now(),
            destinationRef: null,
          });
          continue;
        }
        const prev = byId.get(w.id);
        if (!prev) {
          byId.set(w.id, w);
          copied++;
        } else if (canonicalJSON(prev) === canonicalJSON(w)) {
          skipped++; // already present — never duplicated
        } else {
          await quarantineWorkout({
            sourceKey: LEGACY_SOURCES.workouts.key,
            sourceDomain: "workouts",
            sourceEncoding: src.encoding,
            recordId: w.id,
            payload: JSON.stringify(w),
            payloadHash: canonicalHash(w),
            reason: "conflicting_payload",
            migrationVersion: MIGRATION_VERSION,
            detectedAt: now(),
            destinationRef: {
              key: deps.store.keyFor(owner, "workouts"),
              recordId: w.id,
              hash: canonicalHash(prev),
            },
          });
        }
      }
    } else if (src.present && !src.ok) {
      await quarantineWorkout({
        sourceKey: LEGACY_SOURCES.workouts.key,
        sourceDomain: "workouts",
        sourceEncoding: "unknown",
        recordId: null,
        payload: src.raw,
        payloadHash: canonicalHash(src.raw),
        reason: "unparsable_source",
        migrationVersion: MIGRATION_VERSION,
        detectedAt: now(),
        destinationRef: null,
      });
    }

    if (quarantined > 0) anyQuarantine = true;

    const merged = [...byId.values()].sort((a, b) => (b?.date ?? 0) - (a?.date ?? 0));
    const ok = await commit(
      "workouts",
      merged,
      provFor("workouts", src.present && src.ok ? src.encoding : "double", true),
      { copied, skipped, quarantined },
    );
    if (!ok && report.abortedReason === "owner_changed") return { ...report, state: "PARTIAL" };

    // ---- PRs: recalculated from the verified destination History only ----
    if (ok) {
      const verified = await deps.store.read<any[]>(owner, "workouts", []);
      const prs = recalculatePRs(verified);
      const legacyPRs = snapshot.prs as LegacyRead<any>;
      if (legacyPRs.present && legacyPRs.ok && legacyPRs.value?.byExercise) {
        for (const exId of Object.keys(legacyPRs.value.byExercise)) {
          if (!prs.byExercise[exId]) {
            const rec: QuarantineRecord = {
              sourceKey: LEGACY_SOURCES.prs.key,
              sourceDomain: "prs",
              sourceEncoding: legacyPRs.encoding,
              recordId: exId,
              payload: JSON.stringify(legacyPRs.value.byExercise[exId]),
              payloadHash: canonicalHash(legacyPRs.value.byExercise[exId]),
              reason: "unverifiable_pr",
              migrationVersion: MIGRATION_VERSION,
              detectedAt: now(),
              destinationRef: null,
            };
            await appendQuarantine(deps.kv, quarantineKey(owner, "prs"), rec);
            report.quarantined.push(rec);
            anyQuarantine = true;
          }
        }
      }
      if (!(await markerFor("prs"))) {
        await commit("prs", prs, provFor("workouts", "double", true), {
          copied: Object.keys(prs.byExercise).length,
          skipped: 0,
          quarantined: report.quarantined.filter((q) => q.sourceDomain === "prs").length,
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
