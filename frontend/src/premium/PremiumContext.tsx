import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";

import { useAuth } from "@/src/auth/AuthContext";
import { apiPost } from "@/src/api";

/**
 * Central premium entitlement, backed by RevenueCat (react-native-purchases).
 *
 * `isPremium` is the SINGLE source of truth the whole app reads. It unlocks when
 * EITHER (a) ANY active RevenueCat entitlement exists on-device (name-agnostic, so
 * dashboard naming can't silently break gating) or (b) the backend reports
 * `is_premium` via /auth/me (server-validated sync or App Store review bypass).
 * After purchase/restore we immediately sync the entitlement to the backend and
 * re-fetch the user so premium reflects without an app restart.
 *
 * NOTE: react-native-purchases requires a native (dev/production) build. It does
 * NOT run in Expo Go or on web, so the SDK is only loaded off-web and every call
 * is guarded. On web/Expo Go the app simply behaves as a free (non-premium) user.
 */

// Only load the native module off-web to avoid breaking the web bundle.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Purchases: any = Platform.OS === "web" ? null : require("react-native-purchases").default;

export type PremiumPackage = {
  identifier: string; // RevenueCat package identifier
  label: string; // friendly label e.g. "Monthly"
  priceString: string; // live localized store price e.g. "£9.99"
  packageType: string; // WEEKLY | MONTHLY | ANNUAL | LIFETIME | ...
  raw: any; // underlying PurchasesPackage passed back to purchasePackage
};

type PremiumCtx = {
  isPremium: boolean;
  loading: boolean;
  packages: PremiumPackage[];
  purchase: (pkg: PremiumPackage) => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
  refreshOfferings: () => Promise<void>;
  /** Manual override — reserved for future/dev use. */
  setPremium: (v: boolean) => void;
};

const Ctx = createContext<PremiumCtx>({
  isPremium: false,
  loading: false,
  packages: [],
  purchase: async () => false,
  restorePurchases: async () => false,
  refreshOfferings: async () => {},
  setPremium: () => {},
});

const PACKAGE_LABELS: Record<string, string> = {
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  ANNUAL: "Yearly",
  LIFETIME: "Lifetime",
  TWO_MONTH: "2 Months",
  THREE_MONTH: "3 Months",
  SIX_MONTH: "6 Months",
};

function hasPremium(customerInfo: any): boolean {
  // Name-agnostic: ANY active entitlement unlocks premium (single-tier app).
  const active = customerInfo?.entitlements?.active ?? {};
  return Object.keys(active).length > 0;
}

function mapPackage(p: any): PremiumPackage {
  const product = p?.product ?? {};
  const type = p?.packageType ?? "CUSTOM";
  return {
    identifier: p?.identifier ?? type,
    label: PACKAGE_LABELS[type] ?? product?.title ?? p?.identifier ?? "Plan",
    priceString: product?.priceString ?? "",
    packageType: type,
    raw: p,
  };
}

export function PremiumProvider({ children }: { children: React.ReactNode }) {
  const { user, refreshUser } = useAuth();
  const [rcPremium, setRcPremium] = useState(false);
  const [loading, setLoading] = useState(!!Purchases);
  const [packages, setPackages] = useState<PremiumPackage[]>([]);

  // Premium if EITHER the on-device RevenueCat entitlement is active OR the backend
  // says so via /auth/me (server-validated RevenueCat sync or App Store review bypass).
  const isPremium = rcPremium || !!user?.is_premium;

  // Persist the entitlement server-side (backend re-validates against RevenueCat's
  // REST API — the payload is just a trigger) then refresh /auth/me so is_premium
  // updates immediately, not on next launch.
  const syncToBackend = useCallback(async (premium: boolean) => {
    try {
      await apiPost("/billing/revenuecat/sync", { is_premium: premium });
    } catch (e) {
      console.warn("[premium] backend sync failed", e);
    } finally {
      refreshUser();
    }
  }, [refreshUser]);

  const refreshOfferings = useCallback(async () => {
    if (!Purchases) return;
    try {
      const offerings = await Purchases.getOfferings();
      const current = offerings?.current;
      const available = current?.availablePackages ?? [];
      if (available.length) setPackages(available.map(mapPackage));
    } catch (e) {
      console.warn("[premium] getOfferings failed", e);
    }
  }, []);

  useEffect(() => {
    if (!Purchases) return;
    let mounted = true;
    const apply = (customerInfo: any) => {
      if (mounted) setRcPremium(hasPremium(customerInfo));
    };

    (async () => {
      try {
        const customerInfo = await Purchases.getCustomerInfo();
        apply(customerInfo);
      } catch (e) {
        console.warn("[premium] getCustomerInfo failed", e);
      } finally {
        if (mounted) setLoading(false);
      }
      refreshOfferings();
    })();

    Purchases.addCustomerInfoUpdateListener(apply);
    return () => {
      mounted = false;
      Purchases.removeCustomerInfoUpdateListener?.(apply);
    };
  }, [refreshOfferings]);

  const purchase = useCallback(async (pkg: PremiumPackage) => {
    if (!Purchases || !pkg?.raw) return false;
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg.raw);
      const ok = hasPremium(customerInfo);
      setRcPremium(ok);
      if (ok) syncToBackend(true); // record purchase server-side right away
      return ok;
    } catch (e: any) {
      if (!e?.userCancelled) console.warn("[premium] purchase failed", e);
      return false;
    }
  }, [syncToBackend]);

  const restorePurchases = useCallback(async () => {
    if (!Purchases) return false;
    try {
      const customerInfo = await Purchases.restorePurchases();
      const ok = hasPremium(customerInfo);
      setRcPremium(ok);
      if (ok) syncToBackend(true);
      return ok;
    } catch (e) {
      console.warn("[premium] restore failed", e);
      return false;
    }
  }, [syncToBackend]);

  const setPremium = useCallback((v: boolean) => setRcPremium(v), []);

  return (
    <Ctx.Provider value={{ isPremium, loading, packages, purchase, restorePurchases, refreshOfferings, setPremium }}>
      {children}
    </Ctx.Provider>
  );
}

export function usePremium() {
  return useContext(Ctx);
}
