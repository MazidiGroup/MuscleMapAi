// Owner-scoped read/write with a NON-DESTRUCTIVE owner-change guard.
//
// Safe owner-change write protocol:
//   1. the caller captures the resolved owner and its generation token;
//   2. the mutation is prepared under that captured owner;
//   3. `writeGuarded` stores the prepared value in an owner-scoped PENDING key;
//   4. the owner generation is re-checked;
//   5. if unchanged the pending value is promoted to the canonical key;
//   6. if it changed, ONLY the pending value is discarded.
//
// A canonical value is never removed because the active UI owner changed — the
// only removal path is `clear()`, an explicit deletion targeting that same
// verified owner. Because canonical keys are owner-scoped, a late write can
// never surface in another owner's namespace.
//
// There is no AsyncStorage transaction and none is claimed: each step writes or
// removes exactly one key.

import { KV } from "./kv";
import { Domain, Owner, isLegacyKey, isUsableOwnerId, pendingKey, scopedKey } from "./scopeKeys";

/** Owner identity plus a monotonic generation that changes on every switch. */
export type OwnerToken = { kind: Owner["kind"]; id: string; generation: number };

export type WriteResult =
  | { ok: true; promoted: true }
  | { ok: false; reason: "owner_changed" | "unresolved_owner" | "io_error" };

export function sameOwner(a: OwnerToken | null, b: OwnerToken | null): boolean {
  return !!a && !!b && a.kind === b.kind && a.id === b.id && a.generation === b.generation;
}

export type CurrentOwnerFn = () => OwnerToken | null;

export class ScopedStore {
  constructor(
    private kv: KV,
    /** Returns the owner token that is active right now. */
    private currentOwner: CurrentOwnerFn,
  ) {}

  /** Never returns a legacy key. */
  keyFor(owner: Owner, domain: Domain): string {
    const key = scopedKey(owner, domain);
    if (isLegacyKey(key)) throw new Error("scoped destination collided with a legacy key");
    return key;
  }

  /** Canonical read. Pending journal values are deliberately invisible here. */
  async read<T>(owner: Owner | null, domain: Domain, fallback: T): Promise<T> {
    if (!owner || !isUsableOwnerId(owner.id)) return fallback;
    const raw = await this.kv.get(this.keyFor(owner, domain));
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  /**
   * Journalled write. `captured` is the token snapshotted at mutation start.
   * On an owner change the canonical value is left exactly as it was.
   */
  async writeGuarded<T>(captured: OwnerToken | null, domain: Domain, value: T): Promise<WriteResult> {
    if (!captured || !isUsableOwnerId(captured.id)) return { ok: false, reason: "unresolved_owner" };
    const owner: Owner = { kind: captured.kind, id: captured.id };
    if (!sameOwner(captured, this.currentOwner())) return { ok: false, reason: "owner_changed" };

    const pending = pendingKey(owner, domain);
    try {
      await this.kv.set(pending, JSON.stringify(value));
    } catch {
      return { ok: false, reason: "io_error" };
    }

    // Re-check after the await: the owner may have changed while pending.
    if (!sameOwner(captured, this.currentOwner())) {
      await this.kv.remove(pending).catch(() => {});
      return { ok: false, reason: "owner_changed" };
    }

    try {
      await this.kv.set(this.keyFor(owner, domain), JSON.stringify(value));
    } catch {
      await this.kv.remove(pending).catch(() => {});
      return { ok: false, reason: "io_error" };
    }
    await this.kv.remove(pending).catch(() => {});
    return { ok: true, promoted: true };
  }

  /** True when an interrupted mutation left a journal entry behind. */
  async readPending<T>(owner: Owner, domain: Domain): Promise<T | null> {
    const raw = await this.kv.get(pendingKey(owner, domain));
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  /** Removes only journal data — never a canonical value. */
  async cleanupPending(owner: Owner, domain: Domain): Promise<void> {
    await this.kv.remove(pendingKey(owner, domain));
  }

  /** Explicit deletion for this verified owner only. */
  async clear(owner: Owner, domain: Domain): Promise<void> {
    await this.kv.remove(this.keyFor(owner, domain));
    await this.kv.remove(pendingKey(owner, domain));
  }

  raw(): KV {
    return this.kv;
  }
}
