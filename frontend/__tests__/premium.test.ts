// Phase 4 — Premium resolution, gating, paywall correctness and purchase safety.
// Pure logic only: no device, no network, no RevenueCat call.
import assert from "node:assert/strict";
import test from "node:test";

import {
  FREE_AREA_CLAIM_BLOCKLIST,
  FREE_SURFACES,
  PAYWALL_COPY,
  PREMIUM_ENTITLEMENT_ID,
  PREMIUM_SURFACES,
  PREMIUM_VALUE_ITEMS,
  Surface,
  classifyPurchase,
  classifyRestore,
  gate,
  hasDesignatedEntitlement,
  isPremiumSurface,
  periodWords,
  productTerms,
  resolvePremium,
  serverGrant,
  trialLine,
} from "../src/premium/entitlement";

const info = (active: Record<string, unknown>) => ({ entitlements: { active } });
const ready = { revenueCatState: "ready" as const };

// --- designated entitlement -------------------------------------------------

test("the designated entitlement identifier is the existing one", () => {
  assert.equal(PREMIUM_ENTITLEMENT_ID, "premium");
});

test("only the exact designated entitlement grants Premium", () => {
  assert.equal(hasDesignatedEntitlement(info({ premium: { isActive: true } })), true);
  assert.equal(hasDesignatedEntitlement(info({ premium: {} })), true, "no isActive flag = listed as active");
  assert.equal(hasDesignatedEntitlement(info({ pro: { isActive: true } })), false, "another entitlement never unlocks");
  assert.equal(hasDesignatedEntitlement(info({ Premium: { isActive: true } })), false, "identifiers are case-sensitive");
  assert.equal(hasDesignatedEntitlement(info({ premium: { isActive: false } })), false);
  assert.equal(hasDesignatedEntitlement(info({})), false);
  assert.equal(hasDesignatedEntitlement(null), false);
  assert.equal(hasDesignatedEntitlement({}), false);
});

test("multiple active entitlements including the designated one grant Premium", () => {
  assert.equal(hasDesignatedEntitlement(info({ pro: { isActive: true }, premium: { isActive: true } })), true);
});

// --- precedence -------------------------------------------------------------

test("reviewer bypass has the highest precedence", () => {
  const r = resolvePremium({
    user: { is_premium: true, premium_source: "review_bypass" },
    designatedEntitlementActive: false,
    ...ready,
  });
  assert.deepEqual(r, { access: true, source: "reviewer_bypass", state: "ready" });
});

test("a manual grant outranks the RevenueCat entitlement", () => {
  const r = resolvePremium({
    user: { is_premium: true, premium_source: "manual_grant" },
    designatedEntitlementActive: true,
    ...ready,
  });
  assert.equal(r.source, "manual_grant");
  assert.equal(r.access, true);
});

test("the designated RevenueCat entitlement grants Premium with no server grant", () => {
  const r = resolvePremium({ user: null, designatedEntitlementActive: true, ...ready });
  assert.deepEqual(r, { access: true, source: "revenuecat", state: "ready" });
});

test("no grant and no entitlement means no Premium", () => {
  const r = resolvePremium({ user: { is_premium: false }, designatedEntitlementActive: false, ...ready });
  assert.deepEqual(r, { access: false, source: "none", state: "ready" });
});

test("an unrelated entitlement cannot reach the resolver as Premium", () => {
  const active = hasDesignatedEntitlement(info({ pro: { isActive: true } }));
  const r = resolvePremium({ user: null, designatedEntitlementActive: active, ...ready });
  assert.equal(r.access, false);
});

test("server precedence is read from premium_source, unknown values fall back to RevenueCat", () => {
  assert.deepEqual(serverGrant({ is_premium: true, premium_source: "review_bypass" }), { premium: true, source: "reviewer_bypass" });
  assert.deepEqual(serverGrant({ is_premium: true, premium_source: "manual_grant" }), { premium: true, source: "manual_grant" });
  assert.deepEqual(serverGrant({ is_premium: true, premium_source: "something_else" }), { premium: true, source: "revenuecat" });
  assert.deepEqual(serverGrant({ is_premium: false, premium_source: "manual_grant" }), { premium: false, source: "none" });
  assert.deepEqual(serverGrant(null), { premium: false, source: "none" });
});

// --- loading / error safety -------------------------------------------------

test("loading never unlocks Premium", () => {
  const r = resolvePremium({ user: null, designatedEntitlementActive: true, revenueCatState: "loading" });
  assert.equal(r.access, false);
  assert.equal(r.state, "loading");
  const a = resolvePremium({ user: null, designatedEntitlementActive: false, revenueCatState: "ready", authLoading: true });
  assert.equal(a.access, false);
  assert.equal(a.state, "loading");
});

test("a failed entitlement read never fabricates Premium", () => {
  const r = resolvePremium({ user: { is_premium: false }, designatedEntitlementActive: false, revenueCatState: "error" });
  assert.equal(r.access, false);
  assert.equal(r.state, "error");
});

test("an existing server grant survives a client RevenueCat failure", () => {
  const r = resolvePremium({
    user: { is_premium: true, premium_source: "manual_grant" },
    designatedEntitlementActive: false,
    revenueCatState: "error",
  });
  assert.equal(r.access, true);
});

test("an owner switch that clears entitlement state removes access immediately", () => {
  const signedIn = resolvePremium({ user: { is_premium: true, premium_source: "revenuecat" }, designatedEntitlementActive: true, ...ready });
  assert.equal(signedIn.access, true);
  // Sign-out / switch: user becomes null and the provider resets the RC flag.
  const afterSwitch = resolvePremium({ user: null, designatedEntitlementActive: false, revenueCatState: "loading" });
  assert.equal(afterSwitch.access, false, "the previous owner's Premium is not inherited");
});

// --- gating contract --------------------------------------------------------

test("exactly four surfaces are Premium and the Direction B free set is untouched", () => {
  assert.deepEqual([...PREMIUM_SURFACES].sort(), ["coach", "explore", "library.learn", "library.muscles"]);
  for (const free of [
    "plan",
    "workout.session",
    "workout.history",
    "workout.insights",
    "workout.muscleGroups",
    "library.exercises",
    "library.exerciseDetail",
    "library.account",
  ] as Surface[]) {
    assert.ok(FREE_SURFACES.includes(free), free);
    assert.equal(isPremiumSurface(free), false, `${free} must stay free`);
  }
});

test("free surfaces are never gated, whatever the entitlement state says", () => {
  const states = [
    { user: null, designatedEntitlementActive: false, revenueCatState: "loading" as const },
    { user: null, designatedEntitlementActive: false, revenueCatState: "error" as const },
    { user: { is_premium: false }, designatedEntitlementActive: false, revenueCatState: "ready" as const },
  ];
  for (const s of states) {
    const r = resolvePremium(s);
    for (const free of FREE_SURFACES) assert.equal(gate(free, r), "allow", `${free} during ${s.revenueCatState}`);
  }
});

test("Premium surfaces lock, show loading, or allow — never anything else", () => {
  const locked = resolvePremium({ user: null, designatedEntitlementActive: false, ...ready });
  const loading = resolvePremium({ user: null, designatedEntitlementActive: false, revenueCatState: "loading" });
  const failed = resolvePremium({ user: null, designatedEntitlementActive: false, revenueCatState: "error" });
  const allowed = resolvePremium({ user: null, designatedEntitlementActive: true, ...ready });
  for (const s of PREMIUM_SURFACES) {
    assert.equal(gate(s, locked), "locked");
    assert.equal(gate(s, loading), "loading", "loading must not unlock");
    assert.equal(gate(s, failed), "locked", "a failure routes to the value path, it does not trap");
    assert.equal(gate(s, allowed), "allow");
  }
});

// --- paywall copy -----------------------------------------------------------

test("the paywall value list contains only the four frozen Premium areas", () => {
  assert.equal(PREMIUM_VALUE_ITEMS.length, 4);
  const text = PREMIUM_VALUE_ITEMS.map((v) => `${v.label} ${v.desc}`).join(" ").toLowerCase();
  assert.ok(text.includes("3d anatomy"));
  assert.ok(text.includes("coach"));
  assert.ok(text.includes("muscles"));
  assert.ok(text.includes("learn"));
});

test("no free area is advertised as Premium", () => {
  const listed = PREMIUM_VALUE_ITEMS.map((v) => `${v.label} ${v.desc}`.toLowerCase());
  for (const claim of FREE_AREA_CLAIM_BLOCKLIST) {
    for (const item of listed) {
      // "Library Muscles"/"Library Learn" are Premium; the blocked words are the
      // free areas, and none of them may appear in a value item.
      assert.ok(!item.includes(claim), `${claim} must not be advertised as Premium (${item})`);
    }
  }
});

test("the paywall names what stays free and never claims a guaranteed result", () => {
  const all = JSON.stringify(PAYWALL_COPY).toLowerCase();
  assert.ok(PAYWALL_COPY.freeReassurance.toLowerCase().includes("history"));
  assert.ok(PAYWALL_COPY.freeReassurance.toLowerCase().includes("insights"));
  for (const banned of ["guarantee", "cure", "medical", "hurry", "limited time", "expires in", "only today"]) {
    assert.ok(!all.includes(banned), banned);
  }
  for (const banned of ["£", "$", "usd", "gbp", "eur", "/month for", "7-day free", "50% off"]) {
    assert.ok(!all.includes(banned), `copy must not hardcode ${banned}`);
  }
  assert.ok(!/automatically retry|will retry/.test(all));
});

test("no user-facing Premium copy exposes an internal identifier", () => {
  // Only the copy VALUES are user-facing; object keys are code, not text.
  const values: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") values.push(v);
    else if (typeof v === "function") values.push(String((v as (s: string) => string)("Option")));
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(PAYWALL_COPY);
  const all = values.join(" ").toLowerCase();
  for (const banned of ["revenuecat", "entitlement", "app_user_id", "offering", "product_id", "sk_", "appl_"]) {
    assert.ok(!all.includes(banned), banned);
  }
});

test("restore, terms and privacy are part of the contract", () => {
  assert.equal(PAYWALL_COPY.legal.restore, "Restore purchases");
  assert.equal(PAYWALL_COPY.legal.terms, "Terms of Use");
  assert.equal(PAYWALL_COPY.legal.privacy, "Privacy Policy");
});

test("the CTA never names, invents or implies a product", () => {
  assert.equal(PAYWALL_COPY.ctaUnselected, "Select an option");
  // The outcome-led CTA is deliberately product-agnostic: the exact localised
  // product, price and renewal terms are repeated beneath it from store data.
  assert.equal(PAYWALL_COPY.cta("Yearly"), "Unlock Premium");
  assert.ok(!PAYWALL_COPY.cta("Yearly").includes("Yearly"));
  // Trial wording is a separate label so it can never be shown without
  // verified eligibility and a real zero-price introductory phase.
  assert.equal(PAYWALL_COPY.ctaTrial, "Start free trial");
});

// --- product presentation ---------------------------------------------------

test("periods come from the store's ISO 8601 value, never from code", () => {
  assert.equal(periodWords("P1M"), "1 month");
  assert.equal(periodWords("P1Y"), "1 year");
  assert.equal(periodWords("P3M"), "3 months");
  assert.equal(periodWords("P1W"), "1 week");
  assert.equal(periodWords(null), "");
  assert.equal(periodWords("garbage"), "");
});

test("price and per-period text are taken verbatim from store data", () => {
  const annual = productTerms({ priceString: "US$59.99", subscriptionPeriod: "P1Y", pricePerMonthString: "US$5.00" });
  assert.equal(annual.price, "US$59.99");
  assert.equal(annual.period, "1 year");
  assert.equal(annual.perPeriod, "US$5.00 / month");
  const monthly = productTerms({ priceString: "9,99 €", subscriptionPeriod: "P1M", pricePerMonthString: "9,99 €" });
  assert.equal(monthly.perPeriod, "", "a monthly product does not repeat its own per-month price");
  const bare = productTerms({});
  assert.deepEqual(bare, { price: "", perPeriod: "", period: "", trial: "" }, "nothing is invented");
});

test("trial language requires verified eligibility and a real free phase", () => {
  const product = { introPrice: { price: 0, period: "P1W" } };
  assert.equal(trialLine(product, "eligible"), "Free for 1 week, then");
  assert.equal(trialLine(product, "unknown"), "", "unknown eligibility uses standard terms");
  assert.equal(trialLine(product, "ineligible"), "");
  assert.equal(trialLine(product, "none"), "");
  assert.equal(trialLine({ introPrice: { price: 1.99, period: "P1W" } }, "eligible"), "", "a paid intro is not a trial");
  assert.equal(trialLine({}, "eligible"), "");
});

// --- purchase and restore safety -------------------------------------------

test("a purchase is only successful once the entitlement is verified", () => {
  assert.equal(classifyPurchase({ entitlementActive: true }), "verified");
  assert.equal(classifyPurchase({ entitlementActive: false }), "unknown", "an unverified purchase is never a success");
  assert.equal(classifyPurchase({ entitlementActive: false, existingGrant: true }), "verified");
  assert.equal(classifyPurchase({ entitlementActive: false, refreshFailed: true }), "refresh_failed");
});

test("user cancellation is a no-op, not an error", () => {
  assert.equal(classifyPurchase({ cancelled: true }), "cancelled");
  assert.equal(classifyPurchase({ cancelled: true, threw: true }), "cancelled");
  assert.equal(PAYWALL_COPY.purchaseCancelled, "", "cancelling shows no message at all");
});

test("a thrown purchase fails safely and says nothing was charged", () => {
  assert.equal(classifyPurchase({ threw: true }), "failed");
  assert.ok(PAYWALL_COPY.purchaseFailed.body.toLowerCase().includes("haven’t been charged"));
  assert.ok(PAYWALL_COPY.purchaseFailed.body.toLowerCase().includes("free"));
});

test("restore outcomes are verified, empty or failed — and each is honest", () => {
  assert.equal(classifyRestore({ entitlementActive: true }), "verified");
  assert.equal(classifyRestore({ entitlementActive: false }), "nothing_to_restore");
  assert.equal(classifyRestore({ entitlementActive: false, existingGrant: true }), "verified");
  assert.equal(classifyRestore({ threw: true }), "failed");
  assert.ok(PAYWALL_COPY.restoreNothing.toLowerCase().includes("no previous purchase"));
  assert.ok(PAYWALL_COPY.restoreFailed.body.toLowerCase().includes("nothing has changed"));
});

test("every failure state names what still works", () => {
  for (const state of [
    PAYWALL_COPY.noOffering.body,
    PAYWALL_COPY.purchaseFailed.body,
    PAYWALL_COPY.purchaseUnknown.body,
    PAYWALL_COPY.refreshFailed.body,
    PAYWALL_COPY.restoreFailed.body,
  ]) {
    assert.ok(/free|unaffected|keeps working|has changed/i.test(state), state);
  }
});
