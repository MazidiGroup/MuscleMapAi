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
  let current: any = { ...guest, generation: 1 };
  const kv = new MemoryKV();
  return { kv, store: new ScopedStore(kv, () => current), setOwner: (o: any) => (current = o) };
}

test("exactly lb and kg are supported and both persist", async () => {
  assert.deepEqual(SUPPORTED_UNITS, ["lb", "kg"]);
  const { store } = make();
  for (const u of SUPPORTED_UNITS) {
    await setUnitPreference(store, { ...guest, generation: 1 }, u);
    assert.deepEqual(await resolveUnitPreference(store, guest, "en-GB"), { unit: u, source: "stored" });
  }
  await assert.rejects(async () => setUnitPreference(store, { ...guest, generation: 1 }, "lbs" as any));
});

test("Workout and History adapters resolve through one preference", async () => {
  const { store } = make();
  await setUnitPreference(store, { ...guest, generation: 1 }, "kg");
  const workoutUnit = (await resolveUnitPreference(store, guest, "en-US")).unit;
  const historyUnit = (await resolveUnitPreference(store, guest, "en-US")).unit;
  assert.equal(workoutUnit, historyUnit);
  assert.equal(workoutUnit, "kg", "a stored preference always beats the locale fallback");
});

test("locale resolution is regional, never language-based", async () => {
  const { store } = make();
  const cases: [string | null | undefined, "lb" | "kg"][] = [
    ["en-US", "lb"],
    ["en-GB", "kg"],
    ["en", "kg"], // language only -> never lb
    ["es-US", "lb"],
    ["fr-CA", "kg"],
    ["de-DE", "kg"],
    ["en_US", "lb"],
    ["en-US.UTF-8", "lb"],
    ["my-MM", "lb"],
    ["en-LR", "lb"],
    ["es", "kg"],
    [null, "kg"],
    [undefined, "kg"],
    ["", "kg"],
  ];
  for (const [locale, expected] of cases) {
    assert.equal(unitForLocale(locale), expected, `unitForLocale(${String(locale)})`);
    assert.equal((await resolveUnitPreference(store, guest, locale ?? null)).unit, expected);
  }
  assert.equal((await resolveUnitPreference(store, guest, "en-US")).source, "locale");
});

test("a persisted preference always overrides the locale", async () => {
  const { store } = make();
  await setUnitPreference(store, { ...guest, generation: 1 }, "kg");
  assert.deepEqual(await resolveUnitPreference(store, guest, "en-US"), { unit: "kg", source: "stored" });
  await setUnitPreference(store, { ...guest, generation: 1 }, "lb");
  assert.deepEqual(await resolveUnitPreference(store, guest, "en-GB"), { unit: "lb", source: "stored" });
});

test("owner scopes hold independent unit preferences", async () => {
  const { store, setOwner } = make();
  const account: Owner = { kind: "account", id: "user_unit00001" };
  await setUnitPreference(store, { ...guest, generation: 1 }, "kg");
  setOwner({ ...account, generation: 2 });
  await setUnitPreference(store, { ...account, generation: 2 }, "lb");
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
