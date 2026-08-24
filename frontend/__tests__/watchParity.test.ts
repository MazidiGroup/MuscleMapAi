// The watch app's Swift is a port of the TypeScript rules, and this keeps the
// two honest.
//
// A watchOS app cannot run the TypeScript, so `targets/watch/Rules.swift`
// re-implements what `src/watch/*.ts` specifies. Two implementations of one rule
// is a drift risk, and the drift that matters is silent: a rep ceiling raised on
// the phone and not on the watch means a set the watch accepts and the phone
// refuses, which the user sees as a set that vanished.
//
// This cannot compile Swift, so it does what it can — it reads the sources as
// text and fails when a shared constant, an event name or a refusal reason
// exists on one side and not the other. Control flow is not checked; the ports
// are kept structurally identical so a reviewer can diff them by eye.
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

import { MUTATING_COMMANDS, WorkoutCommand } from "../src/watch/commands";
import { ENTITLEMENT_CACHE_TTL_MS, ENTITLEMENT_FRESH_MS } from "../src/watch/gate";
import { MAX_BATCH } from "../src/watch/outbox";
import { MAX_REPS, MAX_WEIGHT, MIN_REPS, WATCH_SCHEMA_VERSION } from "../src/watch/protocol";
import { MAX_CLARIFY_CHOICES } from "../src/watch/resolve";
import { DEFAULT_REST_SECONDS } from "../src/watch/session";

const ROOT = process.env.MMA_TEST_ROOT ?? path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

/**
 * Source with `//` comments removed. These files explain themselves at length,
 * and a rule named in prose ("no transcript is kept") must not read as the
 * thing it forbids.
 */
const code = (source: string) => source.replace(/^\s*\/\/.*$/gm, "");

/**
 * The config plugin is CommonJS — Expo loads it with `require` at prebuild, and
 * an `import` here would not be the same module system it actually runs under.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const plugin = require(path.join(ROOT, "plugins/withWatchTarget.js"));

const MODEL = read("targets/watch/Model.swift");
const RULES = read("targets/watch/Rules.swift");
const SYNC = read("targets/watch/Sync.swift");
const INTENTS = read("targets/watch/Intents.swift");
const STORE = read("targets/watch/Store.swift");
const PLIST = read("targets/watch/Info.plist");

/** Reads `static let <name> = <number>` out of the Swift source. */
function swiftNumber(source: string, name: string): number {
  const match = new RegExp(`static let ${name} = ([0-9.]+)`).exec(source);
  assert.ok(match, `targets/watch/*.swift must declare ${name}`);
  return Number(match![1]);
}

// --- shared limits ----------------------------------------------------------

test("the watch and the phone agree on every shared limit", () => {
  assert.equal(swiftNumber(MODEL, "schemaVersion"), WATCH_SCHEMA_VERSION);
  assert.equal(swiftNumber(MODEL, "minReps"), MIN_REPS);
  assert.equal(swiftNumber(MODEL, "maxReps"), MAX_REPS);
  assert.equal(swiftNumber(MODEL, "maxWeightKg"), MAX_WEIGHT.kg);
  assert.equal(swiftNumber(MODEL, "maxWeightLb"), MAX_WEIGHT.lb);
  assert.equal(swiftNumber(MODEL, "entitlementCacheTtlMs"), ENTITLEMENT_CACHE_TTL_MS);
  assert.equal(swiftNumber(MODEL, "entitlementFreshMs"), ENTITLEMENT_FRESH_MS);
  assert.equal(swiftNumber(MODEL, "defaultRestSeconds"), DEFAULT_REST_SECONDS);
  assert.equal(swiftNumber(MODEL, "maxBatch"), MAX_BATCH);
  assert.equal(swiftNumber(MODEL, "maxClarifyChoices"), MAX_CLARIFY_CHOICES);
});

test("the pound is the exact one, on both sides", () => {
  assert.ok(MODEL.includes("0.45359237"), "the conversion constant must be exact, not rounded");
  assert.ok(read("src/units/weight.ts").includes("0.45359237"));
});

// --- shared vocabulary ------------------------------------------------------

test("every event kind on the wire exists on both sides", () => {
  const kinds = ["session.start", "exercise.add", "set.log", "set.revise", "set.void", "session.end"];
  const protocolTs = read("src/watch/protocol.ts");
  for (const kind of kinds) {
    assert.ok(protocolTs.includes(`"${kind}"`), `protocol.ts is missing ${kind}`);
    assert.ok(MODEL.includes(`"${kind}"`), `Model.swift is missing ${kind}`);
  }
});

test("every rejection reason exists on both sides", () => {
  const reasons = ["schema_unsupported", "invalid_payload", "unknown_session", "unknown_exercise", "not_entitled"];
  const protocolTs = read("src/watch/protocol.ts");
  for (const reason of reasons) {
    assert.ok(protocolTs.includes(`"${reason}"`), `protocol.ts is missing ${reason}`);
    assert.ok(MODEL.includes(`"${reason}"`), `Model.swift is missing ${reason}`);
    assert.ok(STORE.includes("rejectionCopy"), "a rejection must be explainable to the user");
  }
});

test("every refusal reason exists on both sides", () => {
  const commandsTs = read("src/watch/commands.ts");
  const reasons = [
    "not_entitled",
    "no_session",
    "session_already_running",
    "no_exercise_selected",
    "no_exercise_in_session",
    "reps_out_of_range",
    "weight_out_of_range",
    "nothing_to_undo",
    "nothing_to_revise",
    "needs_confirmation",
  ];
  for (const reason of reasons) {
    assert.ok(commandsTs.includes(`"${reason}"`), `commands.ts is missing ${reason}`);
    assert.ok(RULES.includes(`"${reason}"`), `Rules.swift is missing ${reason}`);
  }
});

test("every access basis exists on both sides", () => {
  const gateTs = read("src/watch/gate.ts");
  for (const basis of ["active_session_grace", "never_verified", "expired_cache", "not_premium"]) {
    assert.ok(gateTs.includes(`"${basis}"`), `gate.ts is missing ${basis}`);
    assert.ok(RULES.includes(`"${basis}"`), `Rules.swift is missing ${basis}`);
  }
});

test("the same commands are treated as mutating on both sides", () => {
  // Swift lists them positively in one `case` line; TypeScript in one array.
  const swiftMutating = /case \.startWorkout, \.selectExercise, \.logSet, \.reviseLastSet, \.undoLastSet, \.endWorkout: return true/;
  assert.match(RULES, swiftMutating, "Rules.swift must gate exactly the mutating commands");
  const expected: WorkoutCommand["kind"][] = [
    "startWorkout",
    "selectExercise",
    "logSet",
    "reviseLastSet",
    "undoLastSet",
    "endWorkout",
  ];
  assert.deepEqual([...MUTATING_COMMANDS].sort(), [...expected].sort());
});

// --- properties the ports must not lose --------------------------------------

test("the watch persists before it confirms a set", () => {
  // The whole offline guarantee is this ordering. If `announce` moved above
  // `persist`, the user would be told a set was saved that was not yet written.
  const persistAt = STORE.indexOf("persist()");
  const announceAt = STORE.indexOf("announce(feedback)");
  assert.ok(persistAt > 0 && announceAt > 0);
  assert.ok(persistAt < announceAt, "the outbox must be written before the user is told it is saved");
});

test("undo on the watch still confirms before it removes anything", () => {
  assert.match(RULES, /guard confirmed else\s*\{\s*return \.refused\(\s*reason: \.needsConfirmation/);
  assert.match(INTENTS, /requestConfirmation/, "the App Intent must ask, not assume");
});

test("the intents are adapters — none of them decides anything", () => {
  const body = code(INTENTS);
  assert.match(body, /WatchStore\.shared\.run\(/, "every intent routes to the one command path");
  // Declaring the accepted range to App Intents is fine — it lets Siri re-ask
  // instead of the app refusing. Running the check here would be a second copy
  // of the rule.
  //
  // The range cannot NAME the shared constant: `inclusiveRange` is macro-
  // expanded and rejects anything that is not a compile-time literal
  // ("expect a compile-time constant literal"), which is why this reads as two
  // numbers in the Swift. Pin them to the specification so the unavoidable
  // second copy cannot drift.
  const range = /inclusiveRange:\s*\((\d+),\s*(\d+)\)/.exec(INTENTS);
  assert.ok(range, "LogSetIntent must declare the accepted rep range to App Intents");
  assert.equal(Number(range![1]), MIN_REPS, "the declared minimum must be the shared MIN_REPS");
  assert.equal(Number(range![2]), MAX_REPS, "the declared maximum must be the shared MAX_REPS");
  assert.equal(/isValidReps|\.isValid\b/.test(body), false, "an intent must not validate");
  assert.equal(/WatchRules\./.test(body), false, "an intent must not reach past the store into the reducer");
});

test("no audio or transcript is retained anywhere in the watch app", () => {
  const sources = [MODEL, RULES, SYNC, STORE, INTENTS, read("targets/watch/Views.swift")];
  for (const source of sources) {
    const body = code(source);
    for (const banned of ["SFSpeechRecognizer", "AVAudioRecorder", "AVAudioEngine", "transcript", "AVAudioSession"]) {
      assert.ok(!body.includes(banned), `${banned} must not appear in the watch app`);
    }
  }
});

test("the watch app is paired to the production bundle identifier", () => {
  assert.ok(PLIST.includes("<key>WKCompanionAppBundleIdentifier</key>"));
  assert.ok(PLIST.includes("com.mazidigroup.apexai"), "the companion must name the shipping app");
  assert.ok(PLIST.includes("<key>WKApplication</key>"), "single-target watch app layout");
  assert.ok(PLIST.includes("NSSiriUsageDescription"));
});

// --- the config plugin ------------------------------------------------------

test("every Swift source the plugin copies actually exists", () => {
  for (const file of plugin.SWIFT_SOURCES) {
    const full = path.join(ROOT, plugin.SOURCE_DIR, file);
    assert.ok(fs.existsSync(full), `${file} is listed by the plugin but not present`);
  }
  assert.ok(fs.existsSync(path.join(ROOT, plugin.SOURCE_DIR, "Info.plist")));
});

test("the watch target is registered in the app config", () => {
  const app = JSON.parse(read("app.json"));
  assert.ok(
    app.expo.plugins.includes("./plugins/withWatchTarget"),
    "without this the watch target is never added at prebuild",
  );
});

test("the watchOS deployment target supports App Intents", () => {
  // App Intents and AppShortcutsProvider are watchOS 9+; the project targets 10.
  assert.ok(parseInt(plugin.WATCHOS_DEPLOYMENT_TARGET, 10) >= 9);
});

test("the Siri phrases name the app, which is what makes them resolvable", () => {
  const phrases = INTENTS.match(/"[^"]*\\\(\.applicationName\)[^"]*"/g) ?? [];
  assert.ok(phrases.length >= 6, `expected app-name phrases, found ${phrases.length}`);
});
