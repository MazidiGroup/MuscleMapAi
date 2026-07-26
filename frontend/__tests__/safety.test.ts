// Static safety scans over the redesign source: launch safety, free surfaces,
// no telemetry, no cloud sync of Plan/Workout, no RevenueCat mutation.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

// The runner transpiles to a temp directory, so the source root is injected.
const ROOT = process.env.MMA_TEST_ROOT ?? path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) walk(rel, out);
    else if (/\.tsx?$/.test(e.name)) out.push(rel);
  }
  return out;
}

const NEW_SOURCES = [
  ...walk("src/owner"),
  ...walk("src/ui/state"),
  ...walk("src/session"),
  ...walk("src/units"),
  "src/theme/semantic.ts",
];

/** The complete active Plan + Workout data-access path, not just new folders. */
const DATA_PATH_SOURCES = [
  ...walk("src/plan"),
  ...walk("src/anatomy"),
  ...walk("src/owner"),
  ...walk("src/session"),
  ...walk("src/units"),
  ...walk("app"),
  "src/api.ts",
  "src/theme/ThemeContext.tsx",
];

const LEGACY_KEYS = [
  "mma.themeMode",
  "mma.plan.v1",
  "mma.plan.answers.v1",
  "mma.plan.seed.v1",
  "mma.plan.onboardingStep.v1",
  "mma.plan.completions.v1",
  "anat.workouts",
  "anat.prs",
  "anat.restPref",
  "apex.session_token",
];

/** Only these modules may name a legacy key at all. */
const LEGACY_ALLOWED = new Set([
  "src/owner/legacySources.ts", // read-only source table
  "src/owner/scopeKeys.ts", // preservation registry
  "src/theme/ThemeContext.tsx", // mma.themeMode stays global by contract
  "src/api.ts", // apex.session_token is the auth session, not app data
]);

test("cold launch never lands on a Premium tab", () => {
  const index = read("app/index.tsx").replace(/\/\/.*$/gm, "");
  assert.match(index, /href="\/\(tabs\)\/plan"/);
  assert.doesNotMatch(index, /explore|coach/i);
});

test("the five-tab shell is unchanged and has no sixth History tab", () => {
  const layout = read("app/(tabs)/_layout.tsx");
  const names = [...layout.matchAll(/<Tabs\.Screen\s+name="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(names, ["plan", "workout", "coach", "explore", "library", "learn"]);
  assert.match(layout, /name="learn"\s+options=\{\{ href: null \}\}/);
  assert.equal(names.includes("history"), false);
});

test("Workout muscle groups, History and Insights are free surfaces", () => {
  const workout = read("app/(tabs)/workout.tsx");
  assert.doesNotMatch(workout, /isPremium/);
  assert.doesNotMatch(workout, /Paywall/);
});

test("no analytics or telemetry is introduced by the new layer", () => {
  for (const f of NEW_SOURCES) {
    const src = read(f);
    assert.doesNotMatch(src, /amplitude|mixpanel|segment\.io|posthog|sentry|firebase|gtag|trackEvent/i, f);
  }
});

test("the new layer performs no network calls and no backend persistence", () => {
  for (const f of NEW_SOURCES) {
    const src = read(f);
    assert.doesNotMatch(src, /\bfetch\s*\(|XMLHttpRequest|axios|apiPost|apiGet|EXPO_PUBLIC_BACKEND_URL/, f);
  }
});

test("the new layer never touches RevenueCat", () => {
  for (const f of NEW_SOURCES) {
    assert.doesNotMatch(read(f), /react-native-purchases|Purchases\.|entitlement/i, f);
  }
});

test("no file in the active Plan/Workout data path references a legacy key", () => {
  for (const f of DATA_PATH_SOURCES) {
    if (LEGACY_ALLOWED.has(f)) continue;
    const src = read(f);
    for (const k of LEGACY_KEYS) {
      assert.equal(src.includes(`"${k}"`), false, `${f} references legacy key ${k}`);
      assert.equal(src.includes(`'${k}'`), false, `${f} references legacy key ${k}`);
    }
  }
});

test("legacy sources are reachable only through the migration subsystem", () => {
  const allowedImporters = new Set(["src/owner/migration.ts", "src/owner/legacySources.ts"]);
  for (const f of DATA_PATH_SOURCES) {
    if (allowedImporters.has(f)) continue;
    const src = read(f);
    assert.doesNotMatch(src, /legacySources/, `${f} must not import the legacy readers`);
    assert.doesNotMatch(src, /snapshotLegacy|readLegacy\(/, `${f} must not read legacy data`);
  }
});

test("the Plan and Workout stores persist only through the owner-scoped layer", () => {
  const plan = read("src/plan/planStore.ts");
  assert.doesNotMatch(plan, /from "@\/src\/utils\/storage"/, "no direct device storage in the Plan store");
  assert.match(plan, /writeGuarded/);
  assert.match(plan, /if \(!active\) return; \/\/ no read before the owner is resolved/);

  const workout = read("src/anatomy/workoutStore.tsx");
  assert.doesNotMatch(workout, /from "@\/src\/utils\/storage"/, "no direct device storage in the Workout store");
  assert.match(workout, /hydrateWorkoutScope/);
  assert.match(workout, /useOwner\(\)/);

  const scope = read("src/anatomy/workoutScope.ts");
  assert.match(scope, /writeGuarded/);
  for (const k of LEGACY_KEYS) assert.equal(scope.includes(`"${k}"`), false);
});

test("adoption of ownerless legacy data is never triggered automatically", () => {
  for (const f of DATA_PATH_SOURCES) {
    if (f === "src/owner/migration.ts") continue;
    assert.doesNotMatch(read(f), /adoptLegacy/, `${f} must not invoke adoption`);
  }
  const ctx = read("src/owner/OwnerContext.tsx");
  assert.match(ctx, /scanLegacy/, "launch only scans");
  assert.doesNotMatch(ctx, /adoptLegacy/);
  const migration = read("src/owner/migration.ts");
  assert.match(migration, /unclaimed_without_verified_owner/);
  assert.doesNotMatch(migration, /device_guest_only/);
  assert.doesNotMatch(migration, /not_guest_scope/);
});

test("owner ids are treated as opaque and safely encoded", () => {
  const keys = read("src/owner/scopeKeys.ts");
  assert.doesNotMatch(keys, /A-Za-z0-9_-\]\{4,128\}/, "no invented character/length rule");
  assert.match(keys, /encodeBase64Url/);
  assert.match(keys, /typeof id === "string" && id\.length > 0/);
});

test("owner-change handling is non-destructive", () => {
  const store = read("src/owner/scopedStore.ts");
  assert.match(store, /pendingKey/);
  // the only removals are of pending journal data or an explicit clear()
  const removals = [...store.matchAll(/this\.kv\.remove\(([^)]*)\)/g)].map((m) => m[1]);
  for (const r of removals) {
    assert.ok(
      r.includes("pending") || r.includes("this.keyFor(owner, domain"),
      `unexpected removal target: ${r}`,
    );
  }
  // no atomicity is claimed anywhere; the disclaimer is explicit
  assert.match(store, /There is no AsyncStorage transaction and none is claimed/);
});

test("the local-asset component carries no network wording", () => {
  const src = read("src/ui/state/LocalAssetFallback.tsx");
  const body = src.split("export function")[1] ?? src;
  assert.doesNotMatch(body, /offline|reconnect|connection|network|retry/i);
});

test("all fifteen State System components are exported", () => {
  const index = read("src/ui/state/index.ts");
  for (const c of [
    "InfoBanner",
    "OfflineBanner",
    "WarningBanner",
    "ErrorBanner",
    "EmptyState",
    "BlockingError",
    "LayoutSkeleton",
    "ActionButton",
    "RetryPanel",
    "PartialSuccessPanel",
    "LocalAssetFallback",
    "InterruptedSessionCard",
    "DestructiveConfirm",
    "OwnerEmptyState",
    "StatusAnnouncement",
  ]) {
    assert.ok(index.includes(c), `${c} must be exported`);
  }
});

test("skeletons are hidden from accessibility APIs and buttons meet the target contract", () => {
  const skeleton = read("src/ui/state/LayoutSkeleton.tsx");
  assert.match(skeleton, /accessibilityElementsHidden: true/);
  assert.match(skeleton, /importantForAccessibility: "no-hide-descendants"/);

  const button = read("src/ui/state/ActionButton.tsx");
  assert.match(button, /accessibilityRole="button"/);
  assert.match(button, /accessibilityState=\{\{ disabled: locked, busy \}\}/);
  assert.match(button, /minHeight: t\.target\.comfortable/);

  const tokens = read("src/theme/semantic.ts");
  assert.match(tokens, /target: \{ min: 44, comfortable: 52 \}/);
});

test("errors announce once and destructive confirmation restores focus", () => {
  const retry = read("src/ui/state/RetryPanel.tsx");
  assert.match(retry, /accessibilityRole="alert"/);
  assert.match(retry, /focusAccessibility\(titleRef\)/);

  const focus = read("src/ui/state/a11yFocus.ts");
  assert.match(focus, /Platform\.OS === "ios" \|\| Platform\.OS === "android"/, "focus APIs are native-only");

  const announce = read("src/ui/state/StatusAnnouncement.tsx");
  assert.match(announce, /message === last\.current/, "duplicate announcements are suppressed");

  const confirm = read("src/ui/state/DestructiveConfirm.tsx");
  assert.match(confirm, /accessibilityViewIsModal/);
  assert.match(confirm, /restoreFocusTo/);
});

test("the owner gate blocks rendering until the owner resolves", () => {
  const layout = read("app/_layout.tsx");
  assert.match(layout, /OwnerProvider/);
  assert.match(layout, /<OwnerGate>/);
  const gate = layout.slice(layout.indexOf("function OwnerGate"));
  assert.match(gate, /if \(!ready\) return <LoadingScreen \/>;/);
});
