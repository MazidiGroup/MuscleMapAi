// Brand and paywall polish on the live 1.4.x line. The subscription contract
// itself (whole-app Premium, trial only with verified eligibility, prices from
// the store) is pinned by premium.test.ts and release.test.ts and untouched.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { sessionSetsByGroup } from "../src/anatomy/sessionGroups";
import { COPPER_RAMP, copperForCount } from "../src/anatomy/ui";

const ROOT = process.env.MMA_TEST_ROOT as string;
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), "utf8");

test("the paywall carries no blue and reads its trial as one sentence", () => {
  const src = read("src/premium/Paywall.tsx");
  assert.ok(!/rgba\((40,120,232|76,156,255)/.test(src), "no blue wash or blue pill");
  assert.ok(src.includes("t.palette.bgRadialFrom"), "the ambient glow is the app's own warm ground");
  assert.ok(src.includes("{`${terms.trial} ${terms.price}`}"), "trial and price share one line");
  assert.ok(src.includes("productTerms("), "terms still come from the store via productTerms");
});

test("the brand mark, app icon sources and watch icon are copper, never blue", () => {
  for (const f of ["assets/images/logo-mark.svg", "assets/images/logo-icon.svg", "targets/watch/watch-icon-source.svg"]) {
    const svg = read(f).toLowerCase();
    assert.ok(svg.includes("#f5c08c") || svg.includes("#d0783a"), `${f} carries the copper gradient`);
    assert.ok(!/#(8fd0ff|2f8dff|5aa7ff|1d6ae0|151d2e)/.test(svg), `${f} has no pre-copper blue`);
  }
  // watchOS masks icons to a circle; App Review rejected a black ground (guideline 4).
  const watch = read("targets/watch/watch-icon-source.svg").toLowerCase();
  assert.ok(!/<rect[^>]*fill="#000/.test(watch), "the watch icon ground is not black");
});

test("no pre-copper blue remains in UI chrome; red / amber / green stay legend-only", () => {
  const blue = /#(0A84FF|8fd0ff|175cbf|0e1729|5EA8FF|7CB8FF)|rgba\((10,132,255|47,141,255|40,120,232)/i;
  for (const f of [
    "app/login.tsx",
    "src/theme/semantic.ts",
    "src/ui/RootErrorBoundary.tsx",
    "src/anatomy/MuscleSheet.tsx",
    "app/(tabs)/library.tsx",
    "src/premium/Paywall.tsx",
  ]) {
    assert.ok(!blue.test(read(f)), `${f} carries no pre-copper blue`);
  }
  assert.ok(!read("src/anatomy/ui.ts").includes("GROUP_COLORS"), "the per-group rainbow is gone");
  assert.ok(!fs.existsSync(path.join(ROOT, "src/theme.ts")), "the legacy blue token file is gone");
});

// --- post-workout share card -------------------------------------------------------

test("the share card counts WORKING sets per primary group — warm-ups and 0-rep ticks never count", () => {
  const s = (reps: number, done = true, warmup = false) => ({ weight: 50, reps, done, warmup });
  const counts = sessionSetsByGroup([
    { exerciseId: "bench-press", sets: [s(8), s(8), s(10, true, true), s(0), s(8, false)] },
    { exerciseId: "push-up", sets: [s(12)] },
    { exerciseId: "no-such-exercise", sets: [s(8)] },
  ]);
  assert.equal(counts.chest, 3, "2 working bench sets + 1 push-up set");
});

test("the copper ramp encodes amount: idle at zero, brightest at the session max", () => {
  assert.equal(copperForCount(0, 6), COPPER_RAMP[0]);
  assert.equal(copperForCount(6, 6), COPPER_RAMP[4]);
  assert.equal(copperForCount(1, 6), COPPER_RAMP[1], "any work is visibly above idle");
});

test("Share previews a true 9:16 card and outputs 1080×1920, with text as the fallback", () => {
  const sheet = read("src/history/ShareCardSheet.tsx");
  assert.ok(sheet.includes("(cardW * 16) / 9"), "the captured view is itself 9:16");
  assert.ok(sheet.includes("width: OUT_W / scale") && sheet.includes("const OUT_W = 1080") && sheet.includes("const OUT_H = 1920"), "pixel ratio divided out");
  assert.ok(sheet.includes("Sharing.shareAsync") && sheet.includes("Share.share({ message: textMessage })"));
  const summary = read("app/summary.tsx");
  assert.ok(summary.includes('testID="summary-share"'), "the existing Share control and its testID stay");
  assert.ok(summary.includes("<ShareCardSheet"));
});
