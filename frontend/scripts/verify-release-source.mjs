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
 *     never touches node_modules. It assumes nothing about the absolute path,
 *     branch names or .git metadata; instead it verifies the committed source
 *     fingerprint, the Direction B source markers, application identity and the
 *     presence of the required public build variables.
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

const EAS_MODE = process.argv.includes("--eas-pre-install") || process.env.EAS_BUILD === "true";
const ROOT = process.cwd();
// The approved commit is supplied by the release operator, never hardcoded: a
// hardcoded sha inside a release-critical file can only ever be stale (and would
// invalidate its own fingerprint the moment it were updated).
const EXPECTED_COMMIT = (process.env.RELEASE_EXPECTED_COMMIT || "").trim();
const EXPECTED_BRANCH = process.env.RELEASE_EXPECTED_BRANCH || "release/direction-b-testflight-rc";
const FORBIDDEN_SOURCE_ROOTS = ["/app/frontend"];

/** Required public build variables. Names only — values are never read out or printed. */
export const REQUIRED_PUBLIC_VARS = ["EXPO_PUBLIC_BACKEND_URL", "EXPO_PUBLIC_REVENUECAT_IOS_KEY"];

const EXPECTED_IDENTITY = {
  "ios.bundleIdentifier": "com.mazidigroup.apexai",
  "android.package": "com.mazidigroup.apexai",
  scheme: "apexai",
};

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
const fail = (m) => failures.push(m);
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
  if (/(^|[.-])(staging|stage|dev|test|preview|sandbox)([.-]|$)/.test(host) || host.includes("ngrok")) {
    return { ok: false, reason: "non-production host" };
  }
  // Redacted host is safe to surface; the full URL and any path never is.
  const redacted = host.replace(/^([^.]{1,3})[^.]*/, "$1***");
  return { ok: true, redactedHost: redacted };
}

export function validatePublicSdkKey(rawValue) {
  const value = typeof rawValue === "string" ? rawValue.trim() : "";
  if (!value) return { ok: false, reason: "missing or blank" };
  // Public SDK key: shape only, and it is NOT treated as a server secret.
  if (value.length < 20 || /\s/.test(value)) return { ok: false, reason: "implausible shape" };
  return { ok: true };
}

function checkPublicVars() {
  for (const name of REQUIRED_PUBLIC_VARS) {
    const present = Object.prototype.hasOwnProperty.call(process.env, name);
    if (!present) {
      fail(`required build variable ${name} is not available to this environment (value never printed)`);
      continue;
    }
    const result =
      name === "EXPO_PUBLIC_BACKEND_URL" ? validateBackendUrl(process.env[name]) : validatePublicSdkKey(process.env[name]);
    if (!result.ok) {
      fail(`build variable ${name} failed validation: ${result.reason} (value never printed)`);
    } else {
      notes.push(
        name === "EXPO_PUBLIC_BACKEND_URL"
          ? `${name} present, absolute HTTPS, host ${result.redactedHost}`
          : `${name} present, shape accepted`,
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
        if (actual[key] !== want) fail(`${key} is "${actual[key]}", expected "${want}"`);
      }
      if (app.updates) fail("app.json contains an updates block (OTA must stay disabled)");
      notes.push(`app.json: version ${app.version}, slug ${app.slug}`);
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
      if (eas.cli?.requireCommit !== true) fail("eas.json cli.requireCommit must be true");
      if (eas.build?.production?.environment !== "production") {
        fail('eas.json production profile must select "environment": "production"');
      }
      for (const [name, profile] of Object.entries(eas.build ?? {})) {
        if (profile?.channel) fail(`build profile ${name} declares an update channel`);
      }
    } catch (e) {
      fail(`eas.json could not be parsed: ${e.message}`);
    }
  }
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
  if (!EAS_MODE) checkLocalWorkspace();
  return { failures, notes };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runChecks();
  console.log(`release-source gate — ${EAS_MODE ? "EAS cloud pre-install mode" : "local release mode"} — ${ROOT}`);
  for (const n of notes) console.log(`  note    ${n}`);
  if (failures.length) {
    console.error(`\nDO NOT BUILD — ${failures.length} release-source check(s) failed:`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    console.error("\nThe build must not proceed. No source was modified and no network call was made.");
    process.exit(1);
  }
  console.log("\n✓ release source verified — this tree is the approved Direction B implementation");
}
