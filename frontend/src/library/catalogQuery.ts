// Exercise Library query layer — Phase 3.
//
// One pure module over the REAL repository catalogue. No remote search service,
// no fuzzy engine, no invented aliases, facets, ratings or difficulty scores:
// every option and every count is derived from the catalogue itself.
//
// Searchable fields (frozen Library spec): name · equipment · movement pattern ·
// muscle labels · existing catalogue tags. Matching is case-insensitive
// substring matching, so results are deterministic and work offline.

import { CatalogExercise, EQUIPMENT_ORDER, FULL_CATALOG, MOVEMENT_PATTERN_ORDER } from "@/src/anatomy/exerciseCatalog";

export type Facet = { value: string; count: number };

export type CatalogFilters = {
  equipment?: string[];
  muscle?: string[];
  movement?: string[];
  /** Beginner / Intermediate / Advanced, as normalised by the catalogue. */
  difficulty?: string[];
};

export const EMPTY_FILTERS: CatalogFilters = {};

// --- integrity -------------------------------------------------------------

export type CatalogIntegrity = {
  count: number;
  uniqueIdCount: number;
  duplicateIds: string[];
  missingName: string[];
  missingEquipment: string[];
  /** Records with nothing searchable at all. */
  unsearchable: string[];
};

/** Structural audit of the shipped catalogue. Reported, never auto-repaired. */
export function catalogIntegrity(list: CatalogExercise[] = FULL_CATALOG): CatalogIntegrity {
  const seen = new Set<string>();
  const duplicateIds: string[] = [];
  const missingName: string[] = [];
  const missingEquipment: string[] = [];
  const unsearchable: string[] = [];

  for (const ex of list) {
    const id = typeof ex?.id === "string" ? ex.id : "";
    if (!id) {
      unsearchable.push("<missing id>");
      continue;
    }
    if (seen.has(id)) duplicateIds.push(id);
    seen.add(id);
    if (!ex.name || typeof ex.name !== "string") missingName.push(id);
    if (!ex.equipment || typeof ex.equipment !== "string") missingEquipment.push(id);
    if (!searchHaystack(ex).trim()) unsearchable.push(id);
  }

  return {
    count: list.length,
    uniqueIdCount: seen.size,
    duplicateIds,
    missingName,
    missingEquipment,
    unsearchable,
  };
}

// --- search ----------------------------------------------------------------

/** Every field the frozen spec allows to be searched, lowercased. */
export function searchHaystack(ex: CatalogExercise): string {
  return [
    ex.name,
    ex.equipment,
    ex.movementPattern,
    ...(ex.primaryMuscles || []),
    ...(ex.secondaryMuscles || []),
    ...(ex.tags || []),
  ]
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .join(" ")
    .toLowerCase();
}

function matchesFilters(ex: CatalogExercise, f: CatalogFilters): boolean {
  if (f.equipment?.length && !f.equipment.includes(ex.equipment)) return false;
  if (f.movement?.length && !f.movement.includes(ex.movementPattern)) return false;
  if (f.difficulty?.length && !f.difficulty.includes(ex.difficulty)) return false;
  if (f.muscle?.length) {
    const muscles = ex.primaryMuscles || [];
    if (!f.muscle.some((m) => muscles.includes(m))) return false;
  }
  return true;
}

/**
 * The single query helper used by Library home, search and filters. Order is the
 * catalogue's own order, so results are stable between renders.
 */
export function queryCatalogue(
  query: string,
  filters: CatalogFilters = EMPTY_FILTERS,
  list: CatalogExercise[] = FULL_CATALOG,
): CatalogExercise[] {
  const q = (query || "").trim().toLowerCase();
  return list.filter((ex) => matchesFilters(ex, filters) && (!q || searchHaystack(ex).includes(q)));
}

// --- facets ----------------------------------------------------------------

function facetsFor(
  pick: (ex: CatalogExercise) => string[],
  order: string[],
  list: CatalogExercise[],
): Facet[] {
  const counts = new Map<string, number>();
  for (const ex of list) for (const v of pick(ex)) if (v) counts.set(v, (counts.get(v) || 0) + 1);
  const ranked = [...counts.keys()].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    return a.localeCompare(b);
  });
  return ranked.map((value) => ({ value, count: counts.get(value) || 0 }));
}

export function equipmentFacets(list: CatalogExercise[] = FULL_CATALOG): Facet[] {
  return facetsFor((ex) => [ex.equipment], EQUIPMENT_ORDER, list);
}

export function movementFacets(list: CatalogExercise[] = FULL_CATALOG): Facet[] {
  return facetsFor((ex) => [ex.movementPattern], MOVEMENT_PATTERN_ORDER, list);
}

export function muscleFacets(list: CatalogExercise[] = FULL_CATALOG): Facet[] {
  return facetsFor((ex) => ex.primaryMuscles || [], [], list);
}

/** Easiest first — the order someone browsing by difficulty expects. */
export const DIFFICULTY_ORDER = ["Beginner", "Intermediate", "Advanced"];

export function difficultyFacets(list: CatalogExercise[] = FULL_CATALOG): Facet[] {
  return facetsFor((ex) => [ex.difficulty], DIFFICULTY_ORDER, list);
}

export function activeFilterCount(f: CatalogFilters): number {
  return (
    (f.equipment?.length || 0) +
    (f.muscle?.length || 0) +
    (f.movement?.length || 0) +
    (f.difficulty?.length || 0)
  );
}

export function toggleFilter(f: CatalogFilters, key: keyof CatalogFilters, value: string): CatalogFilters {
  const current = f[key] || [];
  const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  return { ...f, [key]: next };
}

/**
 * Onboarding equipment buckets → catalogue facets (approved mapping). This may
 * only ever PRE-SELECT filters: it never removes anything from the catalogue.
 */
export const ONBOARDING_EQUIPMENT_MAP: Record<string, string[]> = {
  bb: ["Barbell"],
  db: ["Dumbbell"],
  kb: ["Kettlebell"],
  cable: ["Cable Machine"],
  machine: ["Machine"],
  band: ["Band"],
  pullup: ["Bodyweight"],
};

export function myEquipmentFilters(equip: string[] | undefined): string[] {
  const out = new Set<string>(["Bodyweight"]);
  for (const e of equip || []) for (const facet of ONBOARDING_EQUIPMENT_MAP[e] || []) out.add(facet);
  return [...out];
}

// --- copy (frozen Library copy deck) --------------------------------------

export const searchPlaceholder = (count: number) => `Search ${count} exercises`;
export const resultCountLabel = (n: number, query: string) => `${n} results for “${query}”`;
export const noMatchCopy = (query: string) =>
  `No matches for “${query}”. Try another exercise name, muscle or equipment type.`;
export const applyLabel = (n: number) => `Show ${n} exercises`;
export const filterEmptyCopy = (a: string, b: string) =>
  `No ${a} exercises target ${b} in the Exercise Library. Remove a filter to see more.`;
export const LIBRARY_OFFLINE_COPY =
  "You’re offline. Search and browse still work — the exercise catalogue is stored on your device. Some animations may load when you reconnect.";

/** A generic filter-empty line for combinations we cannot name in two parts. */
export function filterEmptyMessage(f: CatalogFilters): string {
  const equip = f.equipment?.[0];
  const muscle = f.muscle?.[0];
  if (equip && muscle) return filterEmptyCopy(equip, muscle);
  return "No exercises in the Exercise Library match these filters. Remove a filter to see more.";
}
