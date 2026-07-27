// Cloud release gate must be Gitless.
//
// The RC3 EAS build failed in PRE_INSTALL_HOOK because the uploaded cloud workspace is
// not a usable Git repository. These tests run the committed gate inside a temporary
// copy that provably has no `.git`, with a PATH shim that records and rejects any `git`
// invocation, so a Git dependency can never be reintroduced into cloud mode. Local mode
// keeps its Git, branch, commit and clean-tree checks and is exercised separately.
//
// Node built-ins only — no test dependency is added and no lockfile changes.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const ROOT = process.env.MMA_TEST_ROOT as string;
const GATE = "scripts/verify-release-source.mjs";

// Enough of the tree for every cloud check: identity, markers, fingerprint, manifest,
// the pre-install chain and the guarded routes.
const COPY_FILES = ["app.json", "eas.json", "yarn.lock", "release-source.manifest.json", "package.json"];
const COPY_DIRS = ["app", "src", "scripts"];

// Values that exist only to exercise the validators. They are NOT production values and
// prove nothing about the real EAS environment, which stays unverified until a cloud build.
const VALIDATOR_ONLY_ENV = {
  EXPO_PUBLIC_BACKEND_URL: "https://api.musclemapai-validator-only.example",
  EXPO_PUBLIC_REVENUECAT_IOS_KEY: "appl_ValidatorOnlyNotARealKey0000",
};

function makeGitlessCopy(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rc4-gitless-"));
  for (const rel of COPY_FILES) fs.copyFileSync(path.join(ROOT, rel), path.join(dir, rel));
  for (const rel of COPY_DIRS) fs.cpSync(path.join(ROOT, rel), path.join(dir, rel), { recursive: true });
  assert.ok(!fs.existsSync(path.join(dir, ".git")), "the temporary workspace has no .git");
  return dir;
}

/** A `git` on PATH that records every invocation and always fails, like the cloud does. */
function makeGitShim(): { dir: string; log: string; invocations: () => string[] } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rc4-gitshim-"));
  const log = path.join(dir, "git-invocations.log");
  fs.writeFileSync(path.join(dir, "git"), `#!/bin/sh\necho "GIT INVOKED: $*" >> "${log}"\nexit 128\n`);
  fs.chmodSync(path.join(dir, "git"), 0o755);
  return {
    dir,
    log,
    invocations: () => (fs.existsSync(log) ? fs.readFileSync(log, "utf8").split("\n").filter(Boolean) : []),
  };
}

function cloudEnv(extra: Record<string, string> = {}, shimDir?: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extra };
  for (const name of ["EXPO_PUBLIC_BACKEND_URL", "EXPO_PUBLIC_REVENUECAT_IOS_KEY"]) {
    if (!(name in extra)) delete env[name];
  }
  // Cloud provenance names must never be required; none is injected here.
  for (const name of Object.keys(env)) if (name.startsWith("EAS_BUILD")) delete env[name];
  if (shimDir) env.PATH = `${shimDir}${path.delimiter}${env.PATH ?? ""}`;
  return env;
}

function runGate(cwd: string, args: string[], env: NodeJS.ProcessEnv) {
  const res = spawnSync(process.execPath, [GATE, ...args], { cwd, env, encoding: "utf8" });
  return { status: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "", all: `${res.stdout}${res.stderr}` };
}

const GIT_SYMPTOMS = [
  "git rev-parse",
  "show-toplevel",
  "Git is unavailable",
  "not the approved release worktree",
  "inherited legacy source",
  "is not the approved release branch",
  "RELEASE_EXPECTED_COMMIT is not set",
  "working tree is dirty",
];

// --- A. the real missing-variable result, with no Git available ----------------

test("A — cloud mode in a Gitless workspace fails only on the two required build variables", () => {
  const dir = makeGitlessCopy();
  const shim = makeGitShim();
  const res = runGate(dir, ["--eas-pre-install"], cloudEnv({}, shim.dir));

  assert.equal(res.status, 1, "the gate fails closed");
  assert.match(res.stdout, /EAS cloud pre-install mode/);
  assert.match(res.stdout, /source fingerprint matches \(21 files\)/);
  assert.match(res.stdout, /Git metadata is not consulted in cloud mode/);
  assert.match(res.stdout, /no EAS_BUILD\* provenance name was supplied \(not required\)/);
  for (const symptom of GIT_SYMPTOMS) {
    assert.ok(!res.all.includes(symptom), `no Git-derived failure: ${symptom}`);
  }
  assert.match(res.stderr, /DO NOT BUILD — 2 release-source check\(s\) failed/);
  assert.match(res.stderr, /EXPO_PUBLIC_BACKEND_URL is not available/);
  assert.match(res.stderr, /EXPO_PUBLIC_REVENUECAT_IOS_KEY is not available/);
  assert.deepEqual(shim.invocations(), [], "no Git process was invoked");
  fs.rmSync(dir, { recursive: true, force: true });
});

// --- B. validator-only inputs: the source contract itself passes ---------------

test("B — cloud mode passes with validator-only variables and never invokes Git", () => {
  const dir = makeGitlessCopy();
  const shim = makeGitShim();
  const res = runGate(dir, ["--eas-pre-install"], cloudEnv(VALIDATOR_ONLY_ENV, shim.dir));

  assert.equal(res.status, 0, res.all);
  assert.match(res.stdout, /source fingerprint matches \(21 files\)/);
  assert.match(res.stdout, /✓ release source verified/);
  assert.ok(!res.stdout.includes(VALIDATOR_ONLY_ENV.EXPO_PUBLIC_BACKEND_URL), "the URL is never echoed in full");
  assert.ok(!res.all.includes(VALIDATOR_ONLY_ENV.EXPO_PUBLIC_REVENUECAT_IOS_KEY), "the SDK key is never echoed");
  for (const symptom of GIT_SYMPTOMS) assert.ok(!res.all.includes(symptom), `no Git symptom: ${symptom}`);
  assert.deepEqual(shim.invocations(), [], "no Git process was invoked");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("B2 — EAS provenance names are reported when present and required when absent", async () => {
  const { isEasBuildEnvironment, EAS_PROVENANCE_VARS } = await import(path.join(ROOT, GATE));
  assert.equal(isEasBuildEnvironment({ EAS_BUILD_ID: "x" }), true, "any EAS_BUILD* name selects cloud mode");
  assert.equal(isEasBuildEnvironment({}), false, "a plain shell stays in local mode");
  assert.deepEqual(EAS_PROVENANCE_VARS, [
    "EAS_BUILD_ID",
    "EAS_BUILD_PROFILE",
    "EAS_BUILD_PROJECT_ID",
    "EAS_BUILD_GIT_COMMIT_HASH",
    "EAS_BUILD_WORKINGDIR",
  ]);

  const dir = makeGitlessCopy();
  const shim = makeGitShim();
  // No --eas-pre-install flag: the EAS_BUILD* name alone must keep the job out of the
  // Git-dependent local mode.
  const env = cloudEnv(VALIDATOR_ONLY_ENV, shim.dir);
  env.EAS_BUILD_ID = "00000000-0000-4000-8000-000000000000";
  env.EAS_BUILD_PROFILE = "production";
  const res = runGate(dir, [], env);

  assert.equal(res.status, 0, res.all);
  assert.match(res.stdout, /EAS cloud pre-install mode/);
  assert.match(res.stdout, /EAS_BUILD_ID 00000000-0000-4000-8000-000000000000/);
  assert.match(res.stdout, /EAS_BUILD_PROFILE production/);
  assert.deepEqual(shim.invocations(), [], "no Git process was invoked");
  fs.rmSync(dir, { recursive: true, force: true });
});

// --- C. tamper protection stays intact without Git ----------------------------

test("C — a changed lockfile, a changed guarded route or a removed file fails the cloud gate", () => {
  const shim = makeGitShim();

  const lock = makeGitlessCopy();
  fs.appendFileSync(path.join(lock, "yarn.lock"), "\n");
  const lockRes = runGate(lock, ["--eas-pre-install"], cloudEnv(VALIDATOR_ONLY_ENV, shim.dir));
  assert.equal(lockRes.status, 1, "a one-byte lockfile change fails");
  assert.match(lockRes.stderr, /source fingerprint mismatch[\s\S]*yarn\.lock/);

  const route = makeGitlessCopy();
  const routeRel = "app/dev/paywall-states.tsx";
  fs.writeFileSync(
    path.join(route, routeRel),
    fs.readFileSync(path.join(route, routeRel), "utf8").replace("if (!__DEV__)", "if (false)"),
  );
  const routeRes = runGate(route, ["--eas-pre-install"], cloudEnv(VALIDATOR_ONLY_ENV, shim.dir));
  assert.equal(routeRes.status, 1, "removing the production guard fails");
  assert.match(routeRes.stderr, /source fingerprint mismatch[\s\S]*app\/dev\/paywall-states\.tsx/);

  const removed = makeGitlessCopy();
  fs.rmSync(path.join(removed, "src/premium/Paywall.tsx"));
  const removedRes = runGate(removed, ["--eas-pre-install"], cloudEnv(VALIDATOR_ONLY_ENV, shim.dir));
  assert.equal(removedRes.status, 1, "a missing release-critical file fails");
  assert.match(removedRes.stderr, /release-critical files missing from this source tree/);

  assert.deepEqual(shim.invocations(), [], "no Git process was invoked in any tamper case");
  for (const dir of [lock, route, removed]) fs.rmSync(dir, { recursive: true, force: true });
});

// --- D. local mode keeps its Git checks ---------------------------------------

test("D — local mode still consults Git, branch, commit and cleanliness", () => {
  const git = (...args: string[]) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
  const head = git("rev-parse", "HEAD");
  const branch = git("rev-parse", "--abbrev-ref", "HEAD");
  const env = cloudEnv({
    ...VALIDATOR_ONLY_ENV,
    RELEASE_EXPECTED_COMMIT: head,
    RELEASE_EXPECTED_BRANCH: branch,
  });
  const res = runGate(ROOT, [], env);

  assert.match(res.stdout, /local release mode/, "no flag and no EAS_BUILD* name means local mode");
  assert.match(res.stdout, new RegExp(`HEAD ${head}`), "local mode read HEAD from Git");
  assert.ok(!res.stdout.includes("Git metadata is not consulted"), "the cloud note is local-mode-free");
  if (git("status", "--porcelain") === "") {
    assert.equal(res.status, 0, res.all);
  } else {
    // Before the release commit the worktree is dirty by design; that must be the only
    // failure, which itself proves the local clean-tree check still runs.
    assert.equal(res.status, 1);
    assert.match(res.stderr, /DO NOT BUILD — 1 release-source check\(s\) failed/);
    assert.match(res.stderr, /working tree is dirty/);
  }

  // The Git-dependent checks must still be able to fail.
  const wrong = runGate(ROOT, [], { ...env, RELEASE_EXPECTED_COMMIT: "0".repeat(40) });
  assert.equal(wrong.status, 1, "a wrong expected commit still fails locally");
  assert.match(wrong.stderr, /is not the approved release commit/);
  const unpinned: NodeJS.ProcessEnv = { ...env };
  delete unpinned.RELEASE_EXPECTED_COMMIT;
  const loose = runGate(ROOT, [], unpinned);
  assert.equal(loose.status, 1, "an unpinned tree is still refused locally");
  assert.match(loose.stderr, /RELEASE_EXPECTED_COMMIT is not set/);
});

// --- E. the exact committed pre-install chain ---------------------------------

test("E — the committed eas-build-pre-install chain completes without Git", () => {
  const dir = makeGitlessCopy();
  const shim = makeGitShim();
  const command = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).scripts[
    "eas-build-pre-install"
  ] as string;
  assert.equal(
    command,
    "node ./scripts/verify-release-source.mjs --eas-pre-install && ./scripts/cmd-guard.js --preinstall",
    "the chain under test is the committed one",
  );
  const res = spawnSync("sh", ["-c", command], {
    cwd: dir,
    env: cloudEnv(VALIDATOR_ONLY_ENV, shim.dir),
    encoding: "utf8",
  });
  assert.equal(res.status, 0, `${res.stdout}${res.stderr}`);
  assert.match(res.stdout, /✓ release source verified/);
  assert.deepEqual(shim.invocations(), [], "neither the gate nor cmd-guard invoked Git");
  fs.rmSync(dir, { recursive: true, force: true });
});
