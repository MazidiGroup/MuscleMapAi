// Phase 3 — State-System coverage and copy safety.
//
// Two guarantees:
//   1. Every one of the 49 authoritative state-inventory entries has a recorded
//      disposition with evidence.
//   2. The implemented free surfaces contain no unsafe or obsolete copy.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import COVERAGE from "./fixtures/stateCoverage.json";
import { HISTORY_COPY } from "../src/history/metrics";
import { ADD_COPY } from "../src/library/addRouting";
import { LIBRARY_OFFLINE_COPY } from "../src/library/catalogQuery";

const ROOT = process.env.MMA_TEST_ROOT as string;

type Row = (typeof COVERAGE)[number];
const rows = COVERAGE as Row[];

/** The fifteen shared components exported by the Phase 1 State System barrel. */
const SHARED_COMPONENTS = [
  "ActionButton",
  "BlockingError",
  "DestructiveConfirm",
  "EmptyState",
  "ErrorBanner",
  "InfoBanner",
  "InterruptedSessionCard",
  "LayoutSkeleton",
  "LocalAssetFallback",
  "OfflineBanner",
  "OwnerEmptyState",
  "PartialSuccessPanel",
  "RetryPanel",
  "StatusAnnouncement",
  "WarningBanner",
];

test("all fifteen Phase 1 shared state components remain exported", () => {
  const barrel = fs.readFileSync(path.join(ROOT, "src/ui/state/index.ts"), "utf8");
  for (const name of SHARED_COMPONENTS) {
    assert.ok(new RegExp(`\\b${name}\\b`).test(barrel), `${name} is no longer exported`);
  }
  assert.equal(SHARED_COMPONENTS.length, 15);
});

test("every one of the 49 inventory entries has a disposition and evidence", () => {
  assert.equal(rows.length, 49);
  const ids = rows.map((r) => r.id);
  assert.deepEqual(ids, Array.from({ length: 49 }, (_, i) => i + 1), "ids 1–49, no gaps");
  for (const r of rows) {
    assert.ok(r.journey && r.trigger && r.type, `row ${r.id} missing inventory data`);
    assert.ok(["pass", "blocked", "not_applicable", "deferred"].includes(r.status), `row ${r.id} status`);
    assert.ok(r.file, `row ${r.id} has an implementation file`);
    if (r.status === "pass") assert.ok(r.test, `row ${r.id} passes, so it needs a test`);
    if (r.status !== "pass") assert.ok(r.note, `row ${r.id} is not a pass, so it needs blocker evidence`);
  }
});

test("every state type comes from the seven-type taxonomy", () => {
  const types = new Set(rows.map((r) => r.type.split("·")[0].trim().toLowerCase()));
  // The seven taxonomy families, with the qualifiers the inventory uses.
  const allowed = ["loading", "empty", "offline", "error", "partial success", "interrupted", "blocking", "destructive"];
  for (const t of types) {
    assert.ok(
      allowed.some((a) => t.includes(a)),
      `unexpected taxonomy type: ${t}`,
    );
  }
});

test("no implemented state promises an automatic retry, sync or a fake percentage", () => {
  const copy = [
    ...Object.values(HISTORY_COPY).map((v) => (Array.isArray(v) ? v.join(" ") : typeof v === "function" ? v(1) : v)),
    ...Object.values(ADD_COPY).map((v) => (typeof v === "function" ? v("X") : v)),
    LIBRARY_OFFLINE_COPY,
  ].join("\n");
  assert.ok(!/automatically retry|retrying automatically|will retry/i.test(copy));
  assert.ok(!/\d+% (complete|generated)/i.test(copy));
  assert.ok(!/skipped/i.test(copy));
  assert.ok(!/cloud|synced|sync your|another device|cross-device/i.test(copy));
});

// --- source scan -----------------------------------------------------------

const SCAN = [
  "app/_layout.tsx",
  "app/login.tsx",
  "app/summary.tsx",
  "app/exercise/[id].tsx",
  "app/(tabs)/plan.tsx",
  "app/(tabs)/workout.tsx",
  "app/(tabs)/library.tsx",
  "src/plan/OnboardingFlow.tsx",
  "src/plan/PlanViews.tsx",
  "src/plan/AdjustPlanSheet.tsx",
  "src/history/HistoryView.tsx",
  "src/library/FilterSheet.tsx",
  "src/library/AddToWorkoutSheet.tsx",
  "src/components/ExerciseAnimation.tsx",
  "src/anatomy/InsightsView.tsx",
];

/** Comments are not user-facing copy, so they are removed before any copy scan. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function scanSources(): { file: string; text: string }[] {
  return SCAN.map((f) => ({ file: f, text: fs.readFileSync(path.join(ROOT, f), "utf8") })).filter((s) => s.text);
}

test("the implemented surfaces are scanned, so this test cannot silently pass", () => {
  const sources = scanSources();
  assert.equal(sources.length, SCAN.length);
});

test("no obsolete guest CTA and no Skipped copy remains", () => {
  for (const { file, text } of scanSources()) {
    assert.ok(!/Continue as guest|Continue without an account|browse as guest/i.test(text), file);
    assert.ok(!/["'>]\s*Skipped/i.test(text), file);
  }
});

test("no user-facing copy claims cloud sync, cross-device recovery or automatic transfer", () => {
  for (const { file, text } of scanSources()) {
    // Comments are stripped: only rendered strings are audited.
    const copy = stripComments(text);
    assert.ok(!/(back(ed)? up to the cloud|cloud backup|sync(ed)? across devices|on your other devices)/i.test(copy), file);
    assert.ok(
      !/automatically transferred to your account/i.test(
        copy.replace(/not automatically transferred to your account/gi, ""),
      ),
      file,
    );
  }
});

test("no owner identifier, storage key or raw URL is rendered to the user", () => {
  for (const { file, text } of scanSources()) {
    assert.ok(!/mma\.own\.v1/.test(text), `${file} must not surface a storage key`);
    assert.ok(!/owner\.id|ownerId\}|token\.id\}/.test(text), `${file} must not surface an owner identifier`);
    assert.ok(!/\{(uri|url)\}|posterUrl\(.*\)\}/.test(text), `${file} must not print a raw URL`);
  }
});

test("network media never uses local-asset wording, and local assets never use reconnect wording", () => {
  const media = stripComments(fs.readFileSync(path.join(ROOT, "src/components/mediaState.ts"), "utf8"));
  assert.ok(/back online/i.test(media), "network media failure uses connection wording");
  assert.ok(!/missing (local )?asset|reinstall the app/i.test(media));
  const fallback = stripComments(fs.readFileSync(path.join(ROOT, "src/ui/state/LocalAssetFallback.tsx"), "utf8"));
  assert.ok(!/reconnect|back online|offline/i.test(fallback), "a genuinely local asset never asks the user to reconnect");
});

test("no telemetry, analytics or cloud persistence was introduced", () => {
  for (const { file, text } of scanSources()) {
    assert.ok(!/analytics|telemetry|amplitude|mixpanel|sentry/i.test(text), file);
    assert.ok(!/apiPost\(["']\/(history|workouts|plan)/.test(text), `${file} must not persist Plan/History to a server`);
  }
});

test("no legacy-adoption UI exists on any implemented surface", () => {
  for (const { file, text } of scanSources()) {
    assert.ok(!/use the data already on this device|import your (old|existing) data|claim this data/i.test(text), file);
  }
});

test("History and Insights stay Workout-tab segments — no sixth tab was added", () => {
  const tabs = fs.readFileSync(path.join(ROOT, "app/(tabs)/_layout.tsx"), "utf8");
  const screens = [...tabs.matchAll(/<Tabs\.Screen\s+name="([^"]+)"([\s\S]*?)\/>/g)]
    .filter((m) => !/href:\s*null/.test(m[2]))
    .map((m) => m[1]);
  assert.deepEqual(screens, ["plan", "workout", "coach", "explore", "library"]);
  assert.equal(screens.length, 5, `expected five tabs, found ${screens.join(", ")}`);
  assert.ok(!screens.includes("history"));
  const workout = fs.readFileSync(path.join(ROOT, "app/(tabs)/workout.tsx"), "utf8");
  assert.ok(/"session", "history", "insights", "exercises"/.test(workout), "History is a Workout-tab segment");
});

test("no Premium lock is attached to an individual exercise row", () => {
  const library = fs.readFileSync(path.join(ROOT, "app/(tabs)/library.tsx"), "utf8");
  const start = library.indexOf('{seg === "exercises" && (');
  const end = library.indexOf("</FilterSheet", start) >= 0 ? library.indexOf("</FilterSheet", start) : library.indexOf("<FilterSheet", start);
  const exercisesSection = library.slice(start, end);
  assert.ok(start > 0 && exercisesSection.length > 0);
  assert.ok(!/isPremium|Paywall|lock-closed/i.test(exercisesSection), "the Exercises section is entirely free");
  // Phase 4: the premium sections gate themselves through the single gating
  // contract (src/premium/entitlement.ts), and only themselves.
  assert.ok(/gate\("library\.muscles", resolution\)/.test(library));
  assert.ok(/gate\("library\.learn", resolution\)/.test(library));
  assert.ok(
    /\(seg === "muscles" && musclesDecision !== "allow"\) \|\| \(seg === "learn" && learnDecision !== "allow"\)/.test(library),
  );
});

test("no RevenueCat, EAS, version or identifier change was introduced by Phase 3", () => {
  // Pinned to the inherited values: Phase 3 must not bump or rename anything.
  const app = JSON.parse(fs.readFileSync(path.join(ROOT, "app.json"), "utf8"));
  assert.equal(app.expo.version, "1.1.8");
  assert.equal(app.expo.ios.bundleIdentifier, "com.mazidigroup.apexai");
  assert.equal(app.expo.android.package, "com.mazidigroup.apexai");
  // The pre-existing RevenueCat initialisation in app/_layout.tsx is untouched;
  // no Phase 3 surface talks to it at all.
  const rootLayout = fs.readFileSync(path.join(ROOT, "app/_layout.tsx"), "utf8");
  assert.ok(/Purchases\.setLogLevel\(LOG_LEVEL\.INFO\)/.test(rootLayout), "inherited init is unchanged");
  for (const { file, text } of scanSources()) {
    if (file === "app/_layout.tsx") continue;
    assert.ok(!/react-native-purchases|Purchases\./.test(text), `${file} must not touch RevenueCat`);
  }
});
