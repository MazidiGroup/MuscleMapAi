// Owner resolution, scoping and isolation.
import assert from "node:assert/strict";
import test from "node:test";

import { MemoryKV } from "../src/owner/kv";
import { resolveGuestOwner, __resetGuestLatch } from "../src/owner/guestIdentity";
import {
  GUEST_ID_KEY,
  LEGACY_KEYS,
  Owner,
  SCOPE_PREFIX,
  encodeOwnerId,
  isLegacyKey,
  isUsableOwnerId,
  migrationMarkerKey,
  quarantineKey,
  scopedKey,
} from "../src/owner/scopeKeys";
import { OwnerToken, ScopedStore } from "../src/owner/scopedStore";

const acct = (id: string): Owner => ({ kind: "account", id });
const tok = (kind: "account" | "guest", id: string, generation = 1): OwnerToken => ({ kind, id, generation });

test("guest owner is stable across relaunch and token loss", async () => {
  const kv = new MemoryKV();
  __resetGuestLatch();
  const first = await resolveGuestOwner(kv);
  __resetGuestLatch(); // simulate a relaunch: in-process state gone, storage kept
  const second = await resolveGuestOwner(kv);
  assert.equal(first.id, second.id);
  assert.equal(first.kind, "guest");
  assert.ok(isUsableOwnerId(first.id));
  assert.equal(await kv.get(GUEST_ID_KEY), first.id);
});

test("guest owner resolves with no network and is not regenerated concurrently", async () => {
  const kv = new MemoryKV();
  __resetGuestLatch();
  const [a, b, c] = await Promise.all([resolveGuestOwner(kv), resolveGuestOwner(kv), resolveGuestOwner(kv)]);
  assert.equal(a.id, b.id);
  assert.equal(b.id, c.id);
});

test("scoped keys are versioned, owner-separated and never legacy", () => {
  const g: Owner = { kind: "guest", id: "g_abc123" };
  const a = acct("user_deadbeef01");
  assert.ok(scopedKey(g, "workouts").startsWith(`${SCOPE_PREFIX}.guest.${encodeOwnerId("g_abc123")}.`));
  assert.ok(scopedKey(a, "workouts").startsWith(`${SCOPE_PREFIX}.acct.${encodeOwnerId("user_deadbeef01")}.`));
  assert.notEqual(scopedKey(g, "workouts"), scopedKey(a, "workouts"));
  assert.match(scopedKey(g, "workouts"), /\.workouts\.v1$/);
  for (const k of [scopedKey(g, "plan"), migrationMarkerKey(g, "plan"), quarantineKey(g, "plan")]) {
    assert.equal(isLegacyKey(k), false);
    assert.ok(!LEGACY_KEYS.some((legacy) => k === legacy || k.startsWith(`${legacy}.`)));
  }
});

test("account identifiers are treated as opaque, only empty/non-string is rejected", () => {
  for (const bad of ["", null, undefined, 42, {}, []]) {
    assert.equal(isUsableOwnerId(bad as unknown), false);
    assert.equal(encodeOwnerId(bad as unknown), null);
  }
  // representative opaque identifiers from real providers
  for (const good of [
    "user_1234abcd",
    "b3f1c0de-9a7e-4b1d-8f66-4c2a1d9e5f00",
    "auth0|65f0c9a1d2",
    "google-oauth2|1078...42",
    "person@example.com",
    "ID/with+separators=and.dots",
    "用户_9931",
    "x".repeat(400),
  ]) {
    assert.equal(isUsableOwnerId(good), true);
    const seg = encodeOwnerId(good)!;
    assert.match(seg, /^[A-Za-z0-9_-]+$/, "encoded segment cannot contain a key separator");
    assert.equal(seg, encodeOwnerId(good), "encoding is deterministic");
  }
});

test("distinct opaque ids never collide and never merge namespaces", () => {
  const ids = [
    "user_a",
    "user_A",
    "user_a ",
    "user.a",
    "user/a",
    "auth0|user_a",
    "b3f1c0de-9a7e-4b1d-8f66-4c2a1d9e5f00",
    "b3f1c0de-9a7e-4b1d-8f66-4c2a1d9e5f01",
    "用户_9931",
    "用户_9932",
  ];
  const segs = ids.map((i) => encodeOwnerId(i)!);
  assert.equal(new Set(segs).size, ids.length, "no two raw ids share a segment");
  const keys = ids.map((i) => scopedKey({ kind: "account", id: i }, "plan"));
  assert.equal(new Set(keys).size, ids.length);
  // an account and a guest with the same raw id stay separate
  assert.notEqual(scopedKey({ kind: "account", id: "same" }, "plan"), scopedKey({ kind: "guest", id: "same" }, "plan"));
});

test("two accounts and a guest never see each other's data", async () => {
  const kv = new MemoryKV();
  let current: OwnerToken | null = tok("account", "user_aaaa1111");
  const store = new ScopedStore(kv, () => current);

  await store.writeGuarded(current, "workouts", [{ id: "w1" }]);
  current = tok("account", "user_bbbb2222", 2);
  await store.writeGuarded(current, "workouts", [{ id: "w2" }]);
  current = tok("guest", "g_zzz99999", 3);
  await store.writeGuarded(current, "workouts", [{ id: "w3" }]);

  assert.deepEqual(await store.read(acct("user_aaaa1111"), "workouts", []), [{ id: "w1" }]);
  assert.deepEqual(await store.read(acct("user_bbbb2222"), "workouts", []), [{ id: "w2" }]);
  assert.deepEqual(await store.read({ kind: "guest", id: "g_zzz99999" }, "workouts", []), [{ id: "w3" }]);
});

test("sign-in does not transfer guest data and sign-out restores the guest scope", async () => {
  const kv = new MemoryKV();
  let current: OwnerToken | null = tok("guest", "g_stable0001");
  const store = new ScopedStore(kv, () => current);
  await store.writeGuarded(current, "workouts", [{ id: "guest-workout" }]);

  current = tok("account", "user_cccc3333", 2); // sign-in
  assert.deepEqual(await store.read(current, "workouts", []), [], "account scope starts empty");

  current = tok("guest", "g_stable0001", 3); // sign-out
  assert.deepEqual(await store.read(current, "workouts", []), [{ id: "guest-workout" }]);
});

test("owner change BEFORE the write begins rejects without touching storage", async () => {
  const kv = new MemoryKV();
  let current: OwnerToken | null = tok("account", "user_dddd4444");
  const store = new ScopedStore(kv, () => current);
  const captured = current;

  current = tok("account", "user_eeee5555", 2);
  const res = await store.writeGuarded(captured, "workouts", [{ id: "late" }]);
  assert.deepEqual(res, { ok: false, reason: "owner_changed" });
  assert.deepEqual(await store.read(captured, "workouts", []), []);
  assert.deepEqual(kv.snapshot(), {}, "not even a pending entry is left behind");
});

test("owner change WHILE a write is pending discards only the pending value", async () => {
  const kv = new MemoryKV();
  let current: OwnerToken | null = tok("account", "user_ffff0001");
  const captured = current;
  // flip the owner during the pending write
  const flipping = new MemoryKV();
  const spy = {
    get: (k: string) => flipping.get(k),
    set: async (k: string, v: string) => {
      await flipping.set(k, v);
      if (k.endsWith("__pending") && k.includes(".workouts.")) current = tok("guest", "g_intruder001", 2);
    },
    remove: (k: string) => flipping.remove(k),
  };
  const store = new ScopedStore(spy, () => current);
  await store.writeGuarded(captured, "plan", { days: ["canonical-untouched"] });

  const res = await store.writeGuarded(captured, "workouts", [{ id: "pending-only" }]);
  assert.deepEqual(res, { ok: false, reason: "owner_changed" });
  const keys = Object.keys(flipping.snapshot());
  assert.equal(keys.some((k) => k.endsWith("__pending")), false, "pending data cleaned up");
  assert.equal(keys.some((k) => k.includes(".workouts.")), false, "nothing promoted");
  assert.notEqual(await store.read({ kind: "account", id: "user_ffff0001" }, "plan", null), null);
});

test("an aborted mutation never deletes an existing canonical value", async () => {
  const kv = new MemoryKV();
  let current: OwnerToken | null = tok("account", "user_canon001");
  const store = new ScopedStore(kv, () => current);
  await store.writeGuarded(current, "workouts", [{ id: "keep-me" }]);
  const captured = current;

  current = tok("account", "user_other002", 2); // owner switched
  const res = await store.writeGuarded(captured, "workouts", [{ id: "should-not-land" }]);
  assert.deepEqual(res, { ok: false, reason: "owner_changed" });
  assert.deepEqual(
    await store.read({ kind: "account", id: "user_canon001" }, "workouts", []),
    [{ id: "keep-me" }],
    "canonical value survives the aborted mutation",
  );
});

test("account A mutation cannot alter account B or guest data", async () => {
  const kv = new MemoryKV();
  const a = tok("account", "user_A", 1);
  const b = tok("account", "user_B", 2);
  const g = tok("guest", "g_local", 3);
  let current: OwnerToken | null = a;
  const store = new ScopedStore(kv, () => current);
  await store.writeGuarded(a, "plan", { owner: "A" });
  current = b;
  await store.writeGuarded(b, "plan", { owner: "B" });
  current = g;
  await store.writeGuarded(g, "plan", { owner: "G" });

  current = a;
  await store.writeGuarded(a, "plan", { owner: "A2" });
  assert.deepEqual(await store.read({ kind: "account", id: "user_B" }, "plan", null), { owner: "B" });
  assert.deepEqual(await store.read({ kind: "guest", id: "g_local" }, "plan", null), { owner: "G" });
});

test("pending data is invisible to normal readers and cleanup removes only pending", async () => {
  const kv = new MemoryKV();
  const t = tok("guest", "g_pending01");
  const store = new ScopedStore(kv, () => t);
  await store.writeGuarded(t, "plan", { canonical: true });
  const owner: Owner = { kind: "guest", id: "g_pending01" };
  // simulate an interruption that left a journal entry behind
  await kv.set(`${scopedKey(owner, "plan")}.__pending`, JSON.stringify({ canonical: false }));
  assert.deepEqual(await store.read(owner, "plan", null), { canonical: true });
  assert.deepEqual(await store.readPending(owner, "plan"), { canonical: false });
  await store.cleanupPending(owner, "plan");
  assert.equal(await store.readPending(owner, "plan"), null);
  assert.deepEqual(await store.read(owner, "plan", null), { canonical: true });
});

test("an unresolved owner can neither read nor write scoped data", async () => {
  const kv = new MemoryKV();
  const store = new ScopedStore(kv, () => null);
  const res = await store.writeGuarded(null, "workouts", [{ id: "x" }]);
  assert.deepEqual(res, { ok: false, reason: "unresolved_owner" });
  assert.deepEqual(await store.read(null, "workouts", ["fallback"]), ["fallback"]);
  assert.deepEqual(kv.snapshot(), {});
});
