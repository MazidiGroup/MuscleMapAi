// Bodyweight load presentation.
//
// A bodyweight exercise never shows "0 kg": it shows `BW`, and once the user logs
// extra load it shows `BW + <load> <unit>`. Loaded exercises are unchanged. No
// number is ever converted here — the stored unit is the displayed unit.

import { WeightUnit, formatLoad } from "@/src/units/unitPreference";

export function isBodyweightEquipment(equipment?: string | null): boolean {
  if (typeof equipment !== "string" || !equipment) return false;
  return /body\s*weight|^bw$/i.test(equipment.trim());
}

/** Display string for one logged set's load. */
export function formatSetLoad(weight: number, unit: WeightUnit, bodyweight: boolean): string {
  return formatLoad(weight, unit, { bodyweight });
}

/** Column header above the load input: "KG" / "LB", or "+KG" for bodyweight. */
export function loadColumnLabel(unit: WeightUnit, bodyweight: boolean): string {
  return `${bodyweight ? "+" : ""}${unit.toUpperCase()}`;
}

/** Placeholder inside the load input. */
export function loadPlaceholder(bodyweight: boolean): string {
  return bodyweight ? "BW" : "0";
}
