#!/usr/bin/env node
/**
 * Generates the release-source fingerprint manifest.
 *
 *   node scripts/generate-release-manifest.mjs
 *
 * The manifest records a SHA-256 for each release-critical file plus a combined
 * fingerprint. `verify-release-source.mjs` recomputes it during an EAS cloud build,
 * where Git metadata and branch names are not guaranteed, so packaging a different
 * source tree (for example the legacy /app/frontend) is detected.
 *
 * The manifest file itself is EXCLUDED from the hashed set, so storing the result
 * can never invalidate the fingerprint recursively.
 *
 * Node built-ins only: this must run before dependencies are installed.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const MANIFEST_PATH = "release-source.manifest.json";

/**
 * Documented set of release-critical files. Chosen so that any swap to a legacy or
 * unapproved source tree changes at least one entry, while ordinary evidence churn
 * does not.
 *
 * `yarn.lock` is included deliberately: the dependency graph is part of what ships,
 * so a substituted or stale lockfile must fail the gate in the build job, before any
 * dependency is installed. An intentional lockfile change therefore requires this
 * manifest to be regenerated and committed with it.
 */
export const RELEASE_CRITICAL_FILES = [
  "app.json",
  "eas.json",
  "yarn.lock",
  "app/_layout.tsx",
  "app/(tabs)/_layout.tsx",
  "app/(tabs)/library.tsx",
  "app/(tabs)/workout.tsx",
  "app/(tabs)/plan.tsx",
  "src/plan/onboarding.ts",
  "src/plan/OnboardingFlow.tsx",
  "src/plan/PlanViews.tsx",
  "src/owner/scopeKeys.ts",
  "src/history/metrics.ts",
  "src/history/HistoryView.tsx",
  "src/premium/entitlement.ts",
  "src/premium/PremiumGate.tsx",
  "src/premium/Paywall.tsx",
  "src/anatomy/workoutScope.ts",
  "src/anatomy/workoutStore.tsx",
  "src/auth/AuthContext.tsx",
  "src/ui/RootErrorBoundary.tsx",
  "scripts/verify-release-source.mjs",
];

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

export function computeFingerprint(root) {
  const files = {};
  const missing = [];
  for (const rel of RELEASE_CRITICAL_FILES) {
    const abs = path.join(root, rel);
    try {
      files[rel] = sha256(fs.readFileSync(abs));
    } catch {
      missing.push(rel);
    }
  }
  const combined = sha256(
    Object.keys(files)
      .sort()
      .map((k) => `${k}:${files[k]}`)
      .join("\n"),
  );
  return { files, missing, combined };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = process.cwd();
  const { files, missing, combined } = computeFingerprint(root);
  if (missing.length) {
    console.error(`cannot generate manifest — missing release-critical files:\n  ${missing.join("\n  ")}`);
    process.exit(1);
  }
  const manifest = {
    note: "Release-source fingerprint. Regenerate with `yarn release:manifest` after an approved source change. Contains no secret or environment value.",
    algorithm: "sha256",
    fileCount: Object.keys(files).length,
    fingerprint: combined,
    files,
  };
  fs.writeFileSync(path.join(root, MANIFEST_PATH), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`wrote ${MANIFEST_PATH} — ${manifest.fileCount} files, fingerprint ${combined}`);
}
