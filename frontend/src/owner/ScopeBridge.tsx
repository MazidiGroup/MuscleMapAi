// Binds the resolved owner scope into the non-React stores and gates children
// until the store's hydrated state provably belongs to the current owner, so a
// previous owner's Plan can never be rendered.

import React, { useEffect, useRef } from "react";

import { setPlanScope, usePlanStore, scopeKeyOf } from "@/src/plan/planStore";
import { LoadingScreen } from "@/src/theme/LoadingScreen";

import { useOwner } from "./OwnerContext";

export function ScopeBridge({ children }: { children: React.ReactNode }) {
  const { store, token, ready } = useOwner();
  const key = scopeKeyOf(token);
  const bound = useRef<string | null | undefined>(undefined);
  const hydratedFor = usePlanStore((s) => s.ownerKey);

  // Pure module-level binding during render (no store mutation, so no update of
  // another component while rendering) — children therefore see the right scope.
  if (bound.current !== key) {
    bound.current = key;
    setPlanScope(ready && token ? { store, token } : null);
  }

  useEffect(() => {
    if (!ready || !token) return;
    usePlanStore.getState().resetForOwner();
    usePlanStore.getState().hydrate();
  }, [key, ready, token]);

  if (!key || hydratedFor !== key) return <LoadingScreen />;
  return <>{children}</>;
}
