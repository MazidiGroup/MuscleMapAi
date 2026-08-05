// Owner model and versioned, collision-free scoped key encoding.
//
// Namespace version is explicit (`NAMESPACE_VERSION`). No generated key can
// collide with a legacy key: every scoped key starts with the reserved
// `mma.own.v1.` prefix, which no legacy key uses.
//
// Account identifiers are treated as OPAQUE. The repository's authentication
// contract does not guarantee any character set or length, so validity means
// only "a non-empty string supplied by the verified auth contract". The raw id
// is never placed in a key directly — it is base64url encoded, which is
// lossless, injective and cannot introduce a key separator.

import { encodeBase64Url } from "./encoding";

export const NAMESPACE_VERSION = 1;
export const SCOPE_PREFIX = `mma.own.v${NAMESPACE_VERSION}`;

export type OwnerKind = "account" | "guest";

export type Owner = {
  kind: OwnerKind;
  /** The exact opaque identifier from the verified identity source. */
  id: string;
};

export type OwnerState =
  | { status: "unresolved"; reason: "loading" | "no_identity" | "malformed_identity"; owner: null }
  | { status: "transitioning"; owner: null }
  | { status: "resolved"; owner: Owner };

/** Every owner-scoped domain in the Direction B local-first contract. */
export const DOMAINS = [
  "plan",
  "planAnswers",
  "planSwaps",
  "planSeed",
  "onboardingStep",
  "planCompletions",
  "workouts",
  "prs",
  "restPref",
  "activeSession",
  "unitPreference",
] as const;

export type Domain = (typeof DOMAINS)[number];

/** Schema version per domain — bumped independently of the namespace version. */
export const DOMAIN_SCHEMA_VERSION: Record<Domain, number> = {
  plan: 1,
  planAnswers: 1,
  planSwaps: 1,
  planSeed: 1,
  onboardingStep: 1,
  planCompletions: 1,
  workouts: 1,
  prs: 1,
  restPref: 1,
  activeSession: 1,
  unitPreference: 1,
};

/** Migration/adoption contract version. */
export const MIGRATION_VERSION = 1;

/**
 * An identity can be used as an owner scope when it is a non-empty string.
 * No character or length rule is invented here: UUIDs, provider-prefixed ids,
 * email-like ids, punctuation and Unicode are all accepted.
 */
export function isUsableOwnerId(id: unknown): id is string {
  return typeof id === "string" && id.length > 0;
}

/**
 * Safe deterministic key segment for an owner. Lossless base64url means two
 * different raw ids can never share a segment. The encoded value is a storage
 * detail and must never be shown to a user.
 */
export function encodeOwnerId(id: unknown): string | null {
  if (!isUsableOwnerId(id)) return null;
  return encodeBase64Url(id);
}

export function ownerSegment(owner: Owner): string {
  const encoded = encodeOwnerId(owner.id);
  if (!encoded) throw new Error("ownerSegment: unusable owner id");
  return `${owner.kind === "account" ? "acct" : "guest"}.${encoded}`;
}

/** Versioned, collision-free destination key for one owner + domain. */
export function scopedKey(owner: Owner, domain: Domain): string {
  return `${SCOPE_PREFIX}.${ownerSegment(owner)}.${domain}.v${DOMAIN_SCHEMA_VERSION[domain]}`;
}

/**
 * Journal key holding a prepared-but-not-promoted value. Normal readers never
 * look here, so an aborted mutation is invisible to the app.
 */
export function pendingKey(owner: Owner, domain: Domain): string {
  return `${SCOPE_PREFIX}.${ownerSegment(owner)}.${domain}.v${DOMAIN_SCHEMA_VERSION[domain]}.__pending`;
}

/** Adoption completion marker — owner + migration version + domain scoped. */
export function migrationMarkerKey(owner: Owner, domain: Domain): string {
  return `${SCOPE_PREFIX}.${ownerSegment(owner)}.__migration.${domain}.m${MIGRATION_VERSION}`;
}

/** Quarantine bucket — retains lossless conflicting/malformed evidence. */
export function quarantineKey(owner: Owner, domain: Domain): string {
  return `${SCOPE_PREFIX}.${ownerSegment(owner)}.__quarantine.${domain}.v1`;
}

/**
 * Device-level quarantine, used when legacy data has NO verified owner. It is
 * not owner-scoped because attributing it to an owner would be an ownership
 * claim.
 */
export function unclaimedQuarantineKey(domain: string): string {
  return `${SCOPE_PREFIX}.__unclaimed.__quarantine.${domain}.v1`;
}

/** Device-level report describing what ownerless legacy data exists. */
export const UNCLAIMED_REPORT_KEY = `${SCOPE_PREFIX}.__unclaimed.report.v1`;

/** Global (not owner-scoped) key holding the stable local guest identifier. */
export const GUEST_ID_KEY = "mma.owner.guest.v1";

/** Legacy keys are immutable sources; nothing outside migration may write them. */
export const LEGACY_KEYS = [
  "mma.themeMode",
  "mma.plan.v1",
  "mma.plan.answers.v1",
  "mma.plan.seed.v1",
  "mma.plan.onboardingStep.v1",
  "mma.plan.completions.v1",
  "anat.workouts",
  "anat.prs",
  "anat.restPref",
  "apex.session_token",
] as const;

export function isLegacyKey(key: string): boolean {
  return (LEGACY_KEYS as readonly string[]).includes(key);
}
