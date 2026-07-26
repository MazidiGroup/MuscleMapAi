// Owner-scoped read/write with an owner-change abort guard.
//
// Every write captures the owner at mutation start; if the active owner changed
// before the value is committed the write is rejected and nothing is persisted.
// There is no AsyncStorage transaction or atomic multi-key write — this module
// deliberately makes no such claim and writes exactly one key per operation.

import { KV } from "./kv";
import { Domain, Owner, isLegacyKey, isUsableOwnerId, scopedKey } from "./scopeKeys";

export type OwnerToken = { kind: Owner["kind"]; id: string };

export type WriteResult = { ok: true } | { ok: false; reason: "owner_changed" | "unresolved_owner" | "io_error" };

export function sameOwner(a: OwnerToken | null, b: OwnerToken | null): boolean {
  return !!a && !!b && a.kind === b.kind && a.id === b.id;
}

export type CurrentOwnerFn = () => OwnerToken | null;

export class ScopedStore {
  constructor(
    private kv: KV,
    /** Returns the owner that is active right now — used for the abort guard. */
    private currentOwner: CurrentOwnerFn,
  ) {}

  /** Never returns a legacy key. Throws if a caller tries to build one. */
  keyFor(owner: Owner, domain: Domain): string {
    const key = scopedKey(owner, domain);
    if (isLegacyKey(key)) throw new Error("scoped destination collided with a legacy key");
    return key;
  }

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
   * Writes only if the owner captured at mutation start is still active.
   * `owner` IS the captured token — callers snapshot it before doing work.
   */
  async write<T>(owner: Owner | null, domain: Domain, value: T): Promise<WriteResult> {
    if (!owner || !isUsableOwnerId(owner.id)) return { ok: false, reason: "unresolved_owner" };
    if (!sameOwner(owner, this.currentOwner())) return { ok: false, reason: "owner_changed" };
    try {
      await this.kv.set(this.keyFor(owner, domain), JSON.stringify(value));
    } catch {
      return { ok: false, reason: "io_error" };
    }
    // Re-check after the await: an owner change during the write must not leave
    // a value attributed to the wrong owner.
    if (!sameOwner(owner, this.currentOwner())) {
      await this.kv.remove(this.keyFor(owner, domain)).catch(() => {});
      return { ok: false, reason: "owner_changed" };
    }
    return { ok: true };
  }

  async clear(owner: Owner, domain: Domain): Promise<void> {
    await this.kv.remove(this.keyFor(owner, domain));
  }

  raw(): KV {
    return this.kv;
  }
}
