// v1.5.0 — body-first Today and the shareable finish card. The 2D body reads the recovery engine's own
// per-group output, never invents a readiness number, and is free.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  bodyStatesFromRecovery,
  fitsRecovery,
  primaryGroupsOf,
  readinessPercent,
  revealOrder,
  sessionSetsByGroup,
  untrackedBody,
} from "../src/anatomy/bodyMap";
import { COPPER_RAMP, copperForCount } from "../src/anatomy/ui";
import { GYM_GROUPS } from "../src/anatomy/groups";

const ROOT = process.env.MMA_TEST_ROOT as string;
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), "utf8");

const g = (group: string, state: string, pct: number, lastTs: number | null) => ({ group, state, pct, lastTs });

test("the engine's 'untrained' reaches the body as 'untracked'; the other four pass through", () => {
  const states = bodyStatesFromRecovery([
    g("chest", "fatigued", 0.2, 1),
    g("back", "recovering", 0.7, 1),
    g("quads", "ready", 1, 1),
    g("calves", "undertrained", 1, 1),
    g("core", "untrained", 0, null),
  ]);
  assert.deepEqual(states, {
    chest: "fatigued",
    back: "recovering",
    quads: "ready",
    calves: "undertrained",
    core: "untracked",
  });
});

test("the empty state draws every gym group untracked", () => {
  const body = untrackedBody();
  assert.deepEqual(Object.keys(body).sort(), Object.keys(GYM_GROUPS).sort());
  assert.ok(Object.values(body).every((s) => s === "untracked"));
});

test("readiness is the mean over TRACKED groups only, and null with no history", () => {
  assert.equal(readinessPercent([g("chest", "untrained", 0, null)]), null);
  assert.equal(readinessPercent([]), null);
  assert.equal(
    readinessPercent([g("chest", "fatigued", 0.2, 1), g("back", "ready", 1, 1), g("core", "untrained", 0, null)]),
    60,
    "an untracked group must not drag the mean toward zero",
  );
});

test("a day fits recovery only when every primary group is ready, recovering or undertrained", () => {
  const states = { chest: "ready", shoulders: "recovering", arms: "undertrained", quads: "fatigued", back: "untracked" } as const;
  assert.equal(fitsRecovery(["chest", "shoulders", "arms"], states), true);
  assert.equal(fitsRecovery(["chest", "quads"], states), false, "one fatigued group breaks it");
  assert.equal(fitsRecovery(["back"], states), false, "no history is not claimed as fitting");
  assert.equal(fitsRecovery([], states), false);
});

test("primary groups come from the engine's node → group mapping", () => {
  assert.deepEqual(primaryGroupsOf("bench-press"), ["chest"]);
  assert.deepEqual(primaryGroupsOf("no-such-exercise", "quads"), ["quads"], "plan muscle is the fallback");
  assert.deepEqual(primaryGroupsOf("no-such-exercise", "not-a-group"), []);
});

test("the Today body is free: no premium check inside BodyMap2D or bodyMap", () => {
  for (const f of ["src/anatomy/BodyMap2D.tsx", "src/anatomy/bodyMap.ts"]) {
    const src = read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.ok(!/premium|PremiumGate|usePremium|entitlement|gate\(/i.test(src), f);
  }
});

test("Today shows the body above today's card, routes to Explore, and has the empty copy", () => {
  const plan = read("src/plan/PlanViews.tsx");
  const hero = plan.indexOf('testID="today-hero"');
  const body = plan.indexOf('testID="today-body"');
  const start = plan.indexOf('testID="wp-start-today"');
  assert.ok(hero > 0 && hero < body && body < start, "hero, then body, then today's card");
  assert.ok(plan.includes('router.push("/(tabs)/explore")'), "the body opens Explore");
  assert.ok(plan.includes("Log your first workout to see your recovery map."));
  assert.ok(plan.includes("UP NEXT · FITS YOUR RECOVERY"));
  assert.ok(plan.includes("computeRecovery(w.history)"), "the same engine as the Insights heat map");
  // Explore keeps its gate; Today does not add one.
  assert.ok(read("app/(tabs)/explore.tsx").includes('<PremiumGate surface="explore">'));
});

// --- finish card --------------------------------------------------------------

const set = (reps: number, done = true, warmup = false) => ({ weight: 50, reps, done, warmup });

test("the finish body counts WORKING sets per primary group — warm-ups and 0-rep ticks do not count", () => {
  const counts = sessionSetsByGroup([
    { exerciseId: "bench-press", sets: [set(8), set(8), set(10, true, true), set(0), set(8, false)] },
    { exerciseId: "push-up", sets: [set(12)] },
    { exerciseId: "no-such-exercise", sets: [set(8)] },
  ]);
  assert.equal(counts.chest, 3, "2 working bench sets + 1 push-up set");
  assert.ok(!("undefined" in counts));
});

test("muscles reveal most-worked first, ties in head-to-toe order", () => {
  assert.deepEqual(revealOrder({ quads: 3, chest: 6, back: 3, calves: 0 }), ["chest", "back", "quads"]);
});

test("the copper ramp encodes amount: idle at zero, brightest at the session max", () => {
  assert.equal(copperForCount(0, 6), COPPER_RAMP[0]);
  assert.equal(copperForCount(6, 6), COPPER_RAMP[4]);
  assert.equal(copperForCount(1, 6), COPPER_RAMP[1], "any work is visibly above idle");
  assert.equal(copperForCount(5, 0), COPPER_RAMP[0]);
});

test("the finish screen shares a 9:16 card and does not bring back activation percentages", () => {
  const src = read("app/summary.tsx");
  assert.ok(src.includes('testID="summary-share"'));
  assert.ok(src.includes("captureRef(heroRef"), "the hero itself is captured");
  assert.ok(/width: 1080, height: 1920/.test(src), "9:16 output");
  assert.ok(src.includes("(heroW * 16) / 9"), "the captured view is itself 9:16, so nothing stretches");
  assert.ok(src.includes("Sharing.shareAsync"));
  assert.ok(src.includes("<BrandMark"), "the card carries the logo and wordmark");
  assert.ok(!/MUSCLE ACTIVATION|Muscle Activation|activation %|pct\s*\*\s*100/i.test(src));
  assert.ok(src.includes('testID="summary-done"'), "existing testIDs survive");
});

// --- numeral display face -------------------------------------------------------

test("the numeral face is bundled, loaded before the splash hides, and used only for big numbers", () => {
  for (const f of ["assets/fonts/BarlowCondensed-ExtraBold.ttf", "assets/fonts/BarlowCondensed-Bold.ttf", "assets/fonts/BarlowCondensed-OFL.txt"]) {
    assert.ok(fs.existsSync(path.join(ROOT, f)), f);
  }
  const layout = read("app/_layout.tsx");
  assert.ok(layout.includes("useFonts(DISPLAY_FONT_FILES)"));
  assert.ok(layout.includes("(!displayLoaded && !displayError)) return null"), "nothing renders under the splash until it settles");

  const semantic = read("src/theme/semantic.ts");
  assert.match(semantic, /fontSize: 34,\s*lineHeight: 36,\s*fontVariant: \["tabular-nums"\]/);

  const users = ["src/plan/PlanViews.tsx", "app/summary.tsx", "src/anatomy/RestTimer.tsx", "src/anatomy/InsightsView.tsx"];
  for (const f of users) assert.ok(read(f).includes("...NUMERAL_TYPE"), `${f} uses the numeral role`);
  // Exactly the five sanctioned places, and nowhere else in the app tree.
  const count = users.reduce((a, f) => a + (read(f).match(/\.\.\.NUMERAL_TYPE/g) || []).length, 0);
  assert.equal(count, 5, "readiness, summary volume, rest countdown, streak count, stat-card value");
});
