import React, { createContext, useCallback, useContext, useState } from "react";

/**
 * Central premium entitlement.
 *
 * `isPremium` is the SINGLE source of truth the whole app reads to decide
 * whether the current user has premium access. It defaults to `false`.
 *
 * TODO(payments): wire `setPremium` to a real payment/entitlement provider
 * (e.g. RevenueCat / StoreKit / Stripe). Keep that wiring in this one file so
 * the rest of the app never needs to change.
 */
type PremiumCtx = {
  isPremium: boolean;
  setPremium: (v: boolean) => void;
};

const Ctx = createContext<PremiumCtx>({ isPremium: false, setPremium: () => {} });

export function PremiumProvider({ children }: { children: React.ReactNode }) {
  const [isPremium, setIsPremium] = useState(false);
  const setPremium = useCallback((v: boolean) => setIsPremium(v), []);
  return <Ctx.Provider value={{ isPremium, setPremium }}>{children}</Ctx.Provider>;
}

export function usePremium() {
  return useContext(Ctx);
}
