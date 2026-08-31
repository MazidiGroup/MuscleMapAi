import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

import { useAuth } from "@/src/auth/AuthContext";
import { apiPost } from "@/src/api";

import {
  EntitlementState,
  PremiumResolution,
  PurchaseOutcome,
  RestoreOutcome,
  TrialEligibility,
  classifyPurchase,
  classifyRestore,
  hasDesignatedEntitlement,
  resolvePremium,
  serverGrant,
} from "./entitlement";

/**
 * The single Premium provider. It owns the RevenueCat read, and delegates every
 * *decision* to the shared contract in ./entitlement.
 *
 * Rules enforced here:
 *  - only the exact designated entitlement counts (see hasDesignatedEntitlement);
 *  - loading never unlocks Premium, and a failed read never fabricates it;
 *  - an owner change (sign-in, switch, sign-out, deletion) invalidates the
 *    previous owner's entitlement state before anything is shown;
 *  - purchase and restore verify the entitlement before reporting success, and
 *    overlapping taps cannot start a second operation.
 *
 * react-native-purchases requires a native build; it is not available on web or
 * in Expo Go, so the SDK is only required off-web and every call is guarded. In
 * that case the app behaves as a free user and every free feature still works.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Purchases: any = Platform.OS === "web" ? null : require("react-native-purchases").default;

export type PremiumPackage = {
  identifier: string;
  label: string;
  packageType: string;
  /** The underlying StoreProduct — the only source of price and terms. */
  product: any;
  /** The underlying PurchasesPackage, passed straight back to purchasePackage. */
  raw: any;
};

export type OfferingState = "loading" | "ready" | "empty" | "error";

type PremiumCtx = {
  /** The one boolean the app gates on. */
  isPremium: boolean;
  resolution: PremiumResolution;
  loading: boolean;
  packages: PremiumPackage[];
  offeringState: OfferingState;
  trialEligibility: Record<string, TrialEligibility>;
  busy: "purchase" | "restore" | null;
  purchase: (pkg: PremiumPackage) => Promise<PurchaseOutcome>;
  restorePurchases: () => Promise<RestoreOutcome>;
  refreshOfferings: () => Promise<void>;
};

const IDLE: PremiumResolution = { access: false, source: "none", state: "ready" };

const Ctx = createContext<PremiumCtx>({
  isPremium: false,
  resolution: IDLE,
  loading: false,
  packages: [],
  offeringState: "empty",
  trialEligibility: {},
  busy: null,
  purchase: async () => "unavailable",
  restorePurchases: async () => "failed",
  refreshOfferings: async () => {},
});

const PACKAGE_LABELS: Record<string, string> = {
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  ANNUAL: "Yearly",
  LIFETIME: "Lifetime",
  TWO_MONTH: "2 months",
  THREE_MONTH: "3 months",
  SIX_MONTH: "6 months",
};

/**
 * Rejects if the store SDK does not answer in time. A hung StoreKit call
 * otherwise leaves its caller pending forever, which the UI cannot tell apart
 * from "still loading" — see the offerings watchdog below.
 */
function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    work.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

function mapPackage(p: any): PremiumPackage {
  const type = p?.packageType ?? "CUSTOM";
  return {
    identifier: p?.identifier ?? type,
    label: PACKAGE_LABELS[type] ?? p?.product?.title ?? p?.identifier ?? "Option",
    packageType: type,
    product: p?.product ?? {},
    raw: p,
  };
}

export function PremiumProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading, refreshUser } = useAuth();
  const [rcActive, setRcActive] = useState(false);
  const [rcState, setRcState] = useState<EntitlementState>(Purchases ? "loading" : "ready");
  const [packages, setPackages] = useState<PremiumPackage[]>([]);
  const [offeringState, setOfferingState] = useState<OfferingState>(Purchases ? "loading" : "empty");
  const [trialEligibility, setTrialEligibility] = useState<Record<string, TrialEligibility>>({});
  const [busy, setBusy] = useState<"purchase" | "restore" | null>(null);
  const busyRef = useRef<"purchase" | "restore" | null>(null);

  const owner = user?.user_id ?? null;

  // The entitlement read must never leave a Premium surface stuck on a skeleton:
  // if the store SDK does not answer, stop waiting and treat it as a failed read
  // (which locks — a failed read can never fabricate access).
  useEffect(() => {
    if (rcState !== "loading") return;
    const t = setTimeout(() => setRcState((s) => (s === "loading" ? "error" : s)), 8000);
    return () => clearTimeout(t);
  }, [rcState]);

  // The same contract for the OFFERINGS read, which had no watchdog of its own.
  // App Review's 2.1(b) screenshot was exactly this failure: placeholder rows
  // where the plans belong, forever, with no retry affordance — the promise had
  // never settled, so the paywall was still in "loading" rather than "error".
  // Failing over to "error" is what surfaces the retry panel.
  useEffect(() => {
    if (offeringState !== "loading") return;
    const t = setTimeout(() => setOfferingState((s) => (s === "loading" ? "error" : s)), 12000);
    return () => clearTimeout(t);
  }, [offeringState]);

  const resolution = resolvePremium({
    user,
    designatedEntitlementActive: rcActive,
    revenueCatState: rcState,
    authLoading,
  });
  const isPremium = resolution.access;

  /** Read the freshest CustomerInfo and apply the exact-entitlement rule. */
  const readEntitlement = useCallback(async (): Promise<boolean> => {
    if (!Purchases) {
      setRcState("ready");
      return false;
    }
    try {
      const info = await withTimeout(Purchases.getCustomerInfo(), 8000, "getCustomerInfo");
      const active = hasDesignatedEntitlement(info);
      setRcActive(active);
      setRcState("ready");
      return active;
    } catch {
      // A failed read must never fabricate access.
      setRcActive(false);
      setRcState("error");
      return false;
    }
  }, []);

  const syncToBackend = useCallback(async () => {
    try {
      // The backend re-validates against RevenueCat; this is only a trigger.
      await apiPost("/billing/revenuecat/sync", {});
    } catch {
      // Sync failure is not user-facing: the local entitlement still applies.
    } finally {
      refreshUser();
    }
  }, [refreshUser]);

  const refreshOfferings = useCallback(async () => {
    if (!Purchases) {
      setOfferingState("empty");
      return;
    }
    setOfferingState("loading");
    try {
      // One silent retry: a first-call failure in a cold sandbox is common, and
      // a reviewer who sees an error panel does not necessarily tap "Try again".
      let offerings: any;
      try {
        offerings = await withTimeout(Purchases.getOfferings(), 10000, "getOfferings");
      } catch {
        await new Promise((r) => setTimeout(r, 1500));
        offerings = await withTimeout(Purchases.getOfferings(), 10000, "getOfferings (retry)");
      }
      const available = offerings?.current?.availablePackages ?? [];
      const mapped: PremiumPackage[] = available.map(mapPackage);
      setPackages(mapped);
      setOfferingState(mapped.length ? "ready" : "empty");

      // Trial language is only allowed when eligibility is verified.
      if (mapped.length && Purchases.checkTrialOrIntroductoryPriceEligibility) {
        try {
          const ids = mapped.map((m: PremiumPackage) => m.product?.identifier).filter(Boolean);
          const res = await Purchases.checkTrialOrIntroductoryPriceEligibility(ids);
          const next: Record<string, TrialEligibility> = {};
          for (const m of mapped) {
            const status = res?.[m.product?.identifier]?.status;
            next[m.identifier] =
              status === 2 ? "eligible" : status === 1 ? "ineligible" : status === 3 ? "none" : "unknown";
          }
          setTrialEligibility(next);
        } catch {
          setTrialEligibility({});
        }
      }
    } catch {
      setPackages([]);
      setOfferingState("error");
    }
  }, []);

  // Owner transitions: the previous owner's entitlement must never remain
  // visible. Reset first, then read again for whoever is now signed in.
  useEffect(() => {
    if (!Purchases) return;
    let mounted = true;
    setRcActive(false);
    setRcState("loading");
    const apply = (info: any) => {
      if (mounted) {
        setRcActive(hasDesignatedEntitlement(info));
        setRcState("ready");
      }
    };
    // Concurrent, not sequential: the offerings read used to wait on the
    // entitlement read, so a hung getCustomerInfo left the paywall on skeletons
    // having never even asked for the products. Neither read depends on the
    // other's result.
    (async () => {
      await Promise.allSettled([readEntitlement(), mounted ? refreshOfferings() : undefined]);
    })();
    Purchases.addCustomerInfoUpdateListener(apply);
    return () => {
      mounted = false;
      Purchases.removeCustomerInfoUpdateListener?.(apply);
    };
  }, [owner, readEntitlement, refreshOfferings]);

  const purchase = useCallback(
    async (pkg: PremiumPackage): Promise<PurchaseOutcome> => {
      if (busyRef.current) return "unknown"; // an operation is already running
      if (!Purchases || !pkg?.raw) return "unavailable";
      busyRef.current = "purchase";
      setBusy("purchase");
      try {
        await Purchases.purchasePackage(pkg.raw);
        // Never trust the purchase result alone — read the entitlement back.
        const active = await readEntitlement();
        if (active) syncToBackend();
        return classifyPurchase({
          entitlementActive: active,
          existingGrant: serverGrant(user).premium,
          refreshFailed: !active && rcState === "error",
        });
      } catch (e: any) {
        if (e?.userCancelled) return classifyPurchase({ cancelled: true });
        return classifyPurchase({ threw: true });
      } finally {
        busyRef.current = null;
        setBusy(null);
      }
    },
    [readEntitlement, syncToBackend, user, rcState],
  );

  const restorePurchases = useCallback(async (): Promise<RestoreOutcome> => {
    if (busyRef.current) return "failed";
    if (!Purchases) return "nothing_to_restore";
    busyRef.current = "restore";
    setBusy("restore");
    try {
      await Purchases.restorePurchases();
      const active = await readEntitlement();
      if (active) syncToBackend();
      return classifyRestore({ entitlementActive: active, existingGrant: serverGrant(user).premium });
    } catch {
      return classifyRestore({ threw: true });
    } finally {
      busyRef.current = null;
      setBusy(null);
    }
  }, [readEntitlement, syncToBackend, user]);

  return (
    <Ctx.Provider
      value={{
        isPremium,
        resolution,
        loading: resolution.state === "loading",
        packages,
        offeringState,
        trialEligibility,
        busy,
        purchase,
        restorePurchases,
        refreshOfferings,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function usePremium() {
  return useContext(Ctx);
}

/**
 * The raw context, exported for the development-only state harness under app/dev,
 * which mounts the paywall against deterministic fixtures for states that cannot
 * be triggered on web (no store SDK). Production code always uses usePremium().
 */
export const PremiumContextForFixtures = Ctx;
export type PremiumContextValue = PremiumCtx;
