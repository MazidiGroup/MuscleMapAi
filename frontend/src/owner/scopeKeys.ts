// Owner model and versioned, collision-free scoped key encoding.
//
// Namespace version is explicit (`NAMESPACE_VERSION`). None of the generated
// keys can collide with a legacy key: every scoped key starts with the reserved
// `mma.own.v1.` prefix, which no legacy key uses.

export const NAMESPACE_VERSION = 1;
export const SCOPE_PREFIX = `mma.own.v${NAMESPACE_VERSION}`;

export type OwnerKind = "account" | "guest";

export type OwnerStatus = "unresolved" | "transitioning" | "resolved";

export type Owner = {
  kind: OwnerKind;
  /** Stable verified identifier — an account user_id or the local guest id. */
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
  planSeed: 1,
  onboardingStep: 1,
  planCompletions: 1,
  workouts: 1,
  prs: 1,
  restPref: 1,
  activeSession: 1,
  unitPreference: 1,
};

/** Migration contract version — bumping it re-runs migration for every owner. */
export const MIGRATION_VERSION = 1;

const SAFE_ID = /^[A-Za-z0-9_-]{4,128}$/;

/**
 * An identifier is only usable as an owner scope if it is verifiably stable and
 * safe to embed in a key. Emails, display names, provider labels and raw token
 * text never reach this function.
 */
export function isUsableOwnerId(id: unknown): id is string {
  return typeof id === "string" && SAFE_ID.test(id);
}

function segment(owner: Owner): string {
  return `${owner.kind === "account" ? "acct" : "guest"}.${owner.id}`;
}

/** Versioned, collision-free destination key for one owner + domain. */
export function scopedKey(owner: Owner, domain: Domain): string {
  if (!isUsableOwnerId(owner.id)) throw new Error("scopedKey: unusable owner id");
  return `${SCOPE_PREFIX}.${segment(owner)}.${domain}.v${DOMAIN_SCHEMA_VERSION[domain]}`;
}

/** Migration completion marker — owner + migration version + domain scoped. */
export function migrationMarkerKey(owner: Owner, domain: Domain): string {
  if (!isUsableOwnerId(owner.id)) throw new Error("migrationMarkerKey: unusable owner id");
  return `${SCOPE_PREFIX}.${segment(owner)}.__migration.${domain}.m${MIGRATION_VERSION}`;
}

/** Quarantine bucket — retains conflicting/malformed evidence per owner+domain. */
export function quarantineKey(owner: Owner, domain: Domain): string {
  if (!isUsableOwnerId(owner.id)) throw new Error("quarantineKey: unusable owner id");
  return `${SCOPE_PREFIX}.${segment(owner)}.__quarantine.${domain}.v1`;
}

/** Global (not owner-scoped) key holding the stable local guest identifier. */
export const GUEST_ID_KEY = "mma.owner.guest.v1";

/**
 * Legacy keys are immutable sources. They are listed here so the resolver can
 * assert it never returns one as a destination.
 */
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
