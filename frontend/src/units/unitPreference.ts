// Owner-scoped stored unit preference (decision 4.2).
//
//  - supported stored values are exactly `lb` and `kg`;
//  - one preference resolves for both Workout and History;
//  - a new owner gets a locale-aware initial selection, never a global hardcode;
//  - `lb` is only the en-US representative fallback when no stronger signal exists;
//  - migrated legacy values are kg and are never numerically reinterpreted.

import { Owner } from "./../owner/scopeKeys";
import { ScopedStore } from "./../owner/scopedStore";

export type WeightUnit = "lb" | "kg";

export const SUPPORTED_UNITS: WeightUnit[] = ["lb", "kg"];

/** Regions that use pounds for bodyweight/training loads. */
const POUND_REGIONS = new Set(["US", "LR", "MM"]);

export function isWeightUnit(v: unknown): v is WeightUnit {
  return v === "lb" || v === "kg";
}

/** Deterministic locale → unit mapping. Locale is injected so tests are stable. */
export function unitForLocale(locale: string | null | undefined): WeightUnit {
  if (!locale) return "kg";
  const region = locale.replace("_", "-").split("-").slice(1).find((p) => /^[A-Za-z]{2}$/.test(p));
  if (!region) return locale.toLowerCase() === "en" ? "lb" : "kg";
  return POUND_REGIONS.has(region.toUpperCase()) ? "lb" : "kg";
}

export function deviceLocale(): string | null {
  try {
    // Intl is available in Hermes with the full-ICU build used by Expo SDK 54.
    return Intl.DateTimeFormat().resolvedOptions().locale ?? null;
  } catch {
    return null;
  }
}

export type UnitResolution = { unit: WeightUnit; source: "stored" | "locale" };

/** The one preference both Workout and History must resolve through. */
export async function resolveUnitPreference(
  store: ScopedStore,
  owner: Owner | null,
  locale: string | null = deviceLocale(),
): Promise<UnitResolution> {
  const stored = await store.read<unknown>(owner, "unitPreference", null);
  if (isWeightUnit(stored)) return { unit: stored, source: "stored" };
  return { unit: unitForLocale(locale), source: "locale" };
}

export async function setUnitPreference(store: ScopedStore, owner: Owner | null, unit: WeightUnit) {
  if (!isWeightUnit(unit)) throw new Error("unsupported unit");
  return store.write(owner, "unitPreference", unit);
}

/**
 * Display helper. Values are never converted here — a stored value carries the
 * unit it was recorded in, and totals must never mix systems.
 */
export function formatLoad(
  weight: number,
  unit: WeightUnit,
  opts: { bodyweight?: boolean } = {},
): string {
  if (opts.bodyweight) return weight > 0 ? `BW + ${weight} ${unit}` : "BW";
  return `${weight} ${unit}`;
}

/** Guard used by aggregate builders: refuses to total mixed unit systems. */
export function assertSingleUnit(units: WeightUnit[]): WeightUnit {
  const distinct = Array.from(new Set(units));
  if (distinct.length > 1) throw new Error("refusing to mix kg and lb in one total");
  return distinct[0] ?? "kg";
}
