// Owner-scoped persistence for the watch sync ledger.
//
// The ledger is what makes "exactly once" survive an app restart. If it lived
// only in memory, force-quitting the phone between a watch send and its retry
// would leave the retry looking like a brand-new set — the one failure the whole
// event design exists to prevent.
//
// It goes through `ScopedStore` like every other domain, so it inherits the
// owner-change guard, the pending-write journal and account-deletion teardown
// without any of them being reimplemented here.

import { Owner } from "@/src/owner/scopeKeys";
import { OwnerToken, ScopedStore, WriteResult } from "@/src/owner/scopedStore";

import { LEDGER_SCHEMA, WatchLedger, emptyLedger } from "./apply";

/**
 * Reads the ledger, falling back to an empty one.
 *
 * A ledger from a FUTURE schema is discarded rather than half-read: an empty
 * ledger can at worst duplicate an in-flight set, while a misread one could
 * silently suppress every event as an apparent duplicate and lose a session.
 */
export async function readWatchLedger(store: ScopedStore, owner: Owner | null): Promise<WatchLedger> {
  const stored = await store.read<WatchLedger | null>(owner, "watchSync", null);
  if (!stored || typeof stored !== "object") return emptyLedger();
  if (typeof stored.schema !== "number" || stored.schema > LEDGER_SCHEMA) return emptyLedger();
  return {
    schema: LEDGER_SCHEMA,
    sessionId: typeof stored.sessionId === "string" ? stored.sessionId : null,
    processed: Array.isArray(stored.processed) ? stored.processed.filter((x) => typeof x === "string") : [],
    seenSeqs: Array.isArray(stored.seenSeqs) ? stored.seenSeqs.filter((x) => typeof x === "number") : [],
    revisions: stored.revisions && typeof stored.revisions === "object" ? stored.revisions : {},
    voided: Array.isArray(stored.voided) ? stored.voided.filter((x) => typeof x === "string") : [],
    endRequested: stored.endRequested === true,
    closed: Array.isArray(stored.closed) ? stored.closed.filter((c) => c && typeof c.sessionId === "string") : [],
  };
}

export function persistWatchLedger(
  store: ScopedStore,
  token: OwnerToken | null,
  ledger: WatchLedger,
): Promise<WriteResult> {
  return store.writeGuarded(token, "watchSync", ledger);
}

/** Explicit removal — used when an owner's local data is torn down. */
export function clearWatchLedger(store: ScopedStore, owner: Owner): Promise<void> {
  return store.clear(owner, "watchSync");
}
