// Switching kg to lb must convert the figure, not just relabel it.
import assert from "node:assert/strict";
import test from "node:test";

import { KG_PER_LB, convertWeight, displayWeight, roundForUnit, unitOfRecord } from "../src/units/weight";

test("the same unit is never touched", () => {
  assert.equal(convertWeight(40, "kg", "kg"), 40);
  assert.equal(convertWeight(135, "lb", "lb"), 135);
});

test("40 kg reads as 88 lb, not as 40 lb", () => {
  assert.equal(convertWeight(40, "kg", "lb"), 88);
  assert.equal(convertWeight(100, "kg", "lb"), 220);
});

test("and converts back to where it started", () => {
  assert.equal(convertWeight(convertWeight(40, "kg", "lb"), "lb", "kg"), 40);
  assert.equal(convertWeight(convertWeight(60, "kg", "lb"), "lb", "kg"), 60);
  assert.equal(convertWeight(convertWeight(100, "kg", "lb"), "lb", "kg"), 100);
});

test("repeated switching does not drift a load away from itself", () => {
  let v = 42.5;
  let unit: "kg" | "lb" = "kg";
  for (let i = 0; i < 12; i++) {
    const next: "kg" | "lb" = unit === "kg" ? "lb" : "kg";
    v = convertWeight(v, unit, next);
    unit = next;
  }
  assert.equal(unit, "kg");
  assert.ok(Math.abs(v - 42.5) <= 0.5, `drifted to ${v}`);
});

test("a converted load lands on something a person can actually load", () => {
  assert.equal(roundForUnit(87.9, "lb"), 88, "whole pounds");
  assert.equal(roundForUnit(42.3, "kg"), 42.5, "half kilos");
  assert.equal(roundForUnit(42.1, "kg"), 42);
});

test("zero and unusable values stay zero rather than becoming NaN", () => {
  for (const bad of [0, NaN, Infinity, -Infinity]) {
    const out = convertWeight(bad as number, "kg", "lb");
    assert.ok(Number.isFinite(out) && out === 0, String(bad));
  }
});

test("a record without a stored unit is read in the captured fallback", () => {
  assert.equal(unitOfRecord(undefined, "lb"), "lb");
  assert.equal(unitOfRecord("kg", "lb"), "kg", "a stamped record ignores the fallback");
  // 135 typed under lb stays 135 lb on screen — it is not re-read as kg.
  assert.equal(displayWeight(135, undefined, "lb", "lb"), 135);
  assert.equal(displayWeight(135, undefined, "kg", "lb"), 61, "and converts honestly when the view changes");
});

test("the pound is the exact defined value", () => {
  assert.equal(KG_PER_LB, 0.45359237);
});
