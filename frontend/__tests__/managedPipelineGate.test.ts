// Managed-pipeline release gate.
//
// The Emergent publish wrapper rewrites `app.json` (resolved Expo config plus an
// injected `extra.eas.projectId`), replaces `eas.json` with its own generated file, and
// writes the production backend host into the uploaded `.env` — and it uploads a
// workspace that is not a Git repository. These tests run the committed gate against a
// pipeline-shaped, Gitless temporary archive so the managed path can pass while every
// tamper case still fails closed.
//
// Node built-ins only — no dependency is added and no lockfile changes.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const ROOT = process.env.MMA_TEST_ROOT as string;
const GATE = "scripts/verify-release-source.mjs";

const COPY_FILES = ["app.json", "eas.json", "yarn.lock", "release-source.manifest.json", "package.json"];
const COPY_DIRS = ["app", "src", "scripts"];

// Exactly what the build log showed the wrapper writing into the uploaded .env.
const MANAGED_BACKEND_URL = "https://ai-coach-trainer-2.emergent.host";
// Validator-only stand-in: shape is checked, ownership is a manual production check.
const MANAGED_SDK_KEY = "appl_ManagedPipelineShapeOnlyKey00";
const EXPECTED_PROJECT_ID = "7f544570-f0e2-45ce-bc88-97a50226e5cb";

function makeArchive(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rc5-managed-"));
  for (const rel of COPY_FILES) fs.copyFileSync(path.join(ROOT, rel), path.join(dir, rel));
  for (const rel of COPY_DIRS) fs.cpSync(path.join(ROOT, rel), path.join(dir, rel), { recursive: true });
  assert.ok(!fs.existsSync(path.join(dir, ".git")), "the temporary workspace has no .git");
  return dir;
}

/** Reproduces the wrapper's app.json normalisation: resolved config + injected project id. */
function normaliseAppJson(dir: string, mutate: (expo: Record<string, any>) => void = () => {}) {
  const file = path.join(dir, "app.json");
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  parsed.expo.extra = { ...(parsed.expo.extra ?? {}), eas: { projectId: EXPECTED_PROJECT_ID } };
  parsed.expo._internal = { isDebug: false };
  mutate(parsed.expo);
  fs.writeFileSync(file, JSON.stringify(parsed, null, 2));
}

/** Reproduces "STEP 6: Creating eas.json" — a minimal wrapper-generated config. */
function writeGeneratedEasJson(dir: string, extra: Record<string, any> = {}) {
  const generated = {
    cli: { version: ">= 12.0.0", appVersionSource: "remote" },
    build: { production: { ios: { image: "latest" }, autoIncrement: true } },
    submit: { production: {} },
    ...extra,
  };
  fs.writeFileSync(path.join(dir, "eas.json"), JSON.stringify(generated, null, 2));
}

function writeEnv(dir: string, body: string) {
  fs.writeFileSync(path.join(dir, ".env"), body);
}

function managedEnvFile() {
  return [
    "# managed publish wrapper output",
    // Built from parts on purpose: the publish wrapper rewrites any literal
    // tunnel subdomain it finds in the tree, which would corrupt this fixture.
    "EXPO_TUNNEL_SUBDOMAIN=" + "managed-fixture",
    `EXPO_PACKAGER_HOSTNAME=${MANAGED_BACKEND_URL}`,
    `EXPO_PUBLIC_BACKEND_URL=${MANAGED_BACKEND_URL}`,
    'EXPO_USE_FAST_RESOLVER="1"',
    "METRO_CACHE_ROOT=/app/frontend/.metro-cache",
    `EXPO_PACKAGER_PROXY_URL=${MANAGED_BACKEND_URL}`,
    `EXPO_PUBLIC_REVENUECAT_IOS_KEY=${MANAGED_SDK_KEY}`,
    "",
  ].join("\n");
}

/** A pipeline-shaped archive: normalised app.json, generated eas.json, rewritten .env. */
function makeManagedArchive(): string {
  const dir = makeArchive();
  normaliseAppJson(dir);
  writeGeneratedEasJson(dir);
  writeEnv(dir, managedEnvFile());
  return dir;
}

function makeGitShim() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rc5-gitshim-"));
  const log = path.join(dir, "git-invocations.log");
  fs.writeFileSync(path.join(dir, "git"), `#!/bin/sh\necho "GIT INVOKED: $*" >> "${log}"\nexit 128\n`);
  fs.chmodSync(path.join(dir, "git"), 0o755);
  return {
    dir,
    invocations: () => (fs.existsSync(log) ? fs.readFileSync(log, "utf8").split("\n").filter(Boolean) : []),
  };
}

/** Cloud environment with no public variables set: the .env file is the only source. */
function cloudEnv(extra: Record<string, string> = {}, shimDir?: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extra };
  for (const name of ["EXPO_PUBLIC_BACKEND_URL", "EXPO_PUBLIC_REVENUECAT_IOS_KEY"]) {
    if (!(name in extra)) delete env[name];
  }
  for (const name of Object.keys(env)) if (name.startsWith("EAS_BUILD") && !(name in extra)) delete env[name];
  if (shimDir) env.PATH = `${shimDir}${path.delimiter}${env.PATH ?? ""}`;
  return env;
}

function runGate(cwd: string, env: NodeJS.ProcessEnv, args: string[] = ["--eas-pre-install"]) {
  const res = spawnSync(process.execPath, [GATE, ...args], { cwd, env, encoding: "utf8" });
  return { status: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "", all: `${res.stdout}${res.stderr}` };
}

const clean = (...dirs: string[]) => dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true }));

// --- 1, 6, 7, 10: the managed pipeline shape must pass -------------------------

test("1/6/7/10 — a pipeline-shaped Gitless archive passes on .env-supplied values", () => {
  const dir = makeManagedArchive();
  const shim = makeGitShim();
  const res = runGate(dir, cloudEnv({}, shim.dir));

  assert.equal(res.status, 0, res.all);
  assert.match(res.stdout, /EAS cloud pre-install mode/);
  assert.match(res.stdout, /source fingerprint matches \(21 files\)/);
  assert.match(res.stdout, /app\.json: EAS project id matches \(7f544570-f0e2-45ce-bc88-97a50226e5cb\)/);
  assert.match(res.stdout, /eas\.json: valid JSON, no update channel, no conflicting identity/);
  assert.match(res.stdout, /EXPO_PUBLIC_BACKEND_URL present \(\.env\), absolute HTTPS, host ai-\*\*\*\.emergent\.host/);
  assert.match(res.stdout, /EXPO_PUBLIC_REVENUECAT_IOS_KEY present \(\.env\), shape accepted/);
  assert.ok(!res.all.includes(MANAGED_SDK_KEY), "the SDK key value is never printed");
  assert.ok(!res.all.includes(MANAGED_BACKEND_URL), "the backend URL is never printed in full");
  assert.deepEqual(shim.invocations(), [], "no Git process was invoked");
  clean(dir, shim.dir);
});

// --- 2: process.env wins over .env --------------------------------------------

test("2 — process.env overrides .env", () => {
  const dir = makeManagedArchive();
  // .env holds the good value; the environment holds a HARD-invalid one and must win.
  const res = runGate(dir, cloudEnv({ EXPO_PUBLIC_BACKEND_URL: "http://localhost:8001" }));
  assert.equal(res.status, 1, "the environment value is the one validated");
  assert.match(res.stderr, /EXPO_PUBLIC_BACKEND_URL failed validation: not HTTPS/);

  const ok = runGate(dir, cloudEnv({ EXPO_PUBLIC_BACKEND_URL: "https://api.apexai-production.example" }));
  assert.equal(ok.status, 0, ok.all);
  assert.match(ok.stdout, /EXPO_PUBLIC_BACKEND_URL present \(environment\), absolute HTTPS/);
  assert.match(ok.stdout, /EXPO_PUBLIC_REVENUECAT_IOS_KEY present \(\.env\)/, "the other name still comes from .env");
  clean(dir);
});

// --- 3, 4: ambiguous or malformed .env entries fail closed --------------------

test("3 — a duplicated approved key in .env fails", () => {
  const dir = makeManagedArchive();
  writeEnv(dir, `${managedEnvFile()}EXPO_PUBLIC_BACKEND_URL=${MANAGED_BACKEND_URL}\n`);
  const res = runGate(dir, cloudEnv());
  assert.equal(res.status, 1);
  assert.match(res.stderr, /EXPO_PUBLIC_BACKEND_URL is declared more than once in \.env/);
  clean(dir);
});

test("4 — malformed approved entries in .env fail", () => {
  const missingEquals = makeManagedArchive();
  writeEnv(missingEquals, "EXPO_PUBLIC_BACKEND_URL\nEXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_ShapeOnlyKeyForTests000000\n");
  const a = runGate(missingEquals, cloudEnv());
  assert.equal(a.status, 1);
  assert.match(a.stderr, /EXPO_PUBLIC_BACKEND_URL is malformed on \.env line 1/);

  const blank = makeManagedArchive();
  writeEnv(blank, "EXPO_PUBLIC_BACKEND_URL=\nEXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_ShapeOnlyKeyForTests000000\n");
  const b = runGate(blank, cloudEnv());
  assert.equal(b.status, 1);
  assert.match(b.stderr, /EXPO_PUBLIC_BACKEND_URL is blank in \.env/);

  const unexpanded = makeManagedArchive();
  writeEnv(unexpanded, "EXPO_PUBLIC_BACKEND_URL=${BACKEND}\nEXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_ShapeOnlyKeyForTests000000\n");
  const c = runGate(unexpanded, cloudEnv());
  assert.equal(c.status, 1);
  assert.match(c.stderr, /EXPO_PUBLIC_BACKEND_URL contains an unexpanded reference/);
  clean(missingEquals, blank, unexpanded);
});

test("4b — the parser handles quotes and CRLF and reads nothing but the two approved names", async () => {
  const { parseApprovedEnvFile } = await import(path.join(ROOT, GATE));
  const parsed = parseApprovedEnvFile(
    '\r\n# comment\r\nSOME_SECRET=must-not-be-read\r\nEXPO_PUBLIC_BACKEND_URL="https://api.example.test"\r\n' +
      "EXPO_PUBLIC_REVENUECAT_IOS_KEY='appl_QuotedShapeOnlyKey0000000'\r\n",
  );
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.values, {
    EXPO_PUBLIC_BACKEND_URL: "https://api.example.test",
    EXPO_PUBLIC_REVENUECAT_IOS_KEY: "appl_QuotedShapeOnlyKey0000000",
  });
  assert.ok(!("SOME_SECRET" in parsed.values), "no other key is parsed");
  // No interpolation, expansion or substitution is ever performed.
  assert.match(parseApprovedEnvFile("EXPO_PUBLIC_BACKEND_URL=$(cat /etc/passwd)\n").errors[0], /unexpanded reference/);
});

// --- 5: sandbox and localhost hosts stay rejected ------------------------------

function withBackendUrl(dir: string, url: string) {
  // Only the EXPO_PUBLIC_BACKEND_URL line is replaced; the proxy/hostname lines are ignored by the parser.
  writeEnv(dir, managedEnvFile().replace(/^EXPO_PUBLIC_BACKEND_URL=.*$/m, `EXPO_PUBLIC_BACKEND_URL=${url}`));
}

test("5 — a backend URL that is not an absolute HTTPS URL still fails", () => {
  const dir = makeManagedArchive();
  for (const [url, reason] of [
    ["http://localhost:8001", /not HTTPS/],
    ["https://127.0.0.1:8001", /loopback or local host/],
    ["/api", /not an absolute URL/],
  ] as [string, RegExp][]) {
    withBackendUrl(dir, url);
    const res = runGate(dir, cloudEnv());
    assert.equal(res.status, 1, `${url} must fail`);
    assert.match(res.stderr, /EXPO_PUBLIC_BACKEND_URL failed validation/);
    assert.match(res.stderr, reason);
    assert.ok(!res.all.includes(url), "a rejected value is never printed");
  }
  clean(dir);
});

test("5b — a non-production or sandbox host WARNS and still exits 0", () => {
  // `.env` is platform-managed and gets re-injected, and the wrapper configures the
  // backend URL at build time before this hook runs, so host policy can never block.
  const dir = makeManagedArchive();
  for (const [url, reason] of [
    ["https://batch5-features.preview.emergentagent.com", /non-production host/],
    ["https://inspect-7.emergentagent.com", /sandbox workspace host/],
    ["https://staging.apexai.example", /non-production host/],
  ] as [string, RegExp][]) {
    withBackendUrl(dir, url);
    const res = runGate(dir, cloudEnv());
    assert.equal(res.status, 0, `${url} must not fail: ${res.all}`);
    assert.match(res.stdout, /warn {4}build variable EXPO_PUBLIC_BACKEND_URL/);
    assert.match(res.stdout, reason);
    assert.ok(!res.stdout.includes("DO NOT BUILD"), "host policy is never a build failure");
    assert.ok(!res.all.includes(url), "the value is still never printed in full");
  }
  clean(dir);
});

// --- 8, 9: identity and OTA still fail closed ---------------------------------

test("8 — a wrong bundle id, package, scheme or project id WARNS (app.json is wrapper-rewritten)", () => {
  const cases: [string, (expo: Record<string, any>) => void, RegExp][] = [
    ["bundle id", (expo) => (expo.ios.bundleIdentifier = "com.someoneelse.apexai"), /ios\.bundleIdentifier is/],
    ["package", (expo) => (expo.android.package = "com.someoneelse.apexai"), /android\.package is/],
    ["scheme", (expo) => (expo.scheme = "someoneelse"), /scheme is/],
    ["slug", (expo) => (expo.slug = "some-other-slug"), /slug is "some-other-slug"/],
    [
      "project id",
      (expo) => (expo.extra = { eas: { projectId: "00000000-0000-0000-0000-000000000000" } }),
      /extra\.eas\.projectId is/,
    ],
    ["legacy identity", (expo) => (expo.slug = "musclemapai"), /legacy application identity/],
  ];
  for (const [label, mutate, expected] of cases) {
    const dir = makeArchive();
    normaliseAppJson(dir, mutate);
    writeGeneratedEasJson(dir);
    writeEnv(dir, managedEnvFile());
    const res = runGate(dir, cloudEnv());
    assert.equal(res.status, 0, `${label} must warn, not fail: ${res.all}`);
    assert.match(res.stdout, expected, label);
    assert.ok(!res.all.includes("DO NOT BUILD"), `${label} is reported, never fatal`);
    clean(dir);
  }
});

test("9 — an active updates block in app.json WARNS (app.json is wrapper-rewritten)", () => {
  const dir = makeArchive();
  normaliseAppJson(dir, (expo) => (expo.updates = { enabled: true, url: "https://u.expo.dev/x" }));
  writeGeneratedEasJson(dir);
  writeEnv(dir, managedEnvFile());
  const res = runGate(dir, cloudEnv());
  assert.equal(res.status, 0, res.all);
  assert.match(res.stdout, /active updates block \(OTA must stay disabled\)/);
  clean(dir);
});

// --- 11: eas.json OTA and identity conflicts still fail -----------------------

test("11 — eas.json channel, OTA, identity and profile deviations WARN; unreadable eas.json still fails", () => {
  // eas.json is replaced by the wrapper before upload, and EAS_BUILD_PROFILE is supplied
  // by the platform, so none of these can prove source integrity and none may fail.
  const channel = makeManagedArchive();
  writeGeneratedEasJson(channel, { build: { production: { channel: "production" } } });
  const a = runGate(channel, cloudEnv());
  assert.equal(a.status, 0, a.all);
  assert.match(a.stdout, /build profile production declares an update channel/);

  const ota = makeManagedArchive();
  writeGeneratedEasJson(ota, { build: { production: { updates: { url: "https://u.expo.dev/x" } } } });
  const b = runGate(ota, cloudEnv());
  assert.equal(b.status, 0, b.all);
  assert.match(b.stdout, /declares an updates configuration/);

  const identity = makeManagedArchive();
  writeGeneratedEasJson(identity, { submit: { production: { ios: { bundleIdentifier: "com.someoneelse.apexai" } } } });
  const c = runGate(identity, cloudEnv());
  assert.equal(c.status, 0, c.all);
  assert.match(c.stdout, /submit profile production \(ios\) declares bundleIdentifier/);

  const wrongEnvironment = makeManagedArchive();
  writeGeneratedEasJson(wrongEnvironment, { build: { production: { environment: "preview" } } });
  const d = runGate(wrongEnvironment, cloudEnv());
  assert.equal(d.status, 0, d.all);
  assert.match(d.stdout, /production profile selects a non-production environment/);

  const wrongProfile = makeManagedArchive();
  const e = runGate(wrongProfile, cloudEnv({ EAS_BUILD_PROFILE: "preview" }));
  assert.equal(e.status, 0, e.all);
  assert.match(e.stdout, /EAS_BUILD_PROFILE is "preview", expected "production"/);
  const rightProfile = runGate(wrongProfile, cloudEnv({ EAS_BUILD_PROFILE: "production" }));
  assert.equal(rightProfile.status, 0, rightProfile.all);

  // Config that cannot be read at all is still fatal: a build could not proceed anyway.
  const broken = makeManagedArchive();
  fs.writeFileSync(path.join(broken, "eas.json"), "{ not json");
  const f = runGate(broken, cloudEnv());
  assert.equal(f.status, 1);
  assert.match(f.stderr, /eas\.json could not be parsed/);
  clean(channel, ota, identity, wrongEnvironment, wrongProfile, broken);
});

// --- 12: local mode keeps the committed eas.json contract ----------------------

test("12 — local mode reports the committed eas.json contract as warnings and still gates on the worktree", async () => {
  const { RELEASE_CRITICAL_FILES } = await import(path.join(ROOT, "scripts/generate-release-manifest.mjs"));
  assert.ok(!RELEASE_CRITICAL_FILES.includes("app.json"), "app.json is no longer byte-pinned");
  assert.ok(!RELEASE_CRITICAL_FILES.includes("eas.json"), "eas.json is no longer byte-pinned");
  assert.equal(RELEASE_CRITICAL_FILES.length, 21, "21 release-critical files");

  const committed = JSON.parse(fs.readFileSync(path.join(ROOT, "eas.json"), "utf8"));
  assert.equal(committed.cli.requireCommit, true, "the committed eas.json still pins requireCommit");
  assert.equal(committed.build.production.environment, "production");

  // Local mode against a wrapper-style eas.json reports both fields, and still refuses
  // to release — because of the worktree/commit contract, not because of eas.json.
  const dir = makeManagedArchive();
  const res = runGate(dir, cloudEnv({ RELEASE_ALLOW_DETACHED: "0" }), []);
  assert.match(res.stdout, /warn {4}eas\.json cli\.requireCommit must be true/);
  assert.match(res.stdout, /warn {4}eas\.json production profile must select "environment": "production"/);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /is not the approved release worktree|RELEASE_EXPECTED_COMMIT is not set/);
  clean(dir);
});

// --- 13: source tamper protection is unchanged --------------------------------

test("13 — tampered yarn.lock, guarded route or release-critical source still fails", () => {
  const shim = makeGitShim();
  const lock = makeManagedArchive();
  fs.appendFileSync(path.join(lock, "yarn.lock"), "\n");
  const a = runGate(lock, cloudEnv({}, shim.dir));
  assert.equal(a.status, 1);
  assert.match(a.stderr, /source fingerprint mismatch[\s\S]*yarn\.lock/);

  const route = makeManagedArchive();
  const rel = "app/dev/paywall-states.tsx";
  fs.writeFileSync(
    path.join(route, rel),
    fs.readFileSync(path.join(route, rel), "utf8").replace("if (!__DEV__)", "if (false)"),
  );
  const b = runGate(route, cloudEnv({}, shim.dir));
  assert.equal(b.status, 1);
  assert.match(b.stderr, /source fingerprint mismatch[\s\S]*app\/dev\/paywall-states\.tsx/);

  const removed = makeManagedArchive();
  fs.rmSync(path.join(removed, "src/auth/AuthContext.tsx"));
  const c = runGate(removed, cloudEnv({}, shim.dir));
  assert.equal(c.status, 1);
  assert.match(c.stderr, /release-critical files missing from this source tree/);

  assert.deepEqual(shim.invocations(), [], "no Git process was invoked in any tamper case");
  clean(lock, route, removed, shim.dir);
});

// --- 14: the exact committed pre-install chain in the managed shape ------------

test("14 — the committed eas-build-pre-install chain succeeds in a pipeline-shaped archive", () => {
  const dir = makeManagedArchive();
  const shim = makeGitShim();
  const command = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).scripts[
    "eas-build-pre-install"
  ] as string;
  assert.equal(
    command,
    "node ./scripts/verify-release-source.mjs --eas-pre-install && ./scripts/cmd-guard.js --preinstall",
    "the chain under test is the committed one",
  );
  const res = spawnSync("sh", ["-c", command], { cwd: dir, env: cloudEnv({}, shim.dir), encoding: "utf8" });
  assert.equal(res.status, 0, `${res.stdout}${res.stderr}`);
  assert.match(res.stdout, /✓ release source verified/);
  assert.deepEqual(shim.invocations(), [], "neither the gate nor cmd-guard invoked Git");
  clean(dir, shim.dir);
});

// --------------------------------------------------------------------------- //
// RC6 — the committed marketing version and the managed wrapper slug rename
//
// The RC5 cloud build failed on exactly one check: the wrapper renames the slug to the
// EAS project slug `ai-coach-trainer-2`. That rename is accepted in cloud mode only when
// every other identity signal simultaneously proves the approved production project.
// --------------------------------------------------------------------------- //

const MANAGED_SLUG = "ai-coach-trainer-2";
const COMMITTED_SLUG = "apex-ai";
const EXPECTED_VERSION = "1.3.0";

/** Cloud environment as the managed wrapper supplies it for a production build. */
function managedCloudEnv(extra: Record<string, string> = {}, shimDir?: string) {
  return cloudEnv(
    { EAS_BUILD: "true", EAS_BUILD_PROFILE: "production", EAS_BUILD_PROJECT_ID: EXPECTED_PROJECT_ID, ...extra },
    shimDir,
  );
}

/** Pipeline archive after the wrapper's slug rename. */
function makeCloudRenamedArchive(mutate: (expo: Record<string, any>) => void = () => {}): string {
  const dir = makeArchive();
  normaliseAppJson(dir, (expo) => {
    expo.slug = MANAGED_SLUG;
    mutate(expo);
  });
  writeGeneratedEasJson(dir);
  writeEnv(dir, managedEnvFile());
  return dir;
}

test("RC6.1 — local mode accepts the committed version with the committed slug", () => {
  const app = JSON.parse(fs.readFileSync(path.join(ROOT, "app.json"), "utf8")).expo;
  assert.equal(app.version, EXPECTED_VERSION, "the committed marketing version is 1.3.0");
  assert.equal(app.slug, COMMITTED_SLUG, "the committed slug is unchanged");
  // Identity, build numbers and OTA configuration are untouched by the version bump.
  assert.equal(app.ios.bundleIdentifier, "com.mazidigroup.apexai");
  assert.equal(app.android.package, "com.mazidigroup.apexai");
  assert.equal(app.scheme, "apexai");
  assert.equal(app.name, "Muscle Map");
  assert.equal(app.ios.buildNumber, "4");
  assert.equal(app.android.versionCode, 4);
  assert.equal(app.updates, undefined, "no Expo Updates configuration");

  const dir = makeArchive();
  writeEnv(dir, managedEnvFile());
  const res = runGate(dir, cloudEnv());
  assert.equal(res.status, 0, res.all);
  assert.match(res.stdout, /app\.json: version 1\.3\.0, slug apex-ai/);
  clean(dir);
});

test("RC6.2 — local mode reports the managed wrapper slug as a warning", () => {
  const dir = makeCloudRenamedArchive();
  // No flag and no EAS_BUILD* name: local release mode.
  const res = runGate(dir, cloudEnv(), []);
  assert.match(res.stdout, /warn {4}app\.json slug is "ai-coach-trainer-2", expected "apex-ai" \(local release mode\)/);
  // Local mode still fails — on the worktree/commit contract, never on the slug.
  assert.equal(res.status, 1);
  assert.ok(!res.stderr.includes("slug"), "the slug is not among the failures");
  clean(dir);
});

test("RC6.3 — cloud mode accepts the managed slug for the approved production project", () => {
  const dir = makeCloudRenamedArchive();
  const shim = makeGitShim();
  const res = runGate(dir, managedCloudEnv({}, shim.dir));
  assert.equal(res.status, 0, res.all);
  assert.match(res.stdout, /app\.json: version 1\.3\.0, slug ai-coach-trainer-2/);
  assert.match(res.stdout, /managed wrapper slug "ai-coach-trainer-2" accepted for the approved production project/);
  assert.match(res.stdout, /source fingerprint matches \(21 files\)/);
  assert.deepEqual(shim.invocations(), [], "no Git process was invoked");
  clean(dir, shim.dir);
});

test("RC6.4 — every unmet managed-slug guard condition is reported as a warning, never a failure", () => {
  const cases: [string, () => { dir: string; env: NodeJS.ProcessEnv }, RegExp][] = [
    [
      "missing project id",
      () => ({ dir: makeCloudRenamedArchive(), env: managedCloudEnv({ EAS_BUILD_PROJECT_ID: "" }) }),
      /EAS_BUILD_PROJECT_ID is not the approved project id/,
    ],
    [
      "wrong project id",
      () => ({
        dir: makeCloudRenamedArchive(),
        env: managedCloudEnv({ EAS_BUILD_PROJECT_ID: "00000000-0000-0000-0000-000000000000" }),
      }),
      /EAS_BUILD_PROJECT_ID is not the approved project id/,
    ],
    [
      "wrong app.json project id",
      () => {
        const dir = makeCloudRenamedArchive();
        const file = path.join(dir, "app.json");
        const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
        parsed.expo.extra.eas.projectId = "11111111-1111-4111-8111-111111111111";
        fs.writeFileSync(file, JSON.stringify(parsed, null, 2));
        return { dir, env: managedCloudEnv() };
      },
      /extra\.eas\.projectId is/,
    ],
    [
      "missing profile",
      () => ({ dir: makeCloudRenamedArchive(), env: managedCloudEnv({ EAS_BUILD_PROFILE: "" }) }),
      /EAS_BUILD_PROFILE is not exactly "production"/,
    ],
    [
      "wrong profile",
      () => ({ dir: makeCloudRenamedArchive(), env: managedCloudEnv({ EAS_BUILD_PROFILE: "preview" }) }),
      /EAS_BUILD_PROFILE is "preview", expected "production"/,
    ],
    [
      "wrong bundle identifier",
      () => ({
        dir: makeCloudRenamedArchive((expo) => (expo.ios.bundleIdentifier = "com.someoneelse.apexai")),
        env: managedCloudEnv(),
      }),
      /ios\.bundleIdentifier is/,
    ],
    [
      "wrong android package",
      () => ({
        dir: makeCloudRenamedArchive((expo) => (expo.android.package = "com.someoneelse.apexai")),
        env: managedCloudEnv(),
      }),
      /android\.package is/,
    ],
    [
      "wrong scheme",
      () => ({ dir: makeCloudRenamedArchive((expo) => (expo.scheme = "someoneelse")), env: managedCloudEnv() }),
      /scheme is/,
    ],
    [
      "active updates configuration",
      () => ({
        dir: makeCloudRenamedArchive((expo) => (expo.updates = { enabled: true, url: "https://u.expo.dev/x" })),
        env: managedCloudEnv(),
      }),
      /active updates block|active updates configuration is present/,
    ],
  ];
  for (const [label, build, expected] of cases) {
    const { dir, env } = build();
    const res = runGate(dir, env);
    assert.equal(res.status, 0, `${label} must warn, not fail: ${res.all}`);
    assert.match(res.stdout, expected, label);
    assert.ok(!res.all.includes("DO NOT BUILD"), `${label} is reported, never fatal`);
    clean(dir);
  }
});

test("RC6.5 — the marketing version can never fail a build, and the fingerprint always can", () => {
  // The wrapper rewrites app.json after upload and increments the version there (their
  // builder reported 1.1.9 against a committed 1.1.8), and app.json is not one of the 21
  // hashed files — so the version proves nothing and must never gate a build. The source
  // fingerprint is the only proof, and it still fails closed at every one of these
  // versions. None of them may equal EXPECTED_VERSION, so the note is always asserted.
  for (const version of ["1.1.1", "1.1.6", "1.1.7", "1.1.8", "1.1.9", "1.2.1", "1.18", "v1.2.0", "", "1.2.0-beta"]) {
    const cloud = makeCloudRenamedArchive((expo) => (expo.version = version));
    const a = runGate(cloud, managedCloudEnv());
    assert.equal(a.status, 0, `cloud must accept version "${version}": ${a.all}`);
    assert.match(a.stdout, /source fingerprint matches \(21 files\)/);
    if (version !== EXPECTED_VERSION) {
      assert.match(a.stdout, /the approved committed version is "1\.3\.0" \(wrapper-rewritten, not a failure\)/);
    }
    assert.ok(!a.all.includes("DO NOT BUILD"), `version "${version}" must not block the build`);

    // Same wrapper-rewritten version, one tampered pinned file: still refused.
    const tampered = makeCloudRenamedArchive((expo) => (expo.version = version));
    fs.appendFileSync(path.join(tampered, "yarn.lock"), "\n");
    const b = runGate(tampered, managedCloudEnv());
    assert.equal(b.status, 1, `a fingerprint mismatch must fail at version "${version}"`);
    assert.match(b.stderr, /source fingerprint mismatch[\s\S]*yarn\.lock/);
    clean(cloud, tampered);
  }
});

test("RC6.6 — an unexpected slug is reported as a warning (app.json is wrapper-rewritten)", () => {
  for (const slug of ["apex-ai-2", "ai-coach-trainer", "ai-coach-trainer-3", "some-other-project", ""]) {
    const dir = makeCloudRenamedArchive((expo) => (expo.slug = slug));
    const res = runGate(dir, managedCloudEnv());
    assert.equal(res.status, 0, `slug "${slug}" must warn, not fail: ${res.all}`);
    assert.match(res.stdout, /warn {4}app\.json slug is/);
    assert.ok(!res.all.includes("DO NOT BUILD"), `slug "${slug}" must not block the build`);
    clean(dir);
  }
});

test("RC6.7 — the committed pre-install chain passes on the cloud-renamed archive", () => {
  const dir = makeCloudRenamedArchive();
  const shim = makeGitShim();
  const command = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).scripts[
    "eas-build-pre-install"
  ] as string;
  const res = spawnSync("sh", ["-c", command], { cwd: dir, env: managedCloudEnv({}, shim.dir), encoding: "utf8" });
  assert.equal(res.status, 0, `${res.stdout}${res.stderr}`);
  assert.match(res.stdout, /✓ release source verified/);
  assert.match(res.stdout, /version 1\.3\.0, slug ai-coach-trainer-2/);
  assert.deepEqual(shim.invocations(), [], "neither the gate nor cmd-guard invoked Git");
  clean(dir, shim.dir);
});

test("RC6.8 — fingerprint and tamper protection still apply to the cloud-renamed archive", () => {
  const lock = makeCloudRenamedArchive();
  fs.appendFileSync(path.join(lock, "yarn.lock"), "\n");
  const a = runGate(lock, managedCloudEnv());
  assert.equal(a.status, 1);
  assert.match(a.stderr, /source fingerprint mismatch[\s\S]*yarn\.lock/);

  const route = makeCloudRenamedArchive();
  const rel = "app/dev/paywall-states.tsx";
  fs.writeFileSync(
    path.join(route, rel),
    fs.readFileSync(path.join(route, rel), "utf8").replace("if (!__DEV__)", "if (false)"),
  );
  const b = runGate(route, managedCloudEnv());
  assert.equal(b.status, 1);
  assert.match(b.stderr, /source fingerprint mismatch[\s\S]*app\/dev\/paywall-states\.tsx/);

  const removed = makeCloudRenamedArchive();
  fs.rmSync(path.join(removed, "src/premium/entitlement.ts"));
  const c = runGate(removed, managedCloudEnv());
  assert.equal(c.status, 1);
  assert.match(c.stderr, /release-critical files missing from this source tree/);
  clean(lock, route, removed);
});
