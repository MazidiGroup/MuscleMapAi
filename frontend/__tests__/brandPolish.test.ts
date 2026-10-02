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
