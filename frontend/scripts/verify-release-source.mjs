#!/usr/bin/env node
/**
 * Release-source verification gate.
 *
 * Run this from the release-candidate frontend IMMEDIATELY BEFORE any build.
 * It fails loudly when the build would be produced from the wrong source — the
 * exact failure that produced the rejected release candidate, which was built
 * from the inherited legacy worktree (/app/frontend) instead of the accepted
 * Direction B implementation.
 *
 *   node scripts/verify-release-source.mjs
 *
 * Optional overrides (no secrets, no network, no new dependency):
 *   RELEASE_EXPECTED_COMMIT   default 54ba23644c938917db1af6e65592b6ec4578edae
 *   RELEASE_EXPECTED_BRANCH   default release/direction-b-testflight-rc
 *   RELEASE_ALLOW_DETACHED    "1" to allow a detached HEAD at the expected commit
 *
 * Exit code 0 = safe to build. Non-zero = do NOT build.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const FRONTEND = process.cwd();
const EXPECTED_COMMIT = process.env.RELEASE_EXPECTED_COMMIT || "54ba23644c938917db1af6e65592b6ec4578edae";
const EXPECTED_BRANCH = process.env.RELEASE_EXPECTED_BRANCH || "release/direction-b-testflight-rc";
const FORBIDDEN_SOURCE_ROOTS = ["/app/frontend"];

const failures = [];
const notes = [];
const fail = (m) => failures.push(m);
const git = (...args) => execFileSync("git", args, { cwd: FRONTEND, encoding: "utf8" }).trim();
const read = (rel) => fs.readFileSync(path.join(FRONTEND, rel), "utf8");

// 1 — the build must not run from the inherited legacy worktree.
const real = fs.realpathSync(FRONTEND);
for (const forbidden of FORBIDDEN_SOURCE_ROOTS) {
  if (real === forbidden || real.startsWith(`${forbidden}/`)) {
    fail(`working directory is the inherited legacy source (${real}); build from the approved release worktree instead`);
  }
}
if (!/release-candidate\/frontend$/.test(real)) {
  fail(`working directory ${real} is not the approved release worktree (.../release-candidate/frontend)`);
}

// 2 — Git identity: expected branch, expected commit, clean tree.
let head = "";
try {
  head = git("rev-parse", "HEAD");
  const branch = git("rev-parse", "--abbrev-ref", "HEAD");
  const status = git("status", "--porcelain");
  if (head !== EXPECTED_COMMIT) fail(`HEAD ${head} is not the approved release commit ${EXPECTED_COMMIT}`);
  if (branch !== EXPECTED_BRANCH) {
    if (branch === "HEAD" && process.env.RELEASE_ALLOW_DETACHED === "1") notes.push("detached HEAD allowed by RELEASE_ALLOW_DETACHED");
    else fail(`branch ${branch} is not the approved release branch ${EXPECTED_BRANCH}`);
  }
  if (status) fail(`working tree is dirty:\n${status}`);
} catch (e) {
  fail(`git inspection failed: ${e.message}`);
}

// 3 — required Direction B source markers must be present.
const REQUIRED = [
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
for (const [marker, rel] of REQUIRED) {
  let src = "";
  try {
    src = read(rel);
  } catch {
    fail(`required file missing: ${rel}`);
    continue;
  }
  if (!src.includes(marker)) fail(`required Direction B marker missing: "${marker}" in ${rel}`);
}

// 4 — the legacy journey must not be active.
try {
  const onboarding = read("src/plan/onboarding.ts");
  const steps = onboarding.match(/ONBOARDING_STEPS = \[([^\]]*)\]/);
  const list = steps ? steps[1].replace(/["'\s]/g, "").split(",").filter(Boolean) : [];
  if (list.length !== 3 || list.join(",") !== "goal,days,equipment") {
    fail(`onboarding must be exactly goal,days,equipment — found ${list.join(",") || "nothing"}`);
  }
} catch {
  fail("src/plan/onboarding.ts is missing");
}

const LEGACY_COPY = [
  "Build my plan",
  "How much experience do you have",
  "Any regions you want to focus on",
  "How would you describe your posture",
];
const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(path.join(FRONTEND, dir), { withFileTypes: true })) {
    if (e.name === "node_modules") continue;
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel, out);
    else if (/\.(tsx?|jsx?)$/.test(e.name)) out.push(rel);
  }
  return out;
};
const sources = [...walk("app"), ...walk("src")];
for (const rel of sources) {
  const src = read(rel);
  for (const legacy of LEGACY_COPY) {
    if (src.includes(legacy)) fail(`legacy journey copy present: "${legacy}" in ${rel}`);
  }
  // "Shuffle" must never be an active Plan action (rendered text or label).
  if (/(?:>|["'`])\s*Shuffle\b|accessibilityLabel=["']Shuffle/.test(src)) {
    fail(`"Shuffle" is an active Plan action in ${rel}`);
  }
}

// 5 — owner-scoped storage must be the only write path.
try {
  const keys = read("src/owner/scopeKeys.ts");
  if (!keys.includes("mma.own.v1")) fail("owner-scoped storage prefix missing");
  for (const rel of ["src/plan/planStore.ts", "src/anatomy/workoutStore.tsx"]) {
    const src = read(rel);
    if (/["'](?:mma\.plan\.v1|anat\.workouts)["']/.test(src)) {
      fail(`legacy global storage key written by ${rel}`);
    }
  }
} catch (e) {
  fail(`storage inspection failed: ${e.message}`);
}

// 6 — application identity must be exactly what was approved.
const EXPECTED_IDENTITY = {
  "ios.bundleIdentifier": "com.mazidigroup.apexai",
  "android.package": "com.mazidigroup.apexai",
  scheme: "apexai",
};
try {
  const app = JSON.parse(read("app.json")).expo;
  const actual = {
    "ios.bundleIdentifier": app.ios?.bundleIdentifier,
    "android.package": app.android?.package,
    scheme: app.scheme,
  };
  for (const [key, want] of Object.entries(EXPECTED_IDENTITY)) {
    if (actual[key] !== want) fail(`${key} is "${actual[key]}", expected "${want}"`);
  }
  if (app.updates) fail("app.json contains an updates block (OTA must stay disabled)");
  notes.push(`app.json: version ${app.version}, slug ${app.slug}, buildNumber ${app.ios?.buildNumber}, versionCode ${app.android?.versionCode}`);
  notes.push(
    app.extra?.eas?.projectId
      ? "app.json declares an EAS projectId — confirm it matches the approved EAS project"
      : "app.json declares no EAS projectId — the build service supplies the project linkage; a human must confirm it",
  );
} catch (e) {
  fail(`app.json inspection failed: ${e.message}`);
}

// ---------------------------------------------------------------------------
console.log(`release-source gate — ${real}`);
console.log(`  HEAD    ${head || "unknown"}`);
for (const n of notes) console.log(`  note    ${n}`);
if (failures.length) {
  console.error(`\nDO NOT BUILD — ${failures.length} release-source check(s) failed:`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log("\n✓ release source verified — this worktree is the approved Direction B implementation");
