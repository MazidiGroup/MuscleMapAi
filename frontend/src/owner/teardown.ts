// Local namespace teardown for one owner.
//
// Used when an account is deleted: every local key that belongs to THAT owner is
// removed — canonical values, journal entries, migration markers and quarantine
// buckets. Keys are derived deterministically from the domain list, so no key
// enumeration (which AsyncStorage cannot do safely across owners) is needed.
//
// Guarantees:
//   · only the named owner's namespace is touched;
//   · the guest namespace is never removed by an account deletion;
//   · legacy global keys are read-only and are never deleted here.

import { DOMAINS, Owner, OwnerKind, migrationMarkerKey, pendingKey, quarantineKey, scopedKey } from "./scopeKeys";
import { KV } from "./kv";

export type TeardownResult = { owner: Owner; removed: string[] };

/** Every local key that can exist for one owner. */
export function ownerNamespaceKeys(owner: Owner): string[] {
  const keys: string[] = [];
  for (const domain of DOMAINS) {
    keys.push(scopedKey(owner, domain), pendingKey(owner, domain), migrationMarkerKey(owner, domain), quarantineKey(owner, domain));
  }
  return keys;
}

export async function purgeOwnerNamespace(kv: KV, owner: Owner): Promise<TeardownResult> {
  const removed: string[] = [];
  for (const key of ownerNamespaceKeys(owner)) {
    const existing = await kv.get(key).catch(() => null);
    if (existing === null) continue;
    await kv.remove(key).catch(() => {});
    removed.push(key);
  }
  return { owner, removed };
}

// --- hook registry ---------------------------------------------------------
// `AuthContext` sits above `OwnerProvider`, so the owner resolver registers the
// teardown here and auth calls it after the server confirms the deletion.

export type TeardownHook = (expect: OwnerKind) => Promise<TeardownResult | null>;

let hook: TeardownHook | null = null;

export function setOwnerTeardownHook(fn: TeardownHook | null) {
  hook = fn;
}

/** Runs teardown only if the currently resolved owner is of the expected kind. */
export async function runOwnerTeardown(expect: OwnerKind): Promise<TeardownResult | null> {
  if (!hook) return null;
  try {
    return await hook(expect);
  } catch {
    return null;
  }
}
