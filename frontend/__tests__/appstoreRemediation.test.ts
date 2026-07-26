// App Store blocker remediation — repository contracts.
//
// Three submission blockers were remediated:
//   1. Sign in with Apple token revocation on account deletion (Guideline 5.1.1(v))
//   2. a root error boundary so a render failure can never show a blank screen (2.1)
//   3. an EAS release configuration that cannot build unverified source or miss a
//      required public build variable
//
// These assertions are the guards that stop any of the three from silently
// regressing. They read the repository, so they need no device, no Apple
// credential and no network access.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = process.env.MMA_TEST_ROOT as string;
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const readBackend = (rel: string) => fs.readFileSync(path.join(ROOT, "..", "backend", rel), "utf8");

// --- 1. Apple token revocation (5.1.1(v)) ----------------------------------

test("sign-in sends the one-time Apple authorisation code to our own backend only", () => {
  const src = read("src/auth/AuthContext.tsx");
  assert.ok(src.includes("authorization_code: credential.authorizationCode ?? null"), "the code is forwarded");
  assert.ok(/apiPost<[^>]*>\(\s*\n?\s*"\/auth\/apple\/session"/.test(src), "it goes to our endpoint");
  // The code must never be persisted on the device, nor logged.
  assert.ok(!/setItem\([^)]*authorizationCode/.test(src), "the code is never stored");
  assert.ok(!/console\.(log|warn|error)\([^)]*authorizationCode/.test(src), "the code is never logged");
});

test("the Apple token lifecycle lives in one server-only module", () => {
  const files = fs.readdirSync(path.join(ROOT, "..", "backend")).filter((f) => f.endsWith(".py")).sort();
  assert.ok(files.includes("apple_tokens.py"), "the module exists");
  const src = readBackend("apple_tokens.py");
  assert.ok(src.includes("https://appleid.apple.com/auth/revoke"), "Apple's revocation endpoint is used");
  assert.ok(src.includes('algorithm="ES256"'), "the client secret is an ES256 JWT");
  // No EXPO_PUBLIC_* variable may ever carry Apple server configuration.
  assert.ok(!/os\.environ[^\n]*EXPO_PUBLIC/.test(src), "no public variable is read for Apple secrets");
  assert.ok(!/_cfg\("EXPO_PUBLIC/.test(src));
});

test("Apple configuration and token material are never exposed to the client", () => {
  const src = readBackend("apple_tokens.py");
  for (const name of ["APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY", "APPLE_TOKEN_ENC_KEY"]) {
    assert.ok(src.includes(name), `${name} is read on the server`);
  }
  const server = readBackend("server.py");
  // Only the non-sensitive status strings cross the wire.
  assert.ok(!/refresh_token["']\s*:/.test(server.replace(/refresh_token_enc/g, "")), "no refresh token is returned");
  assert.ok(server.includes('"apple_link": apple_link'), "only a status is returned at sign-in");
});

test("the refresh token is stored encrypted, scoped to one account, and never in plaintext", () => {
  const server = readBackend("server.py");
  assert.ok(server.includes("sealed = encrypt_token(refresh_token)"), "it is encrypted before storage");
  assert.ok(server.includes('"refresh_token_enc": sealed'), "only the sealed value is written");
  assert.ok(server.includes("if not token_encryption_available()"), "storage fails closed without a key");
  assert.ok(server.includes('return "encryption_not_configured"'), "and reports that honestly");
  assert.ok(server.includes('db.apple_tokens.create_index("user_id", unique=True)'), "one record per account");
});

test("an authorisation code belonging to a different Apple subject is discarded", () => {
  const server = readBackend("server.py");
  assert.ok(server.includes("code_sub != apple_sub"), "subjects are compared at sign-in");
  assert.ok(server.includes('apple_link = "subject_mismatch"'), "a mismatch is refused, not stored");
  assert.ok(server.includes('record["apple_sub"] != apple_sub'), "and again before revoking");
});

test("account deletion attempts Apple revocation first and then deletes regardless", () => {
  const server = readBackend("server.py");
  const del = server.slice(server.indexOf('@api_router.delete("/auth/me")'));
  const body = del.slice(0, del.indexOf("# NOTE:"));
  assert.ok(body.indexOf("_revoke_apple_for_account") < body.indexOf("db.users.delete_one"), "revoke before delete");
  assert.ok(/except Exception:\s*\n\s*logger\.warning\("apple revocation raised; continuing with deletion"\)/.test(body), "revocation never blocks deletion");
  assert.ok(body.includes("db.apple_tokens.delete_many({\"user_id\": user_id})"), "token material is always removed");
});

test("the deletion response reports revocation honestly and never over-claims", () => {
  const server = readBackend("server.py");
  assert.ok(server.includes('"apple_revocation": apple_revocation'));
  assert.ok(server.includes("revocation_guidance_needed(apple_revocation)"), "the shared rule decides");
  const tokens = readBackend("apple_tokens.py");
  assert.ok(tokens.includes('VERIFIED_REVOCATION_STATUSES = {"revoked", "already_invalid"}'), "only confirmed outcomes count");
});

test("manual-revocation guidance is shown only when revocation was not verified", () => {
  const auth = read("src/auth/AuthContext.tsx");
  assert.ok(auth.includes("res?.manual_revocation_required === true"), "the client trusts the server status");
  assert.ok(auth.includes("MANUAL_APPLE_REVOCATION_COPY"), "one shared copy string");
  const copy = auth.slice(auth.indexOf("MANUAL_APPLE_REVOCATION_COPY ="));
  assert.ok(/Settings[\s\S]{0,200}Sign in with Apple/.test(copy), "it explains the iOS Settings path");
  const library = read("app/(tabs)/library.tsx");
  assert.ok(
    library.includes("res.manualAppleRevocation\n        ? MANUAL_APPLE_REVOCATION_COPY"),
    "the guidance is conditional, never unconditional",
  );
});

// --- 2. Root error boundary (2.1: no blank screen) -------------------------

test("a root error boundary wraps the whole router tree", () => {
  const layout = read("app/_layout.tsx");
  assert.ok(layout.includes("<RootErrorBoundary>"), "the boundary is mounted");
  // It must sit ABOVE every provider, otherwise a provider throw is uncaught.
  assert.ok(layout.indexOf("<RootErrorBoundary>") < layout.indexOf("<AuthProvider>"), "above AuthProvider");
  assert.ok(layout.indexOf("<RootErrorBoundary>") < layout.indexOf("<PremiumProvider"), "above PremiumProvider");
});

test("the boundary catches render failures and offers exactly one recovery action", () => {
  const src = read("src/ui/RootErrorBoundary.tsx");
  assert.ok(src.includes("static getDerivedStateFromError"), "render failures are caught");
  assert.ok(src.includes("componentDidCatch"), "the failure is observed");
  assert.ok(src.includes('testID="root-error-boundary"'), "the fallback is addressable");
  assert.ok(src.includes('testID: "root-error-reset"'), "the recovery action is addressable");
  const actions = src.match(/primary=|secondary=/g) ?? [];
  assert.deepEqual(actions, ["primary="], "exactly one action");
});

test("the boundary fallback reuses the shared State System and cannot loop", () => {
  const src = read("src/ui/RootErrorBoundary.tsx");
  assert.ok(src.includes('from "@/src/ui/state"') && src.includes("BlockingError"), "shared blocking-error surface");
  // Reset clears `failed` and bumps a remount key: a repeated failure re-renders the
  // fallback instead of retrying forever.
  assert.ok(src.includes("failed: false, attempt: s.attempt + 1"), "one remount per attempt");
  assert.ok(!/setTimeout|setInterval|reload\(\)/.test(src), "no automatic retry loop");
});

test("the fallback discloses no diagnostics to the user and sends nothing anywhere", () => {
  const src = read("src/ui/RootErrorBoundary.tsx");
  assert.ok(/if \(__DEV__\)/.test(src), "diagnostics are development-only");
  const copy = src.slice(src.indexOf("ROOT_ERROR_COPY = {"), src.indexOf("} as const"));
  for (const banned of ["error.message", "stack", "componentStack", "http", "user_id", "token"]) {
    assert.ok(!copy.includes(banned), `user copy must not contain ${banned}`);
  }
  assert.ok(!/fetch\(|apiPost|apiGet|Sentry/.test(src), "no telemetry is sent");
  assert.ok(copy.includes("saved on this device"), "the user is reassured their data is intact");
});

// --- 3. EAS release configuration ------------------------------------------

test("EAS cannot build uncommitted source and the production profile selects production", () => {
  const eas = JSON.parse(read("eas.json"));
  assert.equal(eas.cli.requireCommit, true, "requireCommit must be true");
  assert.equal(eas.cli.appVersionSource, "remote");
  assert.equal(eas.build.production.environment, "production", "the production environment is explicit");
  assert.equal(eas.build.production.ios.simulator, false);
  assert.equal(eas.build.production.android.buildType, "app-bundle");
  for (const [name, profile] of Object.entries(eas.build) as [string, any][]) {
    assert.equal(profile.channel, undefined, `${name} must declare no update channel`);
    assert.equal(profile.env, undefined, `${name} must not inline environment values into the repo`);
  }
});

test("every EAS build runs the release-source gate before dependencies are installed", () => {
  const pkg = JSON.parse(read("package.json"));
  const hook = pkg.scripts["eas-build-pre-install"];
  assert.ok(hook, "the eas-build-pre-install hook exists");
  assert.ok(hook.includes("verify-release-source.mjs --eas-pre-install"), "it runs the gate first");
  assert.ok(hook.indexOf("verify-release-source.mjs") < hook.indexOf("cmd-guard"), "the gate runs before anything else");
  assert.ok(pkg.scripts["verify:release-source"], "the gate is runnable locally too");
});

test("the gate requires the public build variables and refuses an unsafe backend URL", () => {
  const gate = read("scripts/verify-release-source.mjs");
  for (const name of ["EXPO_PUBLIC_BACKEND_URL", "EXPO_PUBLIC_REVENUECAT_IOS_KEY"]) {
    assert.ok(gate.includes(name), `${name} is required`);
  }
  assert.ok(gate.includes('reason: "not HTTPS"'), "plain HTTP is rejected");
  assert.ok(gate.includes('reason: "loopback or local host"'), "localhost is rejected");
  assert.ok(gate.includes('reason: "non-production host"'), "staging hosts are rejected");
  // A variable's value must never be printed, even when it fails validation.
  assert.ok(gate.includes("value never printed"), "failures never reveal a value");
  assert.ok(!/console\.log\(`?\$\{?process\.env/.test(gate), "no environment value is echoed");
});

test("the gate rejects the inherited legacy source tree and any missing Direction B marker", () => {
  const gate = read("scripts/verify-release-source.mjs");
  assert.ok(gate.includes('FORBIDDEN_SOURCE_ROOTS = ["/app/frontend"]'), "the rejected build's source is blocked");
  assert.ok(gate.includes("release-candidate\\/frontend$"), "the approved worktree is required locally");
  assert.ok(gate.includes("checkFingerprint"), "the committed source fingerprint is verified");
  assert.ok(gate.includes("DO NOT BUILD"), "a failure states the build must not proceed");
  assert.ok(gate.includes("process.exit(1)"), "and exits non-zero");
  // The approved commit is passed in, never baked into the gate (a baked sha is
  // stale by definition and would invalidate its own fingerprint).
  assert.ok(!/\b[0-9a-f]{40}\b/.test(gate), "no commit sha is hardcoded");
  assert.ok(gate.includes("RELEASE_EXPECTED_COMMIT is not set"), "an unpinned local build is refused");
});

test("the remediation introduced no new dependency, telemetry or OTA configuration", () => {
  const pkg = JSON.parse(read("package.json"));
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).join(" ");
  for (const banned of ["sentry", "bugsnag", "analytics", "expo-updates", "expo-notifications"]) {
    assert.ok(!deps.includes(banned), `${banned} must not be a dependency`);
  }
  const app = JSON.parse(read("app.json"));
  assert.equal(app.expo.updates, undefined, "OTA stays disabled");
  const backendReqs = readBackend("requirements.txt");
  // Apple revocation reuses libraries already present in the release requirements.
  for (const lib of ["httpx", "PyJWT", "cryptography"]) {
    assert.ok(new RegExp(`^${lib}==`, "im").test(backendReqs), `${lib} is already pinned`);
  }
});
