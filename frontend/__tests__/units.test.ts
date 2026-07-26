// Stored unit preference: persistence, single binding, locale fallback.
import assert from "node:assert/strict";
import test from "node:test";

import { MemoryKV } from "../src/owner/kv";
import { Owner } from "../src/owner/scopeKeys";
import { ScopedStore } from "../src/owner/scopedStore";
import {
  SUPPORTED_UNITS,
  assertSingleUnit,
  formatLoad,
  resolveUnitPreference,
  setUnitPreference,
  unitForLocale,
} from "../src/units/unitPreference";

const guest: Owner = { kind: "guest", id: "g_units00001" };

function make() {
  let current: Owner | null = guest;
  const kv = new MemoryKV();
  return { kv, store: new ScopedStore(kv, () => current), setOwner: (o: Owner | null) => (current = o) };
}

test("exactly lb and kg are supported and both persist", async () => {
  assert.deepEqual(SUPPORTED_UNITS, ["lb", "kg"]);
  const { store } = make();
  for (const u of SUPPORTED_UNITS) {
    await setUnitPreference(store, guest, u);
    assert.deepEqual(await resolveUnitPreference(store, guest, "en-GB"), { unit: u, source: "stored" });
  }
  await assert.rejects(async () => setUnitPreference(store, guest, "lbs" as any));
});

test("Workout and History adapters resolve through one preference", async () => {
  const { store } = make();
  await setUnitPreference(store, guest, "kg");
  const workoutUnit = (await resolveUnitPreference(store, guest, "en-US")).unit;
  const historyUnit = (await resolveUnitPreference(store, guest, "en-US")).unit;
  assert.equal(workoutUnit, historyUnit);
  assert.equal(workoutUnit, "kg", "a stored preference always beats the locale fallback");
});

test("a new owner gets a deterministic locale-aware initial unit", async () => {
  const { store } = make();
  assert.equal((await resolveUnitPreference(store, guest, "en-US")).unit, "lb");
  assert.equal((await resolveUnitPreference(store, guest, "en-US")).source, "locale");
  assert.equal((await resolveUnitPreference(store, guest, "en-GB")).unit, "kg");
  assert.equal((await resolveUnitPreference(store, guest, "de-DE")).unit, "kg");
  assert.equal(unitForLocale("en_US"), "lb");
  assert.equal(unitForLocale(null), "kg", "no signal never becomes a global lb default");
});

test("owner scopes hold independent unit preferences", async () => {
  const { store, setOwner } = make();
  const account: Owner = { kind: "account", id: "user_unit00001" };
  await setUnitPreference(store, guest, "kg");
  setOwner(account);
  await setUnitPreference(store, account, "lb");
  assert.equal((await resolveUnitPreference(store, guest, "en-GB")).unit, "kg");
  assert.equal((await resolveUnitPreference(store, account, "en-GB")).unit, "lb");
});

test("bodyweight and added-load formats follow the frozen contract", () => {
  assert.equal(formatLoad(0, "kg", { bodyweight: true }), "BW");
  assert.equal(formatLoad(10, "lb", { bodyweight: true }), "BW + 10 lb");
  assert.equal(formatLoad(60, "kg"), "60 kg");
});

test("a mixed-unit aggregate is refused", () => {
  assert.equal(assertSingleUnit(["kg", "kg"]), "kg");
  assert.throws(() => assertSingleUnit(["kg", "lb"]), /mix kg and lb/);
});
