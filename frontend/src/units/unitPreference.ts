// Owner-scoped stored unit preference (decision 4.2).
//
//  - supported stored values are exactly `lb` and `kg`;
//  - one preference resolves for both Workout and History;
//  - a new owner gets a locale-aware initial selection, never a global hardcode;
//  - `lb` is only the en-US representative fallback when no stronger signal exists;
//  - migrated legacy values are kg and are never numerically reinterpreted.

import { Owner } from "./../owner/scopeKeys";
import { OwnerToken, ScopedStore } from "./../owner/scopedStore";

export type WeightUnit = "lb" | "kg";

export const SUPPORTED_UNITS: WeightUnit[] = ["lb", "kg"];

/** Regions that use pounds for bodyweight and training loads. */
const POUND_REGIONS = new Set(["US", "LR", "MM"]);

export function isWeightUnit(v: unknown): v is WeightUnit {
  return v === "lb" || v === "kg";
}

/**
 * Locale → unit. Measurement units are a REGIONAL property, never a language
 * property, so a language-only locale (`en`, `es`) resolves to kg. Only a
 * reliable region of US, LR or MM yields lb. Locale is injected so the mapping
 * is deterministic in tests.
 */
export function unitForLocale(locale: string | null | undefined): WeightUnit {
  const region = regionOf(locale);
  if (!region) return "kg"; // missing or ambiguous region
  return POUND_REGIONS.has(region) ? "lb" : "kg";
}

/** Extracts an ISO 3166-1 alpha-2 region from a BCP 47 / POSIX locale tag. */
export function regionOf(locale: string | null | undefined): string | null {
  if (typeof locale !== "string" || !locale) return null;
  const tag = locale.replace(/_/g, "-").split(".")[0];
  const parts = tag.split("-").slice(1);
  for (const p of parts) {
    if (/^[A-Za-z]{2}$/.test(p)) return p.toUpperCase();
  }
  return null;
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

export async function setUnitPreference(store: ScopedStore, owner: OwnerToken | null, unit: WeightUnit) {
  if (!isWeightUnit(unit)) throw new Error("unsupported unit");
  return store.writeGuarded(owner, "unitPreference", unit);
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
