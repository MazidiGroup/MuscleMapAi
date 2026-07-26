// Phase 2 — bodyweight load presentation and exact ID-space preservation.
import assert from "node:assert/strict";
import test from "node:test";

import { formatSetLoad, isBodyweightEquipment, loadColumnLabel, loadPlaceholder } from "../src/anatomy/bodyweight";
import { buildActiveSession } from "../src/anatomy/workoutScope";

const token = { kind: "guest" as const, id: "g_loads01", generation: 1 };

test("bodyweight equipment is recognised, loaded equipment is not", () => {
  assert.equal(isBodyweightEquipment("Bodyweight"), true);
  assert.equal(isBodyweightEquipment("body weight"), true);
  assert.equal(isBodyweightEquipment("bw"), true);
  assert.equal(isBodyweightEquipment("Barbell"), false);
  assert.equal(isBodyweightEquipment(undefined), false);
  assert.equal(isBodyweightEquipment(""), false);
});

test("a bodyweight set reads BW, and BW + load once weight is added", () => {
  assert.equal(formatSetLoad(0, "kg", true), "BW");
  assert.equal(formatSetLoad(10, "kg", true), "BW + 10 kg");
  assert.equal(formatSetLoad(10, "lb", true), "BW + 10 lb");
});

test("a loaded set always shows the stored unit and is never converted", () => {
  assert.equal(formatSetLoad(0, "kg", false), "0 kg");
  assert.equal(formatSetLoad(60, "kg", false), "60 kg");
  assert.equal(formatSetLoad(60, "lb", false), "60 lb");
});

test("the load column follows the owner's unit preference", () => {
  assert.equal(loadColumnLabel("kg", false), "KG");
  assert.equal(loadColumnLabel("lb", false), "LB");
  assert.equal(loadColumnLabel("kg", true), "+KG");
  assert.equal(loadPlaceholder(true), "BW");
  assert.equal(loadPlaceholder(false), "0");
});

test("an exercise added from the plan keeps its exact id and its ID space", () => {
  const session = buildActiveSession(
    token,
    "s1",
    1_000,
    [
      { exerciseId: "barbell-bench-press", idSpace: "plan", sets: [], notes: "" },
      { exerciseId: "Barbell-Bench-Press", idSpace: "anatomy", sets: [], notes: "" },
      { exerciseId: "pull-up", sets: [], notes: "" },
    ],
    () => 2_000,
  );
  assert.deepEqual(
    session.exercises.map((e) => [e.exerciseId, e.idSpace]),
    [
      ["barbell-bench-press", "plan"],
      ["Barbell-Bench-Press", "anatomy"],
      ["pull-up", "anatomy"],
    ],
    "ids are byte-identical, case is preserved, and a missing space defaults to the library",
  );
  assert.equal(session.ownerId, token.id);
  assert.equal(session.updatedAt, 2_000);
});
