// Weight conversion between the two supported units.
//
// The app stores each logged number in the unit that was on screen when it was
// entered, and records which unit that was. Nothing is stored "unitless": a
// bare number is meaningless the moment the preference changes, which is the
// bug this module exists to close — switching kg to lb used to relabel 40 kg as
// 40 lb, silently restating every load as roughly double.
//
// Conversion happens at exactly two boundaries:
//   - reading a stored number for display, from the record's own unit;
//   - switching the preference, which rewrites the ACTIVE session's numbers so
//     the figures on screen keep their meaning.
// Finished history is never rewritten. It carries its own unit and is converted
// only on the way to the screen.

import { WeightUnit } from "./unitPreference";

/** Exact, by definition (international avoirdupois pound). */
export const KG_PER_LB = 0.45359237;

/**
 * Gym loads are chosen from real plates and dumbbells, so a converted figure is
 * rounded to something a person could actually load: whole pounds, and half
 * kilos. Rounding at the display boundary only — the stored number is never
 * re-rounded, so switching back and forth cannot drift a record.
 */
export function roundForUnit(value: number, unit: WeightUnit): number {
  if (!Number.isFinite(value)) return 0;
  return unit === "lb" ? Math.round(value) : Math.round(value * 2) / 2;
}

/** Converts a load between units. Returns it unchanged when they match. */
export function convertWeight(value: number, from: WeightUnit, to: WeightUnit): number {
  if (!Number.isFinite(value) || value === 0 || from === to) return Number.isFinite(value) ? value : 0;
  const kg = from === "lb" ? value * KG_PER_LB : value;
  return roundForUnit(to === "lb" ? kg / KG_PER_LB : kg, to);
}

/**
 * The unit a stored record is in.
 *
 * Records written before loads carried a unit are read in `fallback` — the
 * preference captured when the app first ran this version, which is the unit
 * those numbers were typed under. This never changes a stored number; it only
 * says how to read one.
 */
export function unitOfRecord(recordUnit: WeightUnit | undefined, fallback: WeightUnit): WeightUnit {
  return recordUnit ?? fallback;
}

/** A stored load, converted for display under the current preference. */
export function displayWeight(
  value: number,
  recordUnit: WeightUnit | undefined,
  displayUnit: WeightUnit,
  fallback: WeightUnit,
): number {
  return convertWeight(value, unitOfRecord(recordUnit, fallback), displayUnit);
}
