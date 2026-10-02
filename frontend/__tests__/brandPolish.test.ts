// Brand and paywall polish on the live 1.4.x line. The subscription contract
// itself (whole-app Premium, trial only with verified eligibility, prices from
// the store) is pinned by premium.test.ts and release.test.ts and untouched.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

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
