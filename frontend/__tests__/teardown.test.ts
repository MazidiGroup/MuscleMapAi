// Phase 2 — account deletion tears down that owner's local namespace only.
import assert from "node:assert/strict";
import test from "node:test";

import { MemoryKV } from "../src/owner/kv";
import { DOMAINS, LEGACY_KEYS, Owner, migrationMarkerKey, pendingKey, quarantineKey, scopedKey } from "../src/owner/scopeKeys";
import { ScopedStore } from "../src/owner/scopedStore";
import {
  ownerNamespaceKeys,
  purgeOwnerNamespace,
  runOwnerTeardown,
  setOwnerTeardownHook,
} from "../src/owner/teardown";

const account: Owner = { kind: "account", id: "user_delete01" };
const otherAccount: Owner = { kind: "account", id: "user_keep01" };
const guest: Owner = { kind: "guest", id: "g_keep01" };

let gen = 0;
const tok = (o: Owner) => ({ kind: o.kind, id: o.id, generation: ++gen });

async function seed(kv: MemoryKV, owner: Owner) {
  let current: any = tok(owner);
  const store = new ScopedStore(kv, () => current);
  await store.writeGuarded(current, "plan", { days: [], answers: { days: [] } });
  await store.writeGuarded(current, "workouts", [{ id: "w1" }]);
  await store.writeGuarded(current, "activeSession", { sessionId: "s1" });
  await store.writeGuarded(current, "unitPreference", "kg");
  await kv.set(pendingKey(owner, "plan"), "{}");
  await kv.set(migrationMarkerKey(owner, "plan"), "1");
  await kv.set(quarantineKey(owner, "plan"), "{}");
}

test("the key set for one owner covers every domain and journal", () => {
  const keys = ownerNamespaceKeys(account);
  assert.equal(keys.length, DOMAINS.length * 4);
  assert.ok(keys.includes(scopedKey(account, "plan")));
  assert.ok(keys.includes(pendingKey(account, "activeSession")));
  assert.ok(keys.includes(migrationMarkerKey(account, "workouts")));
  assert.ok(keys.includes(quarantineKey(account, "prs")));
  assert.equal(new Set(keys).size, keys.length, "no duplicates");
});

test("deleting an account removes that account's local data", async () => {
  const kv = new MemoryKV();
  await seed(kv, account);
  const res = await purgeOwnerNamespace(kv, account);
  assert.ok(res.removed.length >= 7);
  for (const key of ownerNamespaceKeys(account)) {
    assert.equal(kv.snapshot()[key], undefined, `${key} should be gone`);
  }
});

test("the guest namespace and other accounts survive an account deletion", async () => {
  const kv = new MemoryKV();
  await seed(kv, account);
  await seed(kv, guest);
  await seed(kv, otherAccount);

  await purgeOwnerNamespace(kv, account);

  assert.ok(kv.snapshot()[scopedKey(guest, "plan")], "guest plan is untouched");
  assert.ok(kv.snapshot()[scopedKey(guest, "workouts")], "guest history is untouched");
  assert.ok(kv.snapshot()[scopedKey(otherAccount, "plan")], "another account is untouched");
});

test("legacy global keys are never deleted by a teardown", async () => {
  const kv = new MemoryKV();
  for (const key of LEGACY_KEYS) await kv.set(key, "legacy");
  await seed(kv, account);
  await purgeOwnerNamespace(kv, account);
  for (const key of LEGACY_KEYS) assert.equal(kv.snapshot()[key], "legacy");
});

test("teardown is idempotent", async () => {
  const kv = new MemoryKV();
  await seed(kv, account);
  await purgeOwnerNamespace(kv, account);
  const second = await purgeOwnerNamespace(kv, account);
  assert.deepEqual(second.removed, []);
});

test("the auth hook only fires for the expected owner kind", async () => {
  const kv = new MemoryKV();
  await seed(kv, guest);
  setOwnerTeardownHook(async (expect) => (guest.kind === expect ? purgeOwnerNamespace(kv, guest) : null));

  // A signed-out device resolves to the guest owner: an account deletion must
  // not purge it.
  assert.equal(await runOwnerTeardown("account"), null);
  assert.ok(kv.snapshot()[scopedKey(guest, "plan")]);

  const res = await runOwnerTeardown("guest");
  assert.ok(res);
  assert.equal(kv.snapshot()[scopedKey(guest, "plan")], undefined);
  setOwnerTeardownHook(null);
});

test("with no hook registered, teardown is a safe no-op", async () => {
  setOwnerTeardownHook(null);
  assert.equal(await runOwnerTeardown("account"), null);
});

test("a throwing hook cannot break sign-out", async () => {
  setOwnerTeardownHook(async () => {
    throw new Error("boom");
  });
  assert.equal(await runOwnerTeardown("account"), null);
  setOwnerTeardownHook(null);
});
