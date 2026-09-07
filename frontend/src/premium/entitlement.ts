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

/**
 * Every gateable surface, named once. `app` is the root: the wall that stands
 * between onboarding and everything else.
 */
export type Surface =
  | "app"
  | "plan"
  | "workout.session"
  | "workout.history"
  | "workout.insights"
  | "library.exercises"
  | "library.exerciseDetail"
  | "library.account"
  | "explore"
  | "coach"
  | "library.muscles"
  | "library.learn"
  | "watch.session";

/**
 * The Premium set is the whole app. Muscle Map sells one thing: everything
 * after onboarding, opened with a subscription that starts with a free trial
 * (the trial itself is an App Store introductory offer; nothing here invents
 * one). Every surface stays named so Siri, Shortcuts, deep links and the watch
 * keep resolving through `gate()` exactly as before — the answer is simply
 * "Premium" for all of them, and `app` is the one wall a person actually meets.
 */
export const PREMIUM_SURFACES: Surface[] = [
  "app",
  "plan",
  "workout.session",
  "workout.history",
  "workout.insights",
  "library.exercises",
  "library.exerciseDetail",
  "library.account",
  "explore",
  "coach",
  "library.muscles",
  "library.learn",
  "watch.session",
];

/**
 * Empty on purpose. Onboarding (Welcome, the three questions, the build) is
 * not a surface — it runs before the wall and sells nothing — and account,
 * legal and development routes are exempted by the wall itself, not by being
 * "free". Kept as a list so a free tier can return by naming surfaces here.
 */
export const FREE_SURFACES: Surface[] = [];

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
// Paywall value list — the whole app, because the whole app is what is sold.
// ---------------------------------------------------------------------------

export const PREMIUM_VALUE_ITEMS: { icon: string; label: string; desc: string }[] = [
  { icon: "today", label: "A plan built around you", desc: "Your goal, your days and your equipment — rebuilt whenever they change" },
  { icon: "barbell", label: "Log every workout", desc: "Sets, weight and rest, with your History and weekly Insights" },
  { icon: "cube", label: "See what every movement trains", desc: "Rotate, isolate and inspect the body in interactive 3D anatomy" },
  { icon: "body", label: "Understand every muscle", desc: "Explore how muscles function and move, highlighted in 3D" },
  { icon: "sparkles", label: "A coach that knows your training", desc: "Ask why, what to change, and how to progress" },
  { icon: "school", label: "Learn workout anatomy", desc: "Build lasting knowledge with lessons and quizzes" },
  { icon: "watch", label: "Log sets from Apple Watch", desc: "Say the reps or turn the crown, phone left in your bag" },
];

/**
 * Copy that must never appear in the Premium value list because the area is
 * free. Nothing is free any more, so nothing is blocked — the list stays so a
 * returning free tier has somewhere to declare itself, and the test that reads
 * it keeps running.
 */
export const FREE_AREA_CLAIM_BLOCKLIST: string[] = [];

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
  /** The wordmark above the promise. Says which product is being sold. */
  eyebrow: "Muscle Map Premium",
  title: "Your training explained",
  subtitle: "Insight | Logs on your wrist | Coach at hand",
  /**
   * The lead benefit gets a worked example rather than a claim: the reader sees
   * the actual primary/secondary split before paying for it. Labels only — the
   * example carries no numbers it would have to keep true.
   */
  lead: {
    eyebrow: "Muscle insight",
    headline: "See what every movement trains",
    primaryLabel: "Primary",
    secondaryLabel: "Secondary",
  },
  /** The two supporting areas, stated plainly beneath the lead. */
  supporting: [
    { icon: "watch", label: "Watch logging", desc: "Log sets straight from your wrist" },
    { icon: "sparkles", label: "Coach insight", desc: "Guidance shaped by your training" },
  ],
  /** Opens the full value list, the data promise and the billing terms. */
  upgradeToggle: "What’s included",
  // There is no free tier to describe. What a person can rely on instead is
  // their own data: the answers and plan they just built are on this device and
  // open the moment Premium is active. Nothing here promises a free path.
  freeReassurance:
    "Your answers and plan are saved on this device and open the moment Premium is active. Manage or cancel the subscription anytime in your Apple ID settings.",
  selectPrompt: "Choose an option to continue",
  ctaUnselected: "Select an option",
  cta: (_label: string) => "Unlock Premium",
  ctaTrial: "Start free trial",
  loadingProducts: "Checking the current options with the App Store",
  noOffering: {
    title: "Options aren’t available right now",
    body: "We couldn’t load the current subscription options from the App Store. Nothing has changed on this device — try again in a moment.",
  },
  purchaseCancelled: "",
  purchaseFailed: {
    title: "Purchase didn’t go through",
    body: "You haven’t been charged for an incomplete purchase. Nothing has changed on this device.",
  },
  purchaseUnknown: {
    title: "We couldn’t confirm that purchase",
    body: "If it completed, Restore purchases will apply it. Nothing has changed on this device.",
  },
  refreshFailed: {
    title: "We couldn’t confirm Premium yet",
    body: "Your purchase may still be processing. Try Restore purchases in a moment. Nothing has changed on this device.",
  },
  purchaseVerified: "Premium is active on this device.",
  restoreBusy: "Checking for previous purchases",
  restoreVerified: "Premium restored on this device.",
  restoreNothing: "No previous purchase was found for this Apple ID.",
  restoreFailed: {
    title: "Restore didn’t finish",
    body: "Nothing has changed. You can try again in a moment.",
  },
  lockedTitle: (area: string) => `${area} is part of Premium`,
  lockedBody: "Everything in Muscle Map is part of Premium. Start a subscription, or restore a previous purchase, to continue.",
  /**
   * The wall is the only screen a returning or lapsed person can reach, so
   * account access lives on it: sign in for a returning subscriber, and sign
   * out / delete for a signed-in one (App Store 5.1.1(v): deletion must stay
   * reachable, subscription or not).
   */
  account: {
    signIn: "Already have an account? Sign in",
    signedInAs: (email: string) => `Signed in as ${email}`,
    signOut: "Sign out",
    deleteAccount: "Delete account",
  },
  /** The web build has no store; a retry there can never succeed. */
  webOnly: "Subscriptions are available in the Muscle Map app for iPhone. Your answers and plan are saved on this device.",
  legal: {
    restore: "Restore purchases",
    terms: "Terms of Use",
    privacy: "Privacy Policy",
  },
} as const;

/** Human names for the Premium areas, used by the locked value path. */
export const PREMIUM_AREA_NAMES: Record<
  "app" | "explore" | "coach" | "library.muscles" | "library.learn" | "watch.session",
  string
> = {
  app: "Muscle Map",
  explore: "The 3D anatomy explorer",
  coach: "AI Coach",
  "library.muscles": "The Muscle library",
  "library.learn": "Guided lessons",
  "watch.session": "Apple Watch logging",
};

/** Outcome-led entry copy for each locked surface. */
export const PREMIUM_ENTRY_COPY: Record<keyof typeof PREMIUM_AREA_NAMES, { title: string; body: string }> = {
  // The wall a person meets once their plan exists. Trial-agnostic on purpose:
  // whether a free week applies is the store's answer, shown on the options.
  app: {
    title: "Your plan is ready",
    body: "Everything in Muscle Map is part of Premium. Open your plan with a subscription — cancel anytime.",
  },
  coach: {
    title: "Train with a coach that knows your plan",
    body: "Ask why an exercise is included, what to change when equipment is busy, and how to progress next week.",
  },
  explore: {
    title: "See exactly what every exercise trains",
    body: "Rotate, isolate and inspect the muscles behind your workouts in interactive 3D.",
  },
  "library.muscles": {
    title: "Understand the muscles behind your plan",
    body: "Explore muscle function, movement and 3D highlighting whenever you need it.",
  },
  "library.learn": {
    title: "Learn the anatomy that makes training click",
    body: "Build practical knowledge with guided lessons and short quizzes.",
  },
  "watch.session": {
    title: "Run your whole session from your wrist",
    body: "Say how many reps you did, or turn the Digital Crown. Your sets reach your iPhone on their own, even if you trained without a signal.",
  },
};
