// Phase 4 — release-safety assertions made against the repository itself.
// These are the guards that stop a regression from silently re-entering:
// warning suppression, hardcoded commerce text, entitlement drift between client
// and server, and any accidental build/deploy configuration change.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { CATALOG_COUNT, FULL_CATALOG, getCatalogExercise } from "../src/anatomy/exerciseCatalog";
import RAW_PACK from "../src/anatomy/exerciseCatalog.json";
import { catalogIntegrity } from "../src/library/catalogQuery";

const ROOT = process.env.MMA_TEST_ROOT as string;
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const readBackend = (rel: string) => fs.readFileSync(path.join(ROOT, "..", "backend", rel), "utf8");

// --- warning suppression ----------------------------------------------------

test("global runtime-warning suppression is gone and not reintroduced under another name", () => {
  const layout = read("app/_layout.tsx");
  assert.ok(!/LogBox\.ignoreAllLogs/.test(layout), "LogBox.ignoreAllLogs must not exist");
  for (const rel of ["app/_layout.tsx", "app/(tabs)/_layout.tsx", "src/premium/PremiumContext.tsx"]) {
    const src = read(rel);
    assert.ok(!/ignoreAllLogs|console\.(warn|error)\s*=\s*\(/.test(src), `${rel} must not blanket-suppress warnings`);
  }
});

test("no blanket LogBox.ignoreLogs filter exists anywhere in the app tree", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(e.name)) files.push(rel);
    }
  };
  walk("app");
  walk("src");
  const offenders = files.filter((f) => /ignoreAllLogs|LogBox\.ignoreLogs\(\s*\[\s*['"]\.\*/.test(read(f)));
  assert.deepEqual(offenders, [], "no blanket suppression");
});

// --- commerce text ----------------------------------------------------------

test("the paywall never hardcodes a currency, price, period or discount", () => {
  const src = read("src/premium/Paywall.tsx");
  for (const banned of ["£", "US$", "€", "GBP", "USD", "9.99", "59.99", "% off", "7 days free", "per month for"]) {
    assert.ok(!src.includes(banned), `Paywall must not contain ${banned}`);
  }
  // Prices and periods must come from the shared, store-fed helper.
  assert.ok(src.includes("productTerms("), "prices come from productTerms");
});

test("the paywall preselects nothing and only enables the CTA after a choice", () => {
  const src = read("src/premium/Paywall.tsx");
  assert.ok(/useState<string \| null>\(null\)/.test(src), "selection starts empty");
  assert.ok(!/find\(\(p\) => p\.packageType === "MONTHLY"\)/.test(src), "no default selection effect");
  assert.ok(src.includes("disabled={!chosen}"), "the CTA is disabled until a product is chosen");
});

test("the paywall keeps Restore, Terms and Privacy reachable", () => {
  const src = read("src/premium/Paywall.tsx");
  for (const id of ["paywall-restore", "paywall-terms", "paywall-privacy"]) {
    assert.ok(src.includes(id), id);
  }
});

test("the paywall composes shared State-System components for its non-happy paths", () => {
  const src = read("src/premium/Paywall.tsx");
  for (const component of ["RetryPanel", "ErrorBanner", "InfoBanner", "LayoutSkeleton", "StatusAnnouncement", "ActionButton"]) {
    assert.ok(src.includes(component), component);
  }
});

// --- one Premium implementation --------------------------------------------

test("there is exactly one Premium provider, one gate and one resolver", () => {
  const files = fs.readdirSync(path.join(ROOT, "src/premium")).sort();
  assert.deepEqual(files, ["Paywall.tsx", "PremiumContext.tsx", "PremiumGate.tsx", "entitlement.ts"]);
});

test("Premium screens gate through PremiumGate and never re-derive entitlement", () => {
  for (const rel of ["app/(tabs)/coach.tsx", "app/(tabs)/explore.tsx", "app/(tabs)/learn.tsx", "app/(tabs)/library.tsx"]) {
    const src = read(rel);
    assert.ok(src.includes("PremiumGate"), `${rel} uses the shared gate`);
    assert.ok(!/!isPremium/.test(src), `${rel} must not branch on a raw boolean`);
  }
});

test("no Free surface is gated anywhere in the app tree", () => {
  const plan = read("app/(tabs)/plan.tsx");
  const workout = read("app/(tabs)/workout.tsx");
  const summary = read("app/summary.tsx");
  const detail = read("app/exercise/[id].tsx");
  for (const [name, src] of Object.entries({ plan, workout, summary, detail })) {
    assert.ok(!src.includes("PremiumGate"), `${name} must stay free`);
    assert.ok(!/Paywall/.test(src), `${name} must never present the paywall`);
  }
});

test("the client and the server use the same designated entitlement rule", () => {
  const client = read("src/premium/entitlement.ts");
  const server = readBackend("server.py");
  assert.ok(client.includes('export const PREMIUM_ENTITLEMENT_ID = "premium"'));
  assert.ok(server.includes('PREMIUM_ENTITLEMENT_ID = "premium"'));
  assert.ok(server.includes("ents.get(PREMIUM_ENTITLEMENT_ID)"), "the server reads the exact entitlement");
  assert.ok(!/for ent in ents\.values\(\)/.test(server), "name-agnostic unlocking is gone");
  assert.ok(!/Name-agnostic/.test(server));
});

test("the server reports the grant source using the shared precedence", () => {
  const server = readBackend("server.py");
  assert.ok(server.includes('PREMIUM_SOURCE_PRECEDENCE = ["review_bypass", "manual_grant", "revenuecat"]'));
  assert.ok(server.includes('user["premium_source"]'));
});

test("the reviewer bypass and manual grant remain narrowly scoped", () => {
  const server = readBackend("server.py");
  // Exact reserved address only, and the manual grant is still a lookup by email.
  assert.ok(server.includes("email.strip().lower() == REVIEW_BYPASS_EMAIL"));
  assert.ok(server.includes("db.manual_premium_grants.find_one({\"email\": email})"));
  assert.ok(!/REVIEW_BYPASS_EMAIL\.split|REVIEW_BYPASS_EMAIL\s*in\s|email\.endswith\(/.test(server), "no wildcard reviewer eligibility");
});

test("no API key or secret is embedded in Premium source", () => {
  for (const rel of ["src/premium/entitlement.ts", "src/premium/PremiumContext.tsx", "src/premium/Paywall.tsx", "src/premium/PremiumGate.tsx"]) {
    const src = read(rel);
    assert.ok(!/appl_[A-Za-z0-9]/.test(src), `${rel} must not contain a public SDK key`);
    assert.ok(!/sk_[A-Za-z0-9]/.test(src), `${rel} must not contain a secret key`);
  }
});

test("offering and product identifiers are never hardcoded", () => {
  const src = read("src/premium/PremiumContext.tsx");
  assert.ok(src.includes("offerings?.current?.availablePackages"), "the current offering is read dynamically");
  assert.ok(!/getOffering\("|"default"|"premium_monthly"|"mma_/.test(src));
});

test("purchase and restore cannot overlap and verify before reporting success", () => {
  const src = read("src/premium/PremiumContext.tsx");
  assert.ok(src.includes("busyRef"), "a concurrency guard exists");
  assert.ok(/await Purchases\.purchasePackage[\s\S]{0,220}readEntitlement\(\)/.test(src), "purchase re-reads the entitlement");
  assert.ok(/await Purchases\.restorePurchases[\s\S]{0,160}readEntitlement\(\)/.test(src), "restore re-reads the entitlement");
});

test("an owner change resets entitlement state before anything is shown", () => {
  const src = read("src/premium/PremiumContext.tsx");
  assert.ok(/const owner = user\?\.user_id \?\? null/.test(src));
  assert.ok(/setRcActive\(false\);\s*\n\s*setRcState\("loading"\)/.test(src), "reset on owner change");
  assert.ok(/\}, \[owner, readEntitlement, refreshOfferings\]\)/.test(src), "the effect is keyed by owner");
});

// --- accessibility contract in source --------------------------------------

test("Premium controls meet the minimum and comfortable target sizes", () => {
  const paywall = read("src/premium/Paywall.tsx");
  assert.ok(paywall.includes("minHeight: t.target.comfortable"), "options use the comfortable target");
  assert.ok(paywall.includes("minHeight: t.target.min"), "legal links keep the 44pt minimum");
  const detail = read("app/exercise/[id].tsx");
  assert.ok(/width: 44, height: 44/.test(detail), "the exercise back control is 44pt");
});

test("selection and lock states are never communicated by colour alone", () => {
  const paywall = read("src/premium/Paywall.tsx");
  assert.ok(paywall.includes('accessibilityRole="radio"'));
  assert.ok(paywall.includes("accessibilityState={{ selected: active }}"));
  assert.ok(paywall.includes("paywall-selected-text"), "a visible 'Selected' label exists");
  const tabs = read("app/(tabs)/_layout.tsx");
  // The names are built by one helper so they cannot depend on an in-flight
  // entitlement read: a Premium surface is named Premium unless entitlement has
  // RESOLVED with access.
  assert.ok(tabs.includes("`${title}, Premium`"), "locked tabs are named");
  assert.ok(tabs.includes("isPremiumSurface(surface) && !resolution.access"), "the name never waits on a read");
  assert.ok(
    tabs.includes('tabBarAccessibilityLabel: tabName("Coach", "coach")') &&
      tabs.includes('tabBarAccessibilityLabel: tabName("Explore", "explore")'),
    "the gated tabs use it",
  );
  assert.ok(
    tabs.includes('tabBarAccessibilityLabel: tabName("Plan", "plan")') &&
      tabs.includes('tabBarAccessibilityLabel: tabName("Workout", "workout.session")') &&
      tabs.includes('tabBarAccessibilityLabel: tabName("Library", "library.exercises")'),
    "the free tabs are named too",
  );
  const library = read("app/(tabs)/library.tsx");
  assert.ok(library.includes("`${SEG_LABELS[s]}, Premium`"), "locked Library segments are named");
});

test("the locked value path announces once and does not block free navigation", () => {
  const gateSrc = read("src/premium/PremiumGate.tsx");
  assert.ok(gateSrc.includes("StatusAnnouncement"), "loading is announced, not silent");
  assert.ok(gateSrc.includes('visible={false}'), "the announcement is not visually duplicated");
  assert.ok(gateSrc.includes("LayoutSkeleton"), "loading uses the shared skeleton");
  assert.ok(!/router\.replace|router\.push/.test(gateSrc), "the gate never redirects the user away");
});

// --- release configuration is untouched ------------------------------------

test("no EAS project linkage, update channel or OTA configuration was introduced", () => {
  const app = JSON.parse(read("app.json"));
  assert.equal(app.expo?.extra?.eas?.projectId, undefined, "no EAS project id");
  assert.equal(app.expo?.updates, undefined, "no updates block");
  const eas = JSON.parse(read("eas.json"));
  for (const profile of Object.values(eas.build ?? {}) as any[]) {
    assert.equal(profile.channel, undefined, "no update channel");
  }
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.dependencies?.["expo-updates"], undefined, "expo-updates is not a dependency");
});

test("app identifiers, version and build configuration are unchanged", () => {
  const app = JSON.parse(read("app.json"));
  assert.equal(app.expo.version, "1.1.8");
  assert.equal(app.expo.ios.bundleIdentifier, "com.mazidigroup.apexai");
  assert.equal(app.expo.android.package, "com.mazidigroup.apexai");
  const eas = JSON.parse(read("eas.json"));
  assert.equal(eas.cli?.appVersionSource, "remote");
  assert.equal(eas.build?.production?.autoIncrement, true);
});

test("no analytics, telemetry or notification dependency was added", () => {
  const pkg = JSON.parse(read("package.json"));
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).join(" ");
  for (const banned of ["analytics", "amplitude", "mixpanel", "sentry", "segment", "firebase", "expo-notifications"]) {
    assert.ok(!deps.includes(banned), `${banned} must not be a dependency`);
  }
});

test("no cloud persistence for Plan, Workout or History was introduced", () => {
  // The Direction B client is local-first: it must never write a plan, workout or
  // history record to the server. (Legacy server routes predate Direction B and
  // are simply never called; Phase 4 adds no new call.)
  const files = ["src/anatomy/workoutStore.tsx", "src/plan/planStore.ts", "src/history/HistoryView.tsx", "src/premium/PremiumContext.tsx"];
  for (const rel of files) {
    const src = read(rel);
    assert.ok(!/apiPost\(\s*"\/(plan|workouts|history)/.test(src), `${rel} must not persist to the server`);
    assert.ok(!/apiPut|apiPatch/.test(src), `${rel} must not write to the server`);
  }
  // The only server call Premium makes is the entitlement re-validation trigger.
  const premium = read("src/premium/PremiumContext.tsx");
  const calls = premium.match(/apiPost\(\s*"[^"]+"/g) ?? [];
  assert.deepEqual(calls, ['apiPost("/billing/revenuecat/sync"']);
});

// --- catalogue and media regression ----------------------------------------

test("the live catalogue is still 208 unique valid entries over a 206-record pack", () => {
  const audit = catalogIntegrity();
  assert.equal(audit.count, 208);
  assert.equal(CATALOG_COUNT, 208);
  assert.equal((RAW_PACK as unknown[]).length, 206);
  assert.equal(audit.uniqueIdCount, 208);
  assert.deepEqual(audit.duplicateIds, []);
  assert.deepEqual(audit.missingName, []);
  assert.deepEqual(audit.missingEquipment, []);
  assert.ok(getCatalogExercise("cable-external-rotation"), "legacy-only exercise 1 still resolves");
  assert.ok(getCatalogExercise("seated-calf-raise"), "legacy-only exercise 2 still resolves");
  assert.equal(FULL_CATALOG.length, 208);
});

test("media is requested per row, never eagerly for the whole catalogue", () => {
  const library = read("app/(tabs)/library.tsx");
  assert.ok(!/Promise\.all\(\s*results\.map/.test(library), "no bulk media prefetch");
  assert.ok(!/prefetchAll|preloadAll/.test(library));
  const animation = read("src/components/ExerciseAnimation.tsx");
  assert.ok(!/unbounded|while \(true\)/.test(animation));
  assert.ok(animation.includes("exerciseId"), "each row resolves its own media");
});
