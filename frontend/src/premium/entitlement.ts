// Phase 4 — the ONE Premium-resolution contract.
//
// Everything about "does this owner have Premium, why, and what may they open"
// is decided here. Screens never re-derive entitlement rules and never inspect
// RevenueCat payloads directly. Kept pure so the whole contract is testable
// without a renderer, a device or a network.
//
// The designated entitlement identifier below is the EXISTING RevenueCat
// entitlement. This file interprets it consistently; it does not create,
// rename or configure anything in RevenueCat.

export const PREMIUM_ENTITLEMENT_ID = "premium";

/** Where an unlock came from. Precedence is fixed — see resolvePremium. */
export type PremiumSource = "reviewer_bypass" | "manual_grant" | "revenuecat" | "none";

/** Lifecycle of the entitlement read itself, kept separate from the answer. */
export type EntitlementState = "loading" | "ready" | "error";

export type PremiumResolution = {
  /** The single boolean the app gates on. */
  access: boolean;
  source: PremiumSource;
  state: EntitlementState;
};

/**
 * Exact-entitlement rule. An unrelated active entitlement never grants Premium,
 * and a matching-but-inactive entitlement never does either (RevenueCat only
 * lists active entitlements under `entitlements.active`, and we re-check the
 * `isActive` flag when the SDK provides it).
 */
export function hasDesignatedEntitlement(customerInfo: unknown): boolean {
  const active = (customerInfo as any)?.entitlements?.active;
  if (!active || typeof active !== "object") return false;
  if (!Object.prototype.hasOwnProperty.call(active, PREMIUM_ENTITLEMENT_ID)) return false;
  const ent = active[PREMIUM_ENTITLEMENT_ID];
  if (!ent) return false;
  return ent.isActive === undefined ? true : ent.isActive === true;
}

/**
 * The server's answer, read from /auth/me. `premium_source` is the backend's own
 * precedence result over its subscription records; anything we don't recognise is
 * treated as a plain (RevenueCat-validated) server grant.
 */
export function serverGrant(user: unknown): { premium: boolean; source: PremiumSource } {
  const u = user as any;
  if (!u?.is_premium) return { premium: false, source: "none" };
  const raw = typeof u.premium_source === "string" ? u.premium_source : "";
  if (raw === "review_bypass") return { premium: true, source: "reviewer_bypass" };
  if (raw === "manual_grant") return { premium: true, source: "manual_grant" };
  return { premium: true, source: "revenuecat" };
}

export type ResolveInput = {
  /** /auth/me user object, or null when signed out / local guest. */
  user: unknown;
  /** Result of hasDesignatedEntitlement on the freshest CustomerInfo we hold. */
  designatedEntitlementActive: boolean;
  /** Lifecycle of the RevenueCat read. */
  revenueCatState: EntitlementState;
  /** True while the account itself is still being resolved. */
  authLoading?: boolean;
};

/**
 * Precedence: authorised reviewer bypass > valid manual grant > active
 * designated RevenueCat entitlement > no access.
 *
 * Two safety rules are absolute:
 *  - loading never unlocks Premium;
 *  - a failed RevenueCat read never fabricates Premium (only an existing
 *    server-side grant can still be true during a client SDK failure).
 */
export function resolvePremium(input: ResolveInput): PremiumResolution {
  const { premium: serverPremium, source: serverSource } = serverGrant(input.user);

  if (serverPremium && (serverSource === "reviewer_bypass" || serverSource === "manual_grant")) {
    return { access: true, source: serverSource, state: "ready" };
  }

  if (input.designatedEntitlementActive && input.revenueCatState !== "loading") {
    return { access: true, source: "revenuecat", state: "ready" };
  }

  if (serverPremium) return { access: true, source: "revenuecat", state: "ready" };

  if (input.authLoading || input.revenueCatState === "loading") {
    return { access: false, source: "none", state: "loading" };
  }

  return { access: false, source: "none", state: input.revenueCatState === "error" ? "error" : "ready" };
}

// ---------------------------------------------------------------------------
// One gating contract for the whole app.
// ---------------------------------------------------------------------------

/** Every gateable surface in Direction B, named once. */
export type Surface =
  | "plan"
  | "workout.session"
  | "workout.history"
  | "workout.insights"
  | "workout.muscleGroups"
  | "library.exercises"
  | "library.exerciseDetail"
  | "library.account"
  | "explore"
  | "coach"
  | "library.muscles"
  | "library.learn";

/** Frozen Direction B Premium set — exactly four surfaces. */
export const PREMIUM_SURFACES: Surface[] = ["explore", "coach", "library.muscles", "library.learn"];

export const FREE_SURFACES: Surface[] = [
  "plan",
  "workout.session",
  "workout.history",
  "workout.insights",
  "workout.muscleGroups",
  "library.exercises",
  "library.exerciseDetail",
  "library.account",
];

export function isPremiumSurface(surface: Surface): boolean {
  return PREMIUM_SURFACES.includes(surface);
}

/** What a surface should render right now. Free surfaces are never gated. */
export type GateDecision = "allow" | "loading" | "locked";

export function gate(surface: Surface, resolution: PremiumResolution): GateDecision {
  if (!isPremiumSurface(surface)) return "allow";
  if (resolution.access) return "allow";
  // A loading or failed entitlement read must not silently unlock, and must not
  // trap the user either: "locked" always routes to the dismissible value path.
  return resolution.state === "loading" ? "loading" : "locked";
}

// ---------------------------------------------------------------------------
// Paywall value list — only the frozen Premium areas may appear.
// ---------------------------------------------------------------------------

export const PREMIUM_VALUE_ITEMS: { icon: string; label: string; desc: string }[] = [
  { icon: "cube", label: "3D anatomy explorer", desc: "Rotate, isolate and inspect the full body model" },
  { icon: "sparkles", label: "AI Coach", desc: "Ask training questions and get sourced answers" },
  { icon: "body", label: "Library Muscles", desc: "Muscle-by-muscle reference with 3D highlighting" },
  { icon: "school", label: "Library Learn", desc: "Guided anatomy lessons with quizzes" },
];

/** Copy that must never appear in the Premium value list (these areas are Free). */
export const FREE_AREA_CLAIM_BLOCKLIST = [
  "muscle groups",
  "insights",
  "history",
  "exercise library",
  "exercises",
  "exercise instructions",
  "plan",
  "workout logging",
  "recovery heatmap",
  "weekly analytics",
];

// ---------------------------------------------------------------------------
// Product presentation. Display data comes from the store, never from code.
// ---------------------------------------------------------------------------

export type ProductTerms = {
  /** Localised price exactly as the store formatted it. */
  price: string;
  /** Localised per-period equivalent, only when the store supplies one. */
  perPeriod: string;
  /** Renewal period, derived from the store's ISO 8601 period. */
  period: string;
  /** Trial line — present only when eligibility is verified. */
  trial: string;
};

/** ISO 8601 subscription period → words. The store owns the value; we only read it. */
export function periodWords(iso: string | null | undefined): string {
  if (!iso || typeof iso !== "string") return "";
  const m = iso.match(/^P(\d+)([DWMY])$/);
  if (!m) return "";
  const n = Number(m[1]);
  const unit = { D: "day", W: "week", M: "month", Y: "year" }[m[2]] as string;
  return n === 1 ? `1 ${unit}` : `${n} ${unit}s`;
}

export type TrialEligibility = "eligible" | "ineligible" | "unknown" | "none";

/**
 * Trial language appears only when eligibility is verified as eligible AND the
 * store actually offers an introductory free phase. Unknown eligibility falls
 * back to standard non-trial terms.
 */
export function trialLine(product: any, eligibility: TrialEligibility): string {
  if (eligibility !== "eligible") return "";
  const intro = product?.introPrice;
  if (!intro) return "";
  const free = typeof intro.price === "number" ? intro.price === 0 : false;
  if (!free) return "";
  const span = periodWords(intro.period);
  return span ? `Free for ${span}, then` : "Free trial, then";
}

/** Everything shown for a package, sourced from store data only. */
export function productTerms(product: any, eligibility: TrialEligibility = "unknown"): ProductTerms {
  const price = typeof product?.priceString === "string" ? product.priceString : "";
  const period = periodWords(product?.subscriptionPeriod);
  const perMonth = typeof product?.pricePerMonthString === "string" ? product.pricePerMonthString : "";
  const monthly = /^P1M$/.test(product?.subscriptionPeriod ?? "");
  return {
    price,
    perPeriod: !monthly && perMonth ? `${perMonth} / month` : "",
    period,
    trial: trialLine(product, eligibility),
  };
}

// ---------------------------------------------------------------------------
// Purchase and restore outcomes. Success requires verification.
// ---------------------------------------------------------------------------

export type PurchaseOutcome =
  | "verified"
  | "cancelled"
  | "failed"
  | "unknown"
  | "unavailable"
  | "refresh_failed";

export type RestoreOutcome = "verified" | "nothing_to_restore" | "failed";

/**
 * A purchase is only "verified" when the designated entitlement is active in the
 * CustomerInfo we read back (or an authorised non-RevenueCat grant already
 * applies). A user cancellation is a no-op, never an error.
 */
export function classifyPurchase(input: {
  cancelled?: boolean;
  threw?: boolean;
  entitlementActive?: boolean;
  existingGrant?: boolean;
  refreshFailed?: boolean;
}): PurchaseOutcome {
  if (input.cancelled) return "cancelled";
  if (input.threw) return "failed";
  if (input.entitlementActive || input.existingGrant) return "verified";
  if (input.refreshFailed) return "refresh_failed";
  return "unknown";
}

export function classifyRestore(input: { threw?: boolean; entitlementActive?: boolean; existingGrant?: boolean }): RestoreOutcome {
  if (input.threw) return "failed";
  if (input.entitlementActive || input.existingGrant) return "verified";
  return "nothing_to_restore";
}

/**
 * Every user-facing Premium line. No RevenueCat identifier, owner id, product id
 * or raw error text may appear here, and no copy may promise an automatic retry.
 */
export const PAYWALL_COPY = {
  title: "Unlock Premium",
  subtitle: "Premium adds the 3D anatomy areas and the AI Coach. Your Plan, workouts, History and the exercise library stay free.",
  freeReassurance: "Your Plan, workouts, History, Insights and the full exercise library stay free.",
  selectPrompt: "Choose an option to continue",
  ctaUnselected: "Select an option",
  cta: (label: string) => `Continue with ${label}`,
  loadingProducts: "Checking the current options with the App Store",
  noOffering: {
    title: "Options aren’t available right now",
    body: "We couldn’t load the current subscription options from the App Store. Everything free in the app still works.",
  },
  purchaseCancelled: "",
  purchaseFailed: {
    title: "Purchase didn’t go through",
    body: "You haven’t been charged for an incomplete purchase. The free parts of the app are unaffected.",
  },
  purchaseUnknown: {
    title: "We couldn’t confirm that purchase",
    body: "If it completed, Restore purchases will apply it. Nothing free in the app has changed.",
  },
  refreshFailed: {
    title: "We couldn’t confirm Premium yet",
    body: "Your purchase may still be processing. Try Restore purchases in a moment. Everything free keeps working.",
  },
  purchaseVerified: "Premium is active on this device.",
  restoreBusy: "Checking for previous purchases",
  restoreVerified: "Premium restored on this device.",
  restoreNothing: "No previous purchase was found for this Apple ID.",
  restoreFailed: {
    title: "Restore didn’t finish",
    body: "Nothing has changed. You can try again, and the free parts of the app are unaffected.",
  },
  lockedTitle: (area: string) => `${area} is part of Premium`,
  lockedBody: "Everything else — your Plan, workouts, History, Insights and the exercise library — stays free.",
  legal: {
    restore: "Restore purchases",
    terms: "Terms of Use",
    privacy: "Privacy Policy",
  },
} as const;

/** Human names for the four Premium areas, used by the locked value path. */
export const PREMIUM_AREA_NAMES: Record<"explore" | "coach" | "library.muscles" | "library.learn", string> = {
  explore: "The 3D anatomy explorer",
  coach: "AI Coach",
  "library.muscles": "The Muscle library",
  "library.learn": "Guided lessons",
};
