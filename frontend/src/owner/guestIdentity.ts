// Stable, locally generated guest owner identity.
//
// Requirements (approved Phase 1 decision 4.1):
//  - works before any network access;
//  - survives relaunch and session-token loss;
//  - is NOT regenerated per guest API call;
//  - is never derived from email, advertising id or a server guest response.

import { KV } from "./kv";
import { GUEST_ID_KEY, isUsableOwnerId, Owner } from "./scopeKeys";

function randomId(): string {
  let out = "";
  for (let i = 0; i < 4; i++) out += Math.random().toString(36).slice(2, 10);
  return `g_${out.slice(0, 24)}`;
}

let inFlight: Promise<Owner> | null = null;

/**
 * Returns the one stable guest owner for this device, creating it on first use.
 * Concurrent callers share a single creation promise so two screens racing at
 * launch cannot mint two guest identities.
 */
export function resolveGuestOwner(kv: KV): Promise<Owner> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const existing = await kv.get(GUEST_ID_KEY);
    if (isUsableOwnerId(existing)) return { kind: "guest", id: existing } as Owner;
    const id = randomId();
    await kv.set(GUEST_ID_KEY, id);
    // Read back: if a parallel writer won, prefer the persisted value so both
    // callers converge on exactly one guest identity.
    const confirmed = await kv.get(GUEST_ID_KEY);
    return { kind: "guest", id: isUsableOwnerId(confirmed) ? confirmed : id } as Owner;
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** Test seam — clears the in-process creation latch, never the stored id. */
export function __resetGuestLatch() {
  inFlight = null;
}
