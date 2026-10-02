// v1.5.0 — body-first Today. The 2D body reads the recovery engine's own
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
  untrackedBody,
} from "../src/anatomy/bodyMap";
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
