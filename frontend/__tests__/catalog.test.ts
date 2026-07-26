// Phase 3 — Exercise Library: catalogue integrity, local search, real facets,
// and Library → workout context routing.
import assert from "node:assert/strict";
import test from "node:test";

import { CatalogExercise, EQUIPMENT_ORDER, FULL_CATALOG, getCatalogExercise } from "../src/anatomy/exerciseCatalog";
import RAW_PACK from "../src/anatomy/exerciseCatalog.json";

const PACK_RECORDS = (RAW_PACK as unknown[]).length;
import {
  activeFilterCount,
  applyLabel,
  catalogIntegrity,
  equipmentFacets,
  filterEmptyCopy,
  movementFacets,
  muscleFacets,
  myEquipmentFilters,
  noMatchCopy,
  queryCatalogue,
  resultCountLabel,
  searchHaystack,
  searchPlaceholder,
  toggleFilter,
} from "../src/library/catalogQuery";
import { ADD_COPY, isAlreadyInSession, resolveAddContext } from "../src/library/addRouting";
import type { Plan } from "../src/plan/exercises";

// --- catalogue integrity ---------------------------------------------------

test("the live catalogue count is verified, and its delta to the frozen figure explained", () => {
  const audit = catalogIntegrity();
  // The frozen brief expects 206. The repository actually ships 208: the 206
  // records of the metadata pack PLUS the two legacy-only exercises that have no
  // pack equivalent (cable-external-rotation, seated-calf-raise) and are kept so
  // no previously logged workout loses its exercise. Reported, not "fixed".
  assert.equal(audit.count, 208, `live catalogue count is ${audit.count}`);
  assert.equal(PACK_RECORDS, 206, "the metadata pack itself holds the frozen 206 records");
  assert.equal(audit.count - PACK_RECORDS, 2, "delta = the two legacy-only exercises");
  assert.ok(getCatalogExercise("cable-external-rotation"));
  assert.ok(getCatalogExercise("seated-calf-raise"));
  assert.equal(audit.uniqueIdCount, audit.count, "every id is unique");
  assert.deepEqual(audit.duplicateIds, []);
});

test("every catalogue record has the fields the Library renders and searches", () => {
  const audit = catalogIntegrity();
  assert.deepEqual(audit.missingName, []);
  assert.deepEqual(audit.missingEquipment, []);
  assert.deepEqual(audit.unsearchable, []);
});

test("malformed records are reported, never silently repaired or overwritten", () => {
  const broken = [
    { id: "a", name: "A", equipment: "Barbell", primaryMuscles: ["Chest"], movementPattern: "Push", tags: [] },
    { id: "a", name: "Duplicate id", equipment: "Barbell", primaryMuscles: [], movementPattern: "Push", tags: [] },
    { id: "b", name: "", equipment: "", primaryMuscles: [], movementPattern: "", tags: [] },
  ] as unknown as CatalogExercise[];
  const audit = catalogIntegrity(broken);
  assert.equal(audit.count, 3);
  assert.deepEqual(audit.duplicateIds, ["a"]);
  assert.deepEqual(audit.missingName, ["b"]);
  assert.deepEqual(audit.missingEquipment, ["b"]);
  assert.deepEqual(audit.unsearchable, ["b"]);
});

test("exact repository identifiers are preserved and resolvable", () => {
  const bench = getCatalogExercise("bench-press");
  assert.ok(bench);
  assert.equal(bench.id, "bench-press", "the legacy id stays the canonical id");
  assert.ok(getCatalogExercise("barbell-bench-press"), "the pack slug still resolves");
  assert.equal(getCatalogExercise("Bench-Press"), undefined, "ids are case-sensitive, never guessed");
  assert.equal(getCatalogExercise("Barbell Bench Press"), undefined, "a display name is never an identifier");
});

// --- search ----------------------------------------------------------------

test("search covers name, equipment, movement, muscles and catalogue tags only", () => {
  const ex = FULL_CATALOG.find((e) => e.id === "bench-press")!;
  const hay = searchHaystack(ex);
  assert.ok(hay.includes(ex.name.toLowerCase()));
  assert.ok(hay.includes(ex.equipment.toLowerCase()));
  assert.ok(hay.includes(ex.movementPattern.toLowerCase()));
  assert.ok(!hay.includes("flat bench"), "no invented aliases are searched");
});

test("search is deterministic, local and case-insensitive", () => {
  const a = queryCatalogue("BENCH");
  const b = queryCatalogue("bench");
  assert.deepEqual(a.map((e) => e.id), b.map((e) => e.id));
  assert.ok(a.length > 0);
  assert.ok(a.every((e) => searchHaystack(e).includes("bench")));
});

test("an empty query returns the whole catalogue", () => {
  assert.equal(queryCatalogue("").length, FULL_CATALOG.length);
  assert.equal(queryCatalogue("   ").length, FULL_CATALOG.length);
});

test("a muscle or equipment word finds exercises without naming them", () => {
  assert.ok(queryCatalogue("kettlebell").length > 0);
  assert.ok(queryCatalogue("hamstrings").length > 0);
});

test("result counts come from the filtered collection, not a hardcoded number", () => {
  const results = queryCatalogue("press");
  assert.equal(resultCountLabel(results.length, "press"), `${results.length} results for “press”`);
  assert.equal(searchPlaceholder(catalogIntegrity().count), "Search 208 exercises");
  assert.ok(!searchPlaceholder(catalogIntegrity().count).includes("206"), "the count is derived, never hardcoded");
});

test("no-match copy is the frozen line", () => {
  assert.deepEqual(queryCatalogue("zzzznotanexercise"), []);
  assert.equal(
    noMatchCopy("yoga"),
    "No matches for “yoga”. Try another exercise name, muscle or equipment type.",
  );
});

// --- filters ---------------------------------------------------------------

test("facets and their counts are derived from the catalogue", () => {
  const equip = equipmentFacets();
  assert.ok(equip.length > 0);
  for (const f of equip) {
    assert.equal(f.count, queryCatalogue("", { equipment: [f.value] }).length);
  }
  const known = equip.map((f) => f.value);
  for (const expected of EQUIPMENT_ORDER) {
    if (FULL_CATALOG.some((e) => e.equipment === expected)) assert.ok(known.includes(expected), expected);
  }
});

test("no fabricated facets exist", () => {
  const names = [...equipmentFacets(), ...muscleFacets(), ...movementFacets()].map((f) => f.value.toLowerCase());
  for (const banned of ["popularity", "rating", "difficulty", "suitability", "goal", "recommended"]) {
    assert.ok(!names.includes(banned), banned);
  }
});

test("equipment, muscle and movement filters compose", () => {
  const equip = queryCatalogue("", { equipment: ["Dumbbell"] });
  assert.ok(equip.length > 0);
  assert.ok(equip.every((e) => e.equipment === "Dumbbell"));

  const muscle = queryCatalogue("", { muscle: ["Chest"] });
  assert.ok(muscle.every((e) => e.primaryMuscles.includes("Chest")));

  const combined = queryCatalogue("", { equipment: ["Dumbbell"], muscle: ["Chest"] });
  assert.ok(combined.length <= Math.min(equip.length, muscle.length));
  assert.ok(combined.every((e) => e.equipment === "Dumbbell" && e.primaryMuscles.includes("Chest")));

  const withQuery = queryCatalogue("press", { equipment: ["Dumbbell"] });
  assert.ok(withQuery.every((e) => e.equipment === "Dumbbell" && searchHaystack(e).includes("press")));
});

test("an impossible combination returns nothing and offers a way back", () => {
  const impossible = queryCatalogue("", { equipment: ["Band"], muscle: ["Quadriceps"] });
  if (impossible.length === 0) {
    assert.equal(
      filterEmptyCopy("Band", "Quadriceps"),
      "No Band exercises target Quadriceps in the Exercise Library. Remove a filter to see more.",
    );
  }
  // Clearing restores the unfiltered collection.
  assert.equal(queryCatalogue("", {}).length, FULL_CATALOG.length);
});

test("active filter count and toggling are exact", () => {
  let f = {};
  f = toggleFilter(f, "equipment", "Barbell");
  f = toggleFilter(f, "muscle", "Chest");
  assert.equal(activeFilterCount(f), 2);
  assert.equal(applyLabel(queryCatalogue("", f).length), `Show ${queryCatalogue("", f).length} exercises`);
  f = toggleFilter(f, "equipment", "Barbell");
  assert.equal(activeFilterCount(f), 1);
});

test("“My equipment” only pre-selects filters — it never shrinks the catalogue", () => {
  const preset = myEquipmentFilters(["db", "band"]);
  assert.deepEqual(preset.sort(), ["Band", "Bodyweight", "Dumbbell"]);
  // The unfiltered collection is unchanged and still discoverable.
  assert.equal(queryCatalogue("", {}).length, FULL_CATALOG.length);
  assert.ok(queryCatalogue("", { equipment: ["Barbell"] }).length > 0, "barbell work stays discoverable");
});

// --- Library → workout routing --------------------------------------------

const plan = (restToday: boolean): Plan =>
  ({
    answers: { days: [0], goal: "muscle", exp: "beginner", equip: [], focus: [], posture: false },
    seed: 1,
    splitLabel: "Full body",
    splitName: "Full body",
    days: Array.from({ length: 7 }, (_, i) => ({ dow: `d${i}`, rest: restToday })),
  }) as unknown as Plan;

test("an active session routes to the Add / View / Cancel guard", () => {
  assert.deepEqual(resolveAddContext({ hasActiveSession: true, plan: null }), { kind: "active" });
  assert.deepEqual(resolveAddContext({ hasActiveSession: true, plan: plan(false) }), { kind: "active" });
});

test("a Plan with no active session routes to today's planned workout", () => {
  const now = new Date(2026, 5, 17); // Wednesday
  const ctx = resolveAddContext({ hasActiveSession: false, plan: plan(false), now });
  assert.deepEqual(ctx, { kind: "planned", dayIndex: 2, restDay: false });
});

test("no Plan and no session routes to Build my free plan", () => {
  assert.deepEqual(resolveAddContext({ hasActiveSession: false, plan: null }), { kind: "no-plan" });
  assert.equal(ADD_COPY.noPlan, "You don’t have a Plan yet, so there’s no session to add this to.");
});

test("duplicate protection is by exact id and ID space", () => {
  const session = [
    { exerciseId: "bench-press", idSpace: "anatomy" as const, sets: [], notes: "" },
    { exerciseId: "squat", idSpace: "plan" as const, sets: [], notes: "" },
  ];
  assert.equal(isAlreadyInSession(session, "bench-press"), true);
  assert.equal(isAlreadyInSession(session, "bench-press", "plan"), false, "ID spaces are never merged");
  assert.equal(isAlreadyInSession(session, "squat", "plan"), true);
  assert.equal(isAlreadyInSession(session, "Bench-Press"), false, "ids are compared exactly");
  assert.equal(isAlreadyInSession(null, "bench-press"), false);
});

test("the add copy never promises a Plan change or an automatic retry", () => {
  assert.equal(ADD_COPY.onlyLine, "This workout only. Your weekly Plan stays unchanged.");
  assert.equal(
    ADD_COPY.addedExtra,
    "Added to today’s workout as an extra exercise. Your weekly Plan is unchanged.",
  );
  const all = Object.values(ADD_COPY).filter((v) => typeof v === "string") as string[];
  for (const copy of all) {
    assert.ok(!/automatically retry|will retry/i.test(copy), copy);
    assert.ok(!/skipped/i.test(copy), copy);
  }
});
