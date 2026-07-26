// Central owner resolver.
//
// Exactly one of: verified authenticated account owner, verified stable local
// guest owner, unresolved, or transitioning. Every owner-scoped read and write in
// the app goes through the `store` exposed here — feature modules never build
// scoped keys themselves.
//
// Each resolution carries a monotonic `generation`. A mutation captures the token
// at start and the store re-checks the generation before promoting a value, so an
// owner switch can never publish into the wrong namespace and never deletes an
// existing canonical value.
//
// Ownerless legacy data is only SCANNED, never adopted (see migration.ts).

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/src/auth/AuthContext";

import { resolveGuestOwner } from "./guestIdentity";
import { getDeviceKV, KV } from "./kv";
import { ScanReport, scanLegacy } from "./migration";
import { Owner, OwnerState, isUsableOwnerId } from "./scopeKeys";
import { OwnerToken, ScopedStore } from "./scopedStore";

type OwnerCtx = {
  state: OwnerState;
  owner: Owner | null;
  /** Owner plus generation — pass this to every scoped write. */
  token: OwnerToken | null;
  /** True once the resolver has settled and the scope may be hydrated. */
  ready: boolean;
  store: ScopedStore;
  /** Report of ownerless legacy data. Never adopted automatically. */
  unclaimedLegacy: ScanReport | null;
  /** Snapshot the owner token before starting a mutation. */
  capture: () => OwnerToken | null;
};

const Ctx = createContext<OwnerCtx | null>(null);

export function OwnerProvider({ children, kv }: { children: React.ReactNode; kv?: KV }) {
  const { user, loading } = useAuth();
  const kvRef = useRef<KV>(kv ?? getDeviceKV());
  const tokenRef = useRef<OwnerToken | null>(null);
  const generationRef = useRef(0);

  const currentOwner = useCallback((): OwnerToken | null => tokenRef.current, []);
  const store = useMemo(() => new ScopedStore(kvRef.current, currentOwner), [currentOwner]);

  const [state, setState] = useState<OwnerState>({ status: "unresolved", reason: "loading", owner: null });
  const [token, setToken] = useState<OwnerToken | null>(null);
  const [unclaimedLegacy, setUnclaimed] = useState<ScanReport | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Any identity change invalidates the previous scope before anything else.
    generationRef.current += 1;
    const generation = generationRef.current;
    tokenRef.current = null;
    setToken(null);
    setState({ status: "transitioning", owner: null });

    const publish = (owner: Owner) => {
      const next: OwnerToken = { kind: owner.kind, id: owner.id, generation };
      tokenRef.current = next;
      setToken(next);
      setState({ status: "resolved", owner });
    };

    (async () => {
      if (loading) {
        if (!cancelled) setState({ status: "unresolved", reason: "loading", owner: null });
        return;
      }

      // Verified account: a signed-in, non-guest identity with a stable opaque id.
      if (user && !user.is_guest) {
        if (!isUsableOwnerId(user.user_id)) {
          if (!cancelled) setState({ status: "unresolved", reason: "malformed_identity", owner: null });
          return;
        }
        if (!cancelled) publish({ kind: "account", id: user.user_id });
        return;
      }

      // Everyone else — signed out, or a server "guest" session — resolves to the
      // one stable device guest profile. Server guest ids are never used.
      const guest = await resolveGuestOwner(kvRef.current);
      if (cancelled || generationRef.current !== generation) return;
      publish(guest);

      // Report-only: ownerless legacy data is never claimed by this guest.
      const report = await scanLegacy(kvRef.current);
      if (!cancelled) setUnclaimed(report);
    })();

    return () => {
      cancelled = true;
    };
  }, [user, loading]);

  const value: OwnerCtx = {
    state,
    owner: state.status === "resolved" ? state.owner : null,
    token,
    ready: state.status === "resolved",
    store,
    unclaimedLegacy,
    capture: () => tokenRef.current,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOwner(): OwnerCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useOwner must be used within OwnerProvider");
  return ctx;
}
