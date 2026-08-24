// Premium enforcement for the watch companion.
//
// The phone owns the entitlement — the watch never talks to RevenueCat and never
// decides whether someone paid. It mirrors the phone's last VERIFIED answer with
// the time it was verified, and this module turns that pair into a decision.
//
// Three rules, and each exists because of a specific way this goes wrong:
//
//   · A cached "yes" expires. The watch spends most of its life out of contact
//     with the phone, so it has to work offline — but an entitlement that never
//     expires is a lifetime licence handed out by going into aeroplane mode.
//   · A never-verified watch is denied. Absence of an answer is not a yes, which
//     is the same rule `resolvePremium` already applies on the phone: loading
//     never unlocks and a failed read never fabricates access.
//   · A workout in progress is never cut off. If the subscription lapses or the
//     refresh fails mid-session, the user finishes the session they started and
//     the NEXT one is gated. Stopping someone mid-set to show them a paywall
//     destroys real work to enforce a boundary that can just as well be enforced
//     ninety seconds later.
//
// The grace in the third rule is anchored to this session's own grant, not to
// "a session exists". Logging a workout on the iPhone is FREE, so a session on
// its own is not evidence of anything; the watch records whether IT was allowed
// when it joined, and only that grant extends.
//
// Pure logic — no React, no storage, no store SDK.

import { EntitlementState } from "@/src/premium/entitlement";

/** The phone's last verified answer, as the watch holds it. */
export type WatchEntitlement = {
  /** The verified answer. `false` is an answer too and is trusted as one. */
  access: boolean;
  /** Lifecycle of the phone's read, mirrored so loading is distinguishable. */
  state: EntitlementState;
  /** Watch-local epoch ms of that verification. 0 means never verified. */
  verifiedAt: number;
};

export const NEVER_VERIFIED: WatchEntitlement = { access: false, state: "loading", verifiedAt: 0 };

/**
 * How long a verified "yes" keeps working with no contact from the phone.
 *
 * A week covers a normal training block for someone who leaves their phone in a
 * locker, and it bounds a lapsed subscription to at most one more week of use.
 */
export const ENTITLEMENT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Under this age the answer is treated as current rather than as a cache read. */
export const ENTITLEMENT_FRESH_MS = 60 * 60 * 1000;

export type AccessBasis =
  | "verified"
  | "cached"
  | "active_session_grace"
  | "never_verified"
  | "expired_cache"
  | "not_premium"
  | "loading";

export type WatchAccessDecision = { allow: boolean; basis: AccessBasis };

export type AccessInput = {
  now: number;
  /**
   * True when THIS watch was granted access as it joined the running session.
   * Never "a session exists" — iPhone logging is free and proves nothing.
   */
  sessionGranted: boolean;
};

/**
 * The one answer to "may this watch change workout data right now".
 *
 * Every entry point — the watch UI, an App Intent, a Shortcut, a deep link —
 * goes through the command path, and the command path calls this. Gating in the
 * views alone would leave Siri and Shortcuts wide open.
 */
export function watchAccess(entitlement: WatchEntitlement, input: AccessInput): WatchAccessDecision {
  const { access, state, verifiedAt } = entitlement;
  const age = verifiedAt > 0 ? Math.max(0, input.now - verifiedAt) : Infinity;

  if (verifiedAt > 0 && access && age <= ENTITLEMENT_CACHE_TTL_MS) {
    return { allow: true, basis: age <= ENTITLEMENT_FRESH_MS ? "verified" : "cached" };
  }

  // Everything below this line is a denial — unless a session already holds a
  // grant, in which case that session finishes.
  if (input.sessionGranted) return { allow: true, basis: "active_session_grace" };

  if (verifiedAt === 0) return { allow: false, basis: state === "loading" ? "loading" : "never_verified" };
  if (access && age > ENTITLEMENT_CACHE_TTL_MS) return { allow: false, basis: "expired_cache" };
  if (state === "loading") return { allow: false, basis: "loading" };
  return { allow: false, basis: "not_premium" };
}

/**
 * Whether a denial should be re-checked rather than sold against. A watch that
 * has simply lost contact with the phone should say so and offer to reconnect;
 * only a genuine "you do not have Premium" leads to the upgrade explanation,
 * which is on the iPhone because that is where the purchase happens.
 */
export function deniedNeedsPhone(basis: AccessBasis): boolean {
  return basis === "loading" || basis === "never_verified" || basis === "expired_cache";
}

export const ACCESS_COPY: Record<AccessBasis, string> = {
  verified: "",
  cached: "",
  active_session_grace: "",
  loading: "Checking your Premium access on your iPhone…",
  never_verified: "Open Muscle Map on your iPhone once to set up watch logging.",
  expired_cache: "Reconnect to your iPhone to confirm your Premium access.",
  not_premium: "Apple Watch logging is part of Premium. You can upgrade on your iPhone.",
};
