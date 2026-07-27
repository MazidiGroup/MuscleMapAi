// Production route guard — the development paywall fixture harness must never
// render fixture products, prices, trials or entitlement states in a shipped build.
//
// Expo Router screens cannot be rendered by this harness (no React renderer is
// installed, and none may be added), so the contract is asserted at source level:
// textual order proves the guard runs before any fixture value exists, and the
// release manifest proves the guarded file is bound to the build gate.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = process.env.MMA_TEST_ROOT as string;
const ROUTE_REL = "app/dev/paywall-states.tsx";
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const src = read(ROUTE_REL);
const guardAt = src.indexOf("if (!__DEV__)");

// Every fixture value the route must not create in production. Each is matched as a
// literal so a renamed or re-added fixture cannot slip past the ordering assertion.
// Import specifiers are deliberately not listed: an unused import creates nothing at
// runtime, whereas each marker below is a fixture value or fixture render.
const FIXTURE_MARKERS = [
  "FIXTURE_PACKAGES",
  "£4.99",
  "£39.99",
  "£3.33",
  "trialEligibility",
  "introPrice",
  "<PremiumContextForFixtures.Provider",
  "<Paywall />",
];

test("the development paywall route carries a !__DEV__ production guard", () => {
  assert.ok(guardAt !== -1, "the route contains an `if (!__DEV__)` guard");
  // The guard belongs to the default-exported route component, not a helper.
  const exportAt = src.indexOf("export default function");
  assert.ok(exportAt !== -1, "the route has a default-exported component");
  assert.ok(exportAt < guardAt, "the guard is inside the exported route component");
});

test("the production branch redirects instead of rendering anything", () => {
  const guardBlock = src.slice(guardAt, src.indexOf("}", guardAt) + 1);
  assert.match(guardBlock, /return <Redirect href="\/" \/>;/, "production returns a Redirect");
  assert.ok(src.includes('import { Redirect } from "expo-router"'), "Redirect comes from expo-router");
  // A typed-route-correct target: "/" is the app index route.
  assert.ok(!/@ts-ignore|@ts-expect-error|@ts-nocheck/.test(src), "no TypeScript suppression is used");
});

test("no fixture product, price, trial or entitlement state exists before the guard", () => {
  const beforeGuard = src.slice(0, guardAt);
  for (const marker of FIXTURE_MARKERS) {
    assert.ok(!beforeGuard.includes(marker), `${marker} must not appear before the guard`);
    assert.ok(src.includes(marker), `${marker} is still present for development use`);
  }
  // Nothing between the guard and the end of the route component may render fixtures.
  const routeBody = src.slice(guardAt, src.indexOf("const FIXTURE_PACKAGES"));
  assert.ok(routeBody.includes("<PaywallStatesHarness />"), "the fixture harness is a separate component");
  for (const marker of FIXTURE_MARKERS.filter((m) => m !== "FIXTURE_PACKAGES")) {
    assert.ok(!routeBody.includes(marker), `${marker} must not be created by the route component`);
  }
});

test("the fixture harness is only reachable through the guarded route", () => {
  // The harness component must not be exported: nothing else can mount it.
  assert.ok(!/export (default )?function PaywallStatesHarness/.test(src), "the harness is module-private");
  assert.match(src, /^function PaywallStatesHarness\(\) \{$/m, "the harness is a plain local component");
  const links = fs
    .readdirSync(path.join(ROOT, "app"), { recursive: true } as any)
    .filter((f) => typeof f === "string" && (f as string).endsWith(".tsx"))
    .map((f) => f as string)
    .filter((f) => f !== "dev/paywall-states.tsx")
    .filter((f) => read(path.join("app", f)).includes("dev/paywall-states"));
  assert.deepEqual(links, [], "no production route links to the fixture harness");
});

test("the guarded route is bound to the release gate with its exact hash", async () => {
  const { RELEASE_CRITICAL_FILES } = await import(
    path.join(ROOT, "scripts/generate-release-manifest.mjs")
  );
  assert.ok(RELEASE_CRITICAL_FILES.includes(ROUTE_REL), "the route is release-critical");

  const manifest = JSON.parse(read("release-source.manifest.json"));
  assert.equal(manifest.fileCount, RELEASE_CRITICAL_FILES.length, "the manifest covers every listed file");
  assert.equal(manifest.fileCount, 21, "21 release-critical files");
  const expected = createHash("sha256").update(fs.readFileSync(path.join(ROOT, ROUTE_REL))).digest("hex");
  assert.equal(manifest.files[ROUTE_REL], expected, "the recorded hash is the guarded file's hash");
  // The dependency graph stays pinned by the same manifest.
  assert.equal(
    manifest.files["yarn.lock"],
    createHash("sha256").update(fs.readFileSync(path.join(ROOT, "yarn.lock"))).digest("hex"),
    "yarn.lock remains fingerprinted and unchanged",
  );
});
