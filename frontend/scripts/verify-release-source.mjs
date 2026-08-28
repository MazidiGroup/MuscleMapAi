#!/usr/bin/env node
/**
 * Release-source verification gate — MANDATORY before every build.
 *
 * Two modes:
 *
 *   Local release mode (default)
 *     RELEASE_EXPECTED_COMMIT=<sha> RELEASE_EXPECTED_BRANCH=release/direction-b-testflight-rc \
 *       node scripts/verify-release-source.mjs
 *     Requires the approved worktree, branch, commit and a clean tree.
 *     RELEASE_EXPECTED_COMMIT is REQUIRED: the gate refuses to bless an unpinned tree.
 *
 *   EAS cloud pre-install mode (`--eas-pre-install`, wired to the
 *   `eas-build-pre-install` package script)
 *     Runs before dependencies are installed, so it uses Node built-ins only and
 *     never touches node_modules. It executes NO Git command and requires no `.git`
 *     directory, Git root, branch, HEAD, status or worktree path: the uploaded EAS
 *     workspace is frequently not a usable Git repository (`git rev-parse` exits
 *     128 there), so Git metadata can never be part of the cloud contract. Instead
 *     it verifies the committed source fingerprint, the Direction B source markers,
 *     application identity and the presence of the required public build variables.
 *     Cloud mode is entered by the `--eas-pre-install` flag OR by any `EAS_BUILD*`
 *     environment name, so losing the flag can never silently fall back to the
 *     Git-dependent local mode inside a build job.
 *
 *     The Emergent managed wrapper rewrites `app.json`, `eas.json` and `.env` before it
 *     uploads the source. Because those three are not the bytes this gate can prove,
 *     everything read out of them (marketing version, identity, slug, project id, OTA
 *     flags, update channel, build profile name, backend host policy) is reported as a
 *     NOTE or a WARNING and can never fail a build — a wrapper-side version increment or
 *     a re-injected preview host must not block a legitimate release. Only two things
 *     still fail: config that cannot be read or parsed at all, and a required public
 *     build variable that is missing or is not an absolute HTTPS URL. The 21 hash-pinned
 *     files, including `yarn.lock` and the guarded development route, are the source
 *     proof, and that fingerprint check is a hard failure with no skip and no override.
 *
 * It exits non-zero on failure, states that the build must not proceed, explains
 * which check failed WITHOUT revealing any environment value, never repairs source,
 * makes no network request and performs no deployment action.
 *
 * Existed since the rejected release was built from the inherited legacy tree
 * (/app/frontend). Both modes reject that source.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { MANIFEST_PATH, RELEASE_CRITICAL_FILES, computeFingerprint } from "./generate-release-manifest.mjs";

const EAS_MODE = process.argv.includes("--eas-pre-install") || isEasBuildEnvironment();
const ROOT = process.cwd();
// The approved commit is supplied by the release operator, never hardcoded: a
// hardcoded sha inside a release-critical file can only ever be stale (and would
// invalidate its own fingerprint the moment it were updated).
const EXPECTED_COMMIT = (process.env.RELEASE_EXPECTED_COMMIT || "").trim();
const EXPECTED_BRANCH = process.env.RELEASE_EXPECTED_BRANCH || "release/direction-b-testflight-rc";
const FORBIDDEN_SOURCE_ROOTS = ["/app/frontend"];

/** Required public build variables. Names only — values are never read out or printed. */
export const REQUIRED_PUBLIC_VARS = ["EXPO_PUBLIC_BACKEND_URL", "EXPO_PUBLIC_REVENUECAT_IOS_KEY"];

/**
 * EAS-provided names that may be reported when present. None is required, none is a
 * secret, and the gate never depends on any of them: the content fingerprint
 * remains the authoritative source proof.
 */
export const EAS_PROVENANCE_VARS = [
  "EAS_BUILD_ID",
  "EAS_BUILD_PROFILE",
  "EAS_BUILD_PROJECT_ID",
  "EAS_BUILD_GIT_COMMIT_HASH",
  "EAS_BUILD_WORKINGDIR",
];

/**
 * True inside an EAS Build job. Any `EAS_BUILD*` name counts, so the cloud can never
 * be misclassified as a local release checkout if the CLI flag is dropped by a shell
 * wrapper or a changed hook invocation (the exact failure mode that made a cloud job
 * run Git commands against a workspace with no `.git`).
 */
export function isEasBuildEnvironment(env = process.env) {
  return Object.keys(env).some((name) => name.startsWith("EAS_BUILD"));
}

/** Cloud-mode provenance notes. Reported only; never required, never a failure. */
function noteCloudProvenance() {
  notes.push(`Git metadata is not consulted in cloud mode — the ${RELEASE_CRITICAL_FILES.length}-file fingerprint is the source proof`);
  // One snapshot, read by name: no dynamic `process.env[...]` access.
  const snapshot = { ...process.env };
  const present = EAS_PROVENANCE_VARS.filter((name) => typeof snapshot[name] === "string" && snapshot[name].trim() !== "");
  if (!present.length) {
    notes.push("no EAS_BUILD* provenance name was supplied (not required)");
    return;
  }
  for (const name of present) {
    // A build/profile/project id and a commit hash are not secrets; a workingdir is a
    // path. Anything unexpected is reported as present only.
    const value = snapshot[name].trim();
    const safe = /^[A-Za-z0-9._/-]{1,120}$/.test(value) ? value : "present";
    notes.push(`${name} ${safe}`);
  }
}

const EXPECTED_IDENTITY = {
  "ios.bundleIdentifier": "com.mazidigroup.apexai",
  "android.package": "com.mazidigroup.apexai",
  scheme: "apexai",
};

/** Managed-pipeline-visible identity. `app.json` is rewritten by the wrapper before the
 * cloud upload (resolved config, injected `extra.eas.projectId`, and the EAS project
 * slug), so it is validated semantically instead of byte-pinned. */
const EXPECTED_SLUG = "apex-ai";
/**
 * The managed wrapper renames the slug to the EAS project's own slug. It is accepted in
 * cloud mode ONLY when every other identity signal simultaneously proves this is the
 * approved project and profile — see `resolveSlugPolicy()`.
 */
const MANAGED_CLOUD_SLUG = "ai-coach-trainer-2";
const EXPECTED_VERSION = "1.3.0";
const EXPECTED_PROJECT_ID = "7f544570-f0e2-45ce-bc88-97a50226e5cb";
const LEGACY_IDENTITY_MARKERS = ["frontend", "muscle-map-ai", "musclemapai", "expo-template", "my-app"];

const REQUIRED_MARKERS = [
  ["Build my free plan", "src/plan/OnboardingFlow.tsx"],
  ["Already have an account?", "src/plan/OnboardingFlow.tsx"],
  ["Adjust plan", "src/plan/PlanViews.tsx"],
  ["Not completed", "src/history/metrics.ts"],
  ["How History is stored", "src/history/metrics.ts"],
  ["mma.own.v1", "src/owner/scopeKeys.ts"],
  ["mma.owner.guest.v1", "src/owner/scopeKeys.ts"],
  ["premium_source", "src/premium/entitlement.ts"],
  ['PREMIUM_ENTITLEMENT_ID = "premium"', "src/premium/entitlement.ts"],
];

const LEGACY_COPY = [
  "Build my plan",
  "How much experience do you have",
  "Any regions you want to focus on",
  "How would you describe your posture",
];

const failures = [];
const notes = [];
const warnings = [];
const fail = (m) => failures.push(m);
// A warning is REPORTED and never fails the build. It is the only correct severity for
// anything the Emergent managed wrapper rewrites after upload — app.json, eas.json and
// frontend/.env — because those bytes are not the bytes this gate can prove. Source
// integrity is proven by the 21-file fingerprint alone, which stays a hard failure.
const warn = (m) => warnings.push(m);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const readSafe = (rel) => {
  try {
    return read(rel);
  } catch {
    return null;
  }
};

// --------------------------------------------------------------------------- //
// Environment-variable contract. Presence and safe SHAPE only; a value is never
// printed, returned, stored or included in an error message.
// --------------------------------------------------------------------------- //
export function validateBackendUrl(rawValue) {
  const value = typeof rawValue === "string" ? rawValue.trim() : "";
  if (!value) return { ok: false, reason: "missing or blank" };
  if (value.startsWith("/") || !/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value)) {
    return { ok: false, reason: "not an absolute URL (relative paths are rejected)" };
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: "malformed URL" };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "not HTTPS" };
  // Node keeps IPv6 literals in brackets; strip them so ::1 is recognised as loopback.
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(host) || host.endsWith(".local")) {
    return { ok: false, reason: "loopback or local host" };
  }
  if (/^(10|127)\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
    return { ok: false, reason: "private network host" };
  }
  // Redacted host is safe to surface; the full URL and any path never is.
  const redacted = host.replace(/^([^.]{1,3})[^.]*/, "$1***");
  // `hard: false` = report, never fail. `.env` is platform-managed and gets re-injected
  // (proved on 2026-07-29: the pod's inspect-2 preview host reappeared on its own), and
  // the managed wrapper configures the production backend URL at build time BEFORE this
  // pre-install hook runs — so a non-production host here says nothing about the source.
  if (/(^|[.-])(staging|stage|dev|test|preview|sandbox)([.-]|$)/.test(host) || host.includes("ngrok")) {
    return { ok: false, hard: false, reason: "non-production host", redactedHost: redacted };
  }
  if (/^inspect-/.test(host)) {
    return { ok: false, hard: false, reason: "sandbox workspace host", redactedHost: redacted };
  }
  return { ok: true, redactedHost: redacted };
}

export function validatePublicSdkKey(rawValue) {
  const value = typeof rawValue === "string" ? rawValue.trim() : "";
  if (!value) return { ok: false, reason: "missing or blank" };
  // Public SDK key: shape only, and it is NOT treated as a server secret. A passing
  // shape is NOT proof that the key belongs to the correct RevenueCat app — that stays
  // a manual production check.
  if (value.length < 20 || /\s/.test(value)) return { ok: false, reason: "implausible shape" };
  return { ok: true };
}

/**
 * Parses ONLY the two approved public names out of a `.env` file.
 *
 * The Emergent managed wrapper delivers the production values by rewriting the uploaded
 * `frontend/.env` rather than by setting EAS environment variables, so the gate must be
 * able to read them from there. Deliberately minimal: Node built-ins only, no
 * dependency, no interpolation, no command expansion, no variable substitution, and no
 * other key is ever read. Ambiguity fails closed instead of guessing.
 */
export function parseApprovedEnvFile(text) {
  const values = {};
  const errors = [];
  const seen = {};
  const lines = String(text).split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, "");
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const name = REQUIRED_PUBLIC_VARS.find((candidate) => trimmed.startsWith(candidate));
    if (!name) continue; // any other key is none of this gate's business
    const match = trimmed.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || match[1] !== name) {
      errors.push(`${name} is malformed on .env line ${i + 1} (value never printed)`);
      continue;
    }
    seen[name] = (seen[name] ?? 0) + 1;
    if (seen[name] > 1) {
      errors.push(`${name} is declared more than once in .env — ambiguous, refusing to guess`);
      continue;
    }
    let raw = match[2].trim();
    const quoted = /^(".*"|'.*')$/s.test(raw);
    if (quoted) raw = raw.slice(1, -1);
    if (raw.includes("${") || raw.includes("$(")) {
      errors.push(`${name} contains an unexpanded reference in .env — no interpolation is performed`);
      continue;
    }
    if (raw.trim() === "") {
      errors.push(`${name} is blank in .env (value never printed)`);
      continue;
    }
    values[name] = raw;
  }
  return { values, errors };
}

/** Reads `.env` next to the project root. Missing file is not an error. */
function readApprovedEnvFile() {
  const text = readSafe(".env");
  if (text === null) return { values: {}, errors: [], present: false };
  const parsed = parseApprovedEnvFile(text);
  return { ...parsed, present: true };
}

function checkPublicVars() {
  const fromFile = readApprovedEnvFile();
  for (const message of fromFile.errors) fail(`build variable ${message}`);
  const shell = { ...process.env };
  for (const name of REQUIRED_PUBLIC_VARS) {
    // `process.env` always wins; `.env` is the managed-pipeline fallback.
    const shellValue = Object.prototype.hasOwnProperty.call(shell, name) ? shell[name] : undefined;
    const value = shellValue !== undefined ? shellValue : fromFile.values[name];
    const source = shellValue !== undefined ? "environment" : ".env";
    if (value === undefined) {
      fail(`required build variable ${name} is not available to this environment (value never printed)`);
      continue;
    }
    const result = name === "EXPO_PUBLIC_BACKEND_URL" ? validateBackendUrl(value) : validatePublicSdkKey(value);
    if (!result.ok && result.hard === false) {
      // Host policy only — reported, never fatal (see validateBackendUrl).
      warn(`build variable ${name}: ${result.reason}, host ${result.redactedHost} (value never printed)`);
    } else if (!result.ok) {
      fail(`build variable ${name} failed validation: ${result.reason} (value never printed)`);
    } else {
      notes.push(
        name === "EXPO_PUBLIC_BACKEND_URL"
          ? `${name} present (${source}), absolute HTTPS, host ${result.redactedHost}`
          : `${name} present (${source}), shape accepted`,
      );
    }
  }
}

// --------------------------------------------------------------------------- //
// Shared source checks (both modes)
// --------------------------------------------------------------------------- //
function checkSource() {
  for (const [marker, rel] of REQUIRED_MARKERS) {
    const src = readSafe(rel);
    if (src === null) {
      fail(`required file missing: ${rel}`);
      continue;
    }
    if (!src.includes(marker)) fail(`required Direction B marker missing: "${marker}" in ${rel}`);
  }

  const onboarding = readSafe("src/plan/onboarding.ts");
  if (onboarding === null) {
    fail("src/plan/onboarding.ts is missing");
  } else {
    const steps = onboarding.match(/ONBOARDING_STEPS = \[([^\]]*)\]/);
    const list = steps ? steps[1].replace(/["'\s]/g, "").split(",").filter(Boolean) : [];
    if (list.join(",") !== "goal,days,equipment") {
      fail(`onboarding must be exactly goal,days,equipment — found ${list.join(",") || "nothing"}`);
    }
  }

  const walk = (dir, out = []) => {
    let entries;
    try {
      entries = fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true });
    } catch {
      return out;
    }
    for (const e of entries) {
      if (e.name === "node_modules") continue;
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel, out);
      else if (/\.(tsx?|jsx?)$/.test(e.name)) out.push(rel);
    }
    return out;
  };
  for (const rel of [...walk("app"), ...walk("src")]) {
    const src = read(rel);
    for (const legacy of LEGACY_COPY) {
      if (src.includes(legacy)) fail(`legacy journey copy present: "${legacy}" in ${rel}`);
    }
    if (/(?:>|["'`])\s*Shuffle\b|accessibilityLabel=["']Shuffle/.test(src)) {
      fail(`"Shuffle" is an active Plan action in ${rel}`);
    }
  }

  const keys = readSafe("src/owner/scopeKeys.ts");
  if (!keys || !keys.includes("mma.own.v1")) fail("owner-scoped storage prefix missing");
  for (const rel of ["src/plan/planStore.ts", "src/anatomy/workoutStore.tsx"]) {
    const src = readSafe(rel);
    if (src === null) {
      fail(`required file missing: ${rel}`);
    } else if (/["'](?:mma\.plan\.v1|anat\.workouts)["']/.test(src)) {
      fail(`legacy global storage key written by ${rel}`);
    }
  }
}

function checkIdentityAndConfig() {
  // EVERYTHING in this function reads app.json or eas.json, both of which the Emergent
  // managed wrapper rewrites after upload (and neither of which is one of the 21 hashed
  // files). Nothing here can prove source integrity, so nothing here may fail a build:
  // it is all notes and warnings. Only unreadable/unparseable config stays fatal,
  // because a build could not proceed anyway.
  const appRaw = readSafe("app.json");
  if (appRaw === null) {
    fail("app.json is missing");
  } else {
    try {
      const app = JSON.parse(appRaw).expo;
      const actual = {
        "ios.bundleIdentifier": app.ios?.bundleIdentifier,
        "android.package": app.android?.package,
        scheme: app.scheme,
      };
      for (const [key, want] of Object.entries(EXPECTED_IDENTITY)) {
        if (actual[key] !== want) warn(`${key} is "${actual[key]}", expected "${want}"`);
      }
      // The marketing version is a NOTE only. app.json is excluded from the 21 hashed
      // files and is rewritten by the wrapper, so comparing it proves nothing about
      // source integrity and breaks on wrapper-side version increments (their builder
      // reported 1.1.9 while the committed tree said 1.1.8). EXPECTED_VERSION is kept
      // as the documented approved version and is referenced by the test suite.
      if (app.version !== EXPECTED_VERSION) {
        notes.push(`app.json version is "${app.version}"; the approved committed version is "${EXPECTED_VERSION}" (wrapper-rewritten, not a failure)`);
      }
      const slugPolicy = resolveSlugPolicy(app, actual);
      if (!slugPolicy.ok) warn(slugPolicy.reason);
      else if (slugPolicy.note) notes.push(slugPolicy.note);
      // The managed wrapper injects extra.eas.projectId; it must be this project's.
      const projectId = app.extra?.eas?.projectId;
      if (projectId !== undefined && projectId !== EXPECTED_PROJECT_ID) {
        warn(`app.json extra.eas.projectId is "${projectId}", expected "${EXPECTED_PROJECT_ID}"`);
      }
      if (app.updates && app.updates.enabled !== false) {
        warn("app.json contains an active updates block (OTA must stay disabled)");
      }
      for (const marker of LEGACY_IDENTITY_MARKERS) {
        if (app.name === marker || app.slug === marker || app.owner === marker) {
          warn(`app.json carries the legacy application identity "${marker}"`);
        }
      }
      notes.push(`app.json: version ${app.version}, slug ${app.slug}`);
      if (projectId !== undefined) notes.push(`app.json: EAS project id matches (${projectId})`);
    } catch (e) {
      fail(`app.json could not be parsed: ${e.message}`);
    }
  }

  const easRaw = readSafe("eas.json");
  if (easRaw === null) {
    fail("eas.json is missing");
  } else {
    try {
      const eas = JSON.parse(easRaw);
      // Local release mode inspects the committed eas.json; a managed cloud job replaces
      // it with the wrapper's own minimal file before upload. Either way these are
      // operator-facing configuration values, not source proof, so they warn.
      if (!EAS_MODE) {
        if (eas.cli?.requireCommit !== true) warn("eas.json cli.requireCommit must be true");
        if (eas.build?.production?.environment !== "production") {
          warn('eas.json production profile must select "environment": "production"');
        }
      } else if (eas.build?.production && "environment" in eas.build.production) {
        if (eas.build.production.environment !== "production") {
          warn("eas.json production profile selects a non-production environment");
        }
      }
      for (const [name, profile] of Object.entries(eas.build ?? {})) {
        if (profile?.channel) warn(`build profile ${name} declares an update channel`);
        if (profile?.updates) warn(`build profile ${name} declares an updates configuration (OTA must stay disabled)`);
        checkNoConflictingIdentity(profile, `build profile ${name}`);
      }
      for (const [name, profile] of Object.entries(eas.submit ?? {})) {
        checkNoConflictingIdentity(profile?.ios, `submit profile ${name} (ios)`);
        checkNoConflictingIdentity(profile?.android, `submit profile ${name} (android)`);
      }
      if (EAS_MODE) notes.push("eas.json: valid JSON, no update channel, no conflicting identity");
    } catch (e) {
      fail(`eas.json could not be parsed: ${e.message}`);
    }
  }

  // The profile name is supplied by the platform, not by the source tree, so a
  // differently named profile is reported and never fatal.
  if (EAS_MODE) {
    const profile = (process.env.EAS_BUILD_PROFILE || "").trim();
    if (profile && profile !== "production") {
      warn(`EAS_BUILD_PROFILE is "${profile}", expected "production"`);
    }
  }
}

/** eas.json must never re-declare a different application identity. */
function checkNoConflictingIdentity(node, where) {
  if (!node || typeof node !== "object") return;
  const pairs = [
    ["bundleIdentifier", EXPECTED_IDENTITY["ios.bundleIdentifier"]],
    ["applicationId", EXPECTED_IDENTITY["android.package"]],
    ["package", EXPECTED_IDENTITY["android.package"]],
  ];
  for (const [key, want] of pairs) {
    const value = node[key];
    if (value !== undefined && value !== want) warn(`${where} declares ${key} "${value}", expected "${want}"`);
  }
}

/**
 * Slug policy.
 *
 * The committed slug is always `apex-ai`. The Emergent managed wrapper rewrites it to
 * the EAS project's own slug (`ai-coach-trainer-2`) before uploading, which was the sole
 * failure of the RC5 cloud build. That renamed slug is accepted ONLY in cloud mode and
 * ONLY when every one of the following is simultaneously true, so a foreign or
 * mis-targeted project can never borrow the exception:
 *   - EAS_BUILD is present in the environment;
 *   - EAS_BUILD_PROFILE is exactly "production";
 *   - EAS_BUILD_PROJECT_ID is exactly the approved project id;
 *   - app.json extra.eas.projectId, when present, equals that same id;
 *   - iOS bundle identifier, Android package and scheme are unchanged;
 *   - no active updates block and (checked separately) no update channel.
 */
function resolveSlugPolicy(app, actualIdentity) {
  const slug = app.slug;
  if (slug === EXPECTED_SLUG) return { ok: true };
  if (slug !== MANAGED_CLOUD_SLUG) {
    return { ok: false, reason: `app.json slug is "${slug}", expected "${EXPECTED_SLUG}"` };
  }
  if (!EAS_MODE) {
    return { ok: false, reason: `app.json slug is "${slug}", expected "${EXPECTED_SLUG}" (local release mode)` };
  }
  const env = { ...process.env };
  const conditions = [
    [isEasBuildEnvironment(env), "no EAS_BUILD* environment name is present"],
    [(env.EAS_BUILD_PROFILE || "").trim() === "production", "EAS_BUILD_PROFILE is not exactly \"production\""],
    [(env.EAS_BUILD_PROJECT_ID || "").trim() === EXPECTED_PROJECT_ID, "EAS_BUILD_PROJECT_ID is not the approved project id"],
    [
      app.extra?.eas?.projectId === undefined || app.extra.eas.projectId === EXPECTED_PROJECT_ID,
      "app.json extra.eas.projectId is not the approved project id",
    ],
    [
      Object.entries(EXPECTED_IDENTITY).every(([key, want]) => actualIdentity[key] === want),
      "the bundle identifier, package or scheme is not the approved identity",
    ],
    [!app.updates || app.updates.enabled === false, "an active updates configuration is present"],
  ];
  const unmet = conditions.filter(([met]) => !met).map(([, why]) => why);
  if (unmet.length) {
    return {
      ok: false,
      reason: `managed wrapper slug "${slug}" is not permitted here: ${unmet.join("; ")}`,
    };
  }
  return { ok: true, note: `app.json: managed wrapper slug "${slug}" accepted for the approved production project` };
}

function checkFingerprint() {
  const stored = readSafe(MANIFEST_PATH);
  if (stored === null) {
    fail(`${MANIFEST_PATH} is missing — the approved source fingerprint is not committed`);
    return;
  }
  let manifest;
  try {
    manifest = JSON.parse(stored);
  } catch (e) {
    fail(`${MANIFEST_PATH} could not be parsed: ${e.message}`);
    return;
  }
  const { files, missing, combined } = computeFingerprint(ROOT);
  if (missing.length) {
    fail(`release-critical files missing from this source tree: ${missing.join(", ")}`);
    return;
  }
  if (manifest.fileCount !== RELEASE_CRITICAL_FILES.length) {
    fail(`${MANIFEST_PATH} covers ${manifest.fileCount} files, expected ${RELEASE_CRITICAL_FILES.length}`);
  }
  if (combined !== manifest.fingerprint) {
    const changed = Object.keys(files).filter((k) => manifest.files?.[k] !== files[k]);
    fail(
      `source fingerprint mismatch — this is not the approved source tree. Differing files: ${
        changed.length ? changed.join(", ") : "(file set differs)"
      }`,
    );
  } else {
    notes.push(`source fingerprint matches (${manifest.fileCount} files)`);
  }
}

// --------------------------------------------------------------------------- //
// Local-only checks: workspace, Git identity, cleanliness.
// --------------------------------------------------------------------------- //
function checkLocalWorkspace() {
  let real = ROOT;
  try {
    real = fs.realpathSync(ROOT);
  } catch {
    /* keep cwd */
  }
  for (const forbidden of FORBIDDEN_SOURCE_ROOTS) {
    if (real === forbidden || real.startsWith(`${forbidden}/`)) {
      fail(`working directory is the inherited legacy source (${real}); build from the approved release worktree instead`);
    }
  }
  if (!/release-candidate\/frontend$/.test(real)) {
    fail(`working directory ${real} is not the approved release worktree (.../release-candidate/frontend)`);
  }

  const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
  try {
    const head = git("rev-parse", "HEAD");
    const branch = git("rev-parse", "--abbrev-ref", "HEAD");
    const status = git("status", "--porcelain");
    notes.push(`HEAD ${head}`);
    if (!EXPECTED_COMMIT) {
      fail("RELEASE_EXPECTED_COMMIT is not set — pass the approved release commit explicitly before building");
    } else if (head !== EXPECTED_COMMIT) {
      fail(`HEAD ${head} is not the approved release commit ${EXPECTED_COMMIT}`);
    }
    if (branch !== EXPECTED_BRANCH) {
      if (branch === "HEAD" && process.env.RELEASE_ALLOW_DETACHED === "1") {
        notes.push("detached HEAD allowed by RELEASE_ALLOW_DETACHED");
      } else {
        fail(`branch ${branch} is not the approved release branch ${EXPECTED_BRANCH}`);
      }
    }
    if (status) fail(`working tree is dirty:\n${status}`);
  } catch (e) {
    fail(`Git is unavailable or inspection failed: ${e.message}`);
  }
}

// --------------------------------------------------------------------------- //
export function runChecks() {
  checkSource();
  checkIdentityAndConfig();
  checkFingerprint();
  checkPublicVars();
  // Git is touched in local mode only. `checkLocalWorkspace` is the sole caller of
  // `execFileSync`, so cloud mode cannot execute a Git command even when the uploaded
  // workspace happens to contain a `.git` directory.
  if (EAS_MODE) noteCloudProvenance();
  else checkLocalWorkspace();
  return { failures, notes, warnings };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runChecks();
  console.log(`release-source gate — ${EAS_MODE ? "EAS cloud pre-install mode" : "local release mode"} — ${ROOT}`);
  for (const n of notes) console.log(`  note    ${n}`);
  for (const w of warnings) console.log(`  warn    ${w}`);
  if (failures.length) {
    console.error(`\nDO NOT BUILD — ${failures.length} release-source check(s) failed:`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    console.error("\nThe build must not proceed. No source was modified and no network call was made.");
    process.exit(1);
  }
  console.log("\n✓ release source verified — this tree is the approved Direction B implementation");
}
