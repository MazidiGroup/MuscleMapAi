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
  isLegacyKey,
  isUsableOwnerId,
  migrationMarkerKey,
  quarantineKey,
  scopedKey,
} from "../src/owner/scopeKeys";
import { ScopedStore } from "../src/owner/scopedStore";

const acct = (id: string): Owner => ({ kind: "account", id });

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
  assert.ok(scopedKey(g, "workouts").startsWith(`${SCOPE_PREFIX}.guest.g_abc123.`));
  assert.ok(scopedKey(a, "workouts").startsWith(`${SCOPE_PREFIX}.acct.user_deadbeef01.`));
  assert.notEqual(scopedKey(g, "workouts"), scopedKey(a, "workouts"));
  assert.match(scopedKey(g, "workouts"), /\.workouts\.v1$/);
  for (const k of [scopedKey(g, "plan"), migrationMarkerKey(g, "plan"), quarantineKey(g, "plan")]) {
    assert.equal(isLegacyKey(k), false);
    assert.ok(!LEGACY_KEYS.some((legacy) => k === legacy || k.startsWith(`${legacy}.`)));
  }
});

test("malformed or missing account identity is not usable as an owner", () => {
  for (const bad of ["", "ab", "user id", "a@b.com", null, undefined, 42, "x".repeat(200)]) {
    assert.equal(isUsableOwnerId(bad as unknown), false);
  }
  assert.equal(isUsableOwnerId("user_1234abcd"), true);
});

test("two accounts and a guest never see each other's data", async () => {
  const kv = new MemoryKV();
  let current: Owner | null = acct("user_aaaa1111");
  const store = new ScopedStore(kv, () => current);

  await store.write(acct("user_aaaa1111"), "workouts", [{ id: "w1" }]);
  current = acct("user_bbbb2222");
  await store.write(acct("user_bbbb2222"), "workouts", [{ id: "w2" }]);
  current = { kind: "guest", id: "g_zzz99999" };
  await store.write(current, "workouts", [{ id: "w3" }]);

  assert.deepEqual(await store.read(acct("user_aaaa1111"), "workouts", []), [{ id: "w1" }]);
  assert.deepEqual(await store.read(acct("user_bbbb2222"), "workouts", []), [{ id: "w2" }]);
  assert.deepEqual(await store.read({ kind: "guest", id: "g_zzz99999" }, "workouts", []), [{ id: "w3" }]);
});

test("sign-in does not transfer guest data and sign-out restores the guest scope", async () => {
  const kv = new MemoryKV();
  let current: Owner | null = { kind: "guest", id: "g_stable0001" };
  const store = new ScopedStore(kv, () => current);
  await store.write(current, "workouts", [{ id: "guest-workout" }]);

  current = acct("user_cccc3333"); // sign-in
  assert.deepEqual(await store.read(current, "workouts", []), [], "account scope starts empty");

  current = { kind: "guest", id: "g_stable0001" }; // sign-out
  assert.deepEqual(await store.read(current, "workouts", []), [{ id: "guest-workout" }]);
});

test("a write is rejected when the owner changes before commit", async () => {
  const kv = new MemoryKV();
  let current: Owner | null = acct("user_dddd4444");
  const store = new ScopedStore(kv, () => current);
  const captured = acct("user_dddd4444");

  current = acct("user_eeee5555"); // owner changed after capture
  const res = await store.write(captured, "workouts", [{ id: "late" }]);
  assert.deepEqual(res, { ok: false, reason: "owner_changed" });
  assert.deepEqual(await store.read(captured, "workouts", []), []);
});

test("an unresolved owner can neither read nor write scoped data", async () => {
  const kv = new MemoryKV();
  const store = new ScopedStore(kv, () => null);
  const res = await store.write(null, "workouts", [{ id: "x" }]);
  assert.deepEqual(res, { ok: false, reason: "unresolved_owner" });
  assert.deepEqual(await store.read(null, "workouts", ["fallback"]), ["fallback"]);
  assert.deepEqual(kv.snapshot(), {});
});
