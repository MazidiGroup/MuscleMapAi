// Central owner resolver.
//
// Exactly one of: verified authenticated account owner, verified stable local
// guest owner, unresolved, or transitioning. Every owner-scoped read and write
// in the app must go through the `store` exposed here — feature modules must
// never build scoped keys themselves.
//
// Hydration order guarantees no previous-owner frame: children are not rendered
// until the resolver has settled on the current owner, and any owner change
// re-enters `transitioning` before the new scope hydrates.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/src/auth/AuthContext";

import { resolveGuestOwner } from "./guestIdentity";
import { getDeviceKV, KV } from "./kv";
import { MigrationReport, runMigration } from "./migration";
import { Owner, OwnerState, isUsableOwnerId } from "./scopeKeys";
import { OwnerToken, ScopedStore } from "./scopedStore";

type OwnerCtx = {
  state: OwnerState;
  owner: Owner | null;
  /** True once the resolver has settled and the scope may be hydrated. */
  ready: boolean;
  store: ScopedStore;
  migration: MigrationReport | null;
  /** Snapshot the owner before a mutation and pass it to `store.write`. */
  capture: () => Owner | null;
};

const Ctx = createContext<OwnerCtx | null>(null);

export function OwnerProvider({ children, kv }: { children: React.ReactNode; kv?: KV }) {
  const { user, loading } = useAuth();
  const store0 = useRef<KV>(kv ?? getDeviceKV());
  const ownerRef = useRef<Owner | null>(null);

  const currentOwner = useCallback((): OwnerToken | null => ownerRef.current, []);
  const store = useMemo(() => new ScopedStore(store0.current, currentOwner), [currentOwner]);

  const [state, setState] = useState<OwnerState>({ status: "unresolved", reason: "loading", owner: null });
  const [migration, setMigration] = useState<MigrationReport | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Any identity change unloads the previous scope first.
    ownerRef.current = null;
    setState({ status: "transitioning", owner: null });
    setMigration(null);

    (async () => {
      if (loading) {
        if (!cancelled) setState({ status: "unresolved", reason: "loading", owner: null });
        return;
      }

      // Verified account: a signed-in, non-guest user with a usable stable id.
      if (user && !user.is_guest) {
        if (!isUsableOwnerId(user.user_id)) {
          if (!cancelled) setState({ status: "unresolved", reason: "malformed_identity", owner: null });
          return;
        }
        const owner: Owner = { kind: "account", id: user.user_id };
        ownerRef.current = owner;
        if (!cancelled) setState({ status: "resolved", owner });
        return;
      }

      // Everyone else — signed out, or a server "guest" session — resolves to
      // the one stable device guest profile. Server guest ids are never used.
      const guest = await resolveGuestOwner(store0.current);
      if (cancelled) return;
      ownerRef.current = guest;
      setState({ status: "resolved", owner: guest });

      const report = await runMigration(guest, { kv: store0.current, store, currentOwner });
      if (!cancelled) setMigration(report);
    })();

    return () => {
      cancelled = true;
    };
  }, [user, loading, store, currentOwner]);

  const value: OwnerCtx = {
    state,
    owner: state.status === "resolved" ? state.owner : null,
    ready: state.status === "resolved",
    store,
    migration,
    capture: () => ownerRef.current,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOwner(): OwnerCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useOwner must be used within OwnerProvider");
  return ctx;
}
