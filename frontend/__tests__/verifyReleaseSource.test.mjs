// Release-source gate — unit tests for the environment-variable contract.
//
// The gate itself is an ESM script that must run in the EAS pre-install phase with
// Node built-ins only, so it is tested here as ESM rather than through the
// TypeScript logic runner. Importing it is side-effect free: the checks only run
// when the file is executed directly.
//
// No environment value is used, printed or asserted on: every case below passes an
// explicit literal.
import assert from "node:assert/strict";
import test from "node:test";

import { REQUIRED_PUBLIC_VARS, validateBackendUrl, validatePublicSdkKey } from "../scripts/verify-release-source.mjs";

test("the required public build variables are exactly the two the app cannot start without", () => {
  assert.deepEqual(REQUIRED_PUBLIC_VARS, ["EXPO_PUBLIC_BACKEND_URL", "EXPO_PUBLIC_REVENUECAT_IOS_KEY"]);
});

test("a production HTTPS backend URL is accepted and reported with a partially masked host", () => {
  const result = validateBackendUrl("https://apibackend.musclemapai.com/v1?token=abc");
  assert.equal(result.ok, true);
  assert.equal(result.redactedHost, "api***.musclemapai.com", "the first label is masked");
  assert.ok(!result.redactedHost.includes("apibackend"), "the full label is never returned");
  assert.ok(!result.redactedHost.includes("token"), "no path or query is ever returned");
  assert.equal(result.reason, undefined);
});

test("a missing, blank or non-string backend URL is rejected", () => {
  for (const value of [undefined, null, "", "   ", 42, {}]) {
    const result = validateBackendUrl(value);
    assert.equal(result.ok, false, `${String(value)} must be rejected`);
    assert.equal(result.reason, "missing or blank");
  }
});

test("a relative, malformed or non-HTTPS backend URL is rejected", () => {
  assert.equal(validateBackendUrl("/api").reason, "not an absolute URL (relative paths are rejected)");
  assert.equal(validateBackendUrl("api.example.com").reason, "not an absolute URL (relative paths are rejected)");
  assert.equal(validateBackendUrl("http://api.example.com").reason, "not HTTPS");
  assert.equal(validateBackendUrl("ftp://api.example.com").reason, "not HTTPS");
});

test("a loopback, private-network or .local backend URL is rejected", () => {
  for (const host of ["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "macbook.local"]) {
    const result = validateBackendUrl(`https://${host}:8001`);
    assert.equal(result.ok, false, `${host} must be rejected`);
  }
  for (const host of ["10.0.0.4", "192.168.1.20", "172.16.5.9", "172.31.0.1"]) {
    assert.equal(validateBackendUrl(`https://${host}`).reason, "private network host", host);
  }
});

test("a non-production backend host is rejected so a release cannot ship pointing at staging", () => {
  for (const host of [
    "staging.example.com",
    "api-staging.example.com",
    "dev.example.com",
    "api.test.example.com",
    "preview.example.com",
    "sandbox.example.com",
    "abcd1234.ngrok.io",
  ]) {
    const result = validateBackendUrl(`https://${host}`);
    assert.equal(result.ok, false, `${host} must be rejected`);
    assert.equal(result.reason, "non-production host");
  }
});

test("a production host that merely contains a rejected word is still accepted", () => {
  // Substring matching would wrongly reject these; the gate matches host labels.
  for (const host of ["api.devon.com", "teststudio-app.com", "previewer.example.com"]) {
    assert.equal(validateBackendUrl(`https://${host}`).ok, true, host);
  }
});

test("the public RevenueCat SDK key is checked for shape only", () => {
  assert.equal(validatePublicSdkKey("appl_ABCDEFGHIJKLMNOPQRSTUVWX").ok, true);
  assert.equal(validatePublicSdkKey("").reason, "missing or blank");
  assert.equal(validatePublicSdkKey("   ").reason, "missing or blank");
  assert.equal(validatePublicSdkKey("appl_short").reason, "implausible shape");
  assert.equal(validatePublicSdkKey("appl_ABCDEFGHIJ KLMNOPQRSTUVWX").reason, "implausible shape");
  assert.equal(validatePublicSdkKey(undefined).ok, false);
});

test("no validator ever returns the value it was given", () => {
  const secretish = "appl_THIS_VALUE_MUST_NOT_COME_BACK_0123456789";
  assert.ok(!JSON.stringify(validatePublicSdkKey(secretish)).includes("MUST_NOT_COME_BACK"));
  const url = "https://api.musclemapai.com/secret-path?token=abc";
  assert.ok(!JSON.stringify(validateBackendUrl(url)).includes("secret-path"));
  assert.ok(!JSON.stringify(validateBackendUrl(url)).includes("token=abc"));
});
