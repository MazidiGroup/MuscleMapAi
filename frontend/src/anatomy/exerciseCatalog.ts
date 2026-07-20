// Full-library exercise catalog (July 2026 pack, 206 exercises).
//
// This module is the single source of truth for "every exercise we ship".
// It:
//   1. Loads the bundled trimmed metadata JSON (330 KB, 206 records).
//   2. Aliases our 32 legacy exercise IDs to the pack's canonical slugs so
//      existing user data (saved workouts, streaks, coach references) stays
//      intact — same exercise → single card, no duplicates.
//   3. Maps the pack's generic muscle labels ("Chest", "Biceps", …) to the
//      exact GLB node names so muscle highlighting on the anatomy viewer keeps
//      working for exercises that don't have a hand-curated mapping.
//   4. Exposes a merged view: for the 32 curated exercises we keep the
//      hand-authored GLB muscle IDs (they're more precise); for the other 174
//      we derive from the pack's `primaryMuscles`.

import RAW from "./exerciseCatalog.json";
import { LEGACY_EXERCISES, Exercise } from "./legacyExercises";

export type CatalogExercise = {
  id: string;
  name: string;
  category: "Push" | "Pull" | "Legs" | "Core" | "Mobility";
  equipment: string;
  cue: string;
  primary: string[];       // GLB muscle node names
  secondary: string[];
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  movementPattern: string; // "Push" / "Pull" / "Squat" / "Hinge" / "Isolation" / "Core" / …
  primaryMuscles: string[];   // Human-friendly labels from metadata (e.g. "Chest")
  secondaryMuscles: string[];
  tags: string[];
  shortDescription: string;
  instructions: string[];
  commonMistakes: string[];
  benefits: string[];
};

type RawEntry = {
  slug: string;
  name: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string[];
  movementPattern: string[];
  difficulty: string;
  tags: string[];
  shortDescription: string;
  instructions: string[];
  commonMistakes: string[];
  benefits: string[];
};

const CATALOG: RawEntry[] = RAW as RawEntry[];

// ---------------------------------------------------------------------------
// Legacy id -> new pack slug (28 map, 2 legacy-only with no pack equivalent).
// ---------------------------------------------------------------------------
export const LEGACY_ALIAS: Record<string, string | null> = {
  "bench-press":             "barbell-bench-press",
  "incline-db-press":        "dumbbell-incline-bench-press",
  "cable-fly":               "cable-pec-fly",
  "push-up":                 "push-up",
  "dips":                    "parralel-bar-dips",
  "pull-up":                 "pull-ups",
  "lat-pulldown":            "machine-pulldown",
  "barbell-row":             "barbell-bent-over-row",
  "cable-row":               "cable-row-bar-standing-row",
  "face-pull":               "cable-bar-face-pull",
  "deadlift":                "barbell-deadlift",
  "shrug":                   "barbell-shrug",
  "overhead-press":          "barbell-overhead-press",
  "lateral-raise":           "dumbbell-lateral-raise",
  "db-curl":                 "dumbbell-curl",
  "barbell-curl":            "barbell-curl",
  "tricep-pushdown":         "cable-rope-pushdown",
  "cable-external-rotation": null,
  "squat":                   "barbell-squat",
  "leg-press":               "machine-leg-press",
  "leg-extension":           "machine-leg-extension",
  "rdl":                     "kettlebell-romanian-deadlift",
  "leg-curl":                "dumbbell-leg-curl",
  "lunge":                   "lunge-walking",
  "hip-thrust":              "dumbbell-heels-elevated-hip-thrust",
  "standing-calf-raise":     "kettlebell-calf-raise",
  "seated-calf-raise":       null,
  "single-leg-calf-raise":   "dumbbell-single-leg-calf-raise",
  "calf-raise":              "kettlebell-calf-raise",
  "hanging-leg-raise":       "hanging-knee-raises",
  "plank":                   "hand-plank",
  "cable-crunch":            "machine-crunch",
};

// Reverse map: pack slug -> legacy id (so we can prefer the legacy id as the
// canonical id when we know both — keeps every user-saved workout resolving).
const PACK_TO_LEGACY: Record<string, string> = {};
for (const [legacyId, packSlug] of Object.entries(LEGACY_ALIAS)) {
  if (packSlug && !PACK_TO_LEGACY[packSlug]) {
    PACK_TO_LEGACY[packSlug] = legacyId;
  }
}

// ---------------------------------------------------------------------------
// Generic muscle label -> GLB node names.
// Each entry is [primaryMuscleNodes, secondaryMuscleNodes].
// Everything not in this table still shows up in `primaryMuscles`/etc. as text,
// it just won't drive the 3D highlight.
// ---------------------------------------------------------------------------
const MUSCLE_TO_NODES: Record<string, [string[], string[]]> = {
  Chest:       [["Pectoralis_Major_Clavicular_Sternocostal_Abdominal"], ["Pectoralis_Minor", "Serratus_Anterior"]],
  Back:        [["Latissimus_Dorsi"], ["Rhomboideus_Major", "Teres_Major"]],
  Shoulders:   [["Deltoid_Anterior_Middle_Posterior"], ["Supraspinatus", "Infraspinatus", "Subscapularis"]],
  Biceps:      [["Biceps_Brachii"], ["Brachialis", "Brachioradialis"]],
  Triceps:     [["Triceps_Lateral_Long_Heads", "Triceps_Medial_Head"], []],
  Forearms:    [["Brachioradialis"], []],
  Trapezius:   [["Trapezius"], []],
  Core:        [["Rectus_Abdominis", "External_Oblique"], ["Psoas_Major"]],
  Glutes:      [["Gluteus_Maximus"], ["Gluteus_Medius", "Gluteus_Minimus"]],
  Quadriceps:  [["Rectus_Femoris", "Vastus_Lateralis", "Vastus_Medialis"], ["Vastus_Intermedius"]],
  Hamstrings:  [["Biceps_Femoris_Long_Head", "Semitendinosus", "Semimembranosus"], ["Biceps_Femoris_Short_Head"]],
  Calves:      [["Gastrocnemius_Lateral_Medial", "Soleus"], ["Tibialis_Anterior"]],
};

function musclesToNodes(labels: string[], slot: 0 | 1): string[] {
  const out = new Set<string>();
  for (const label of labels) {
    const map = MUSCLE_TO_NODES[label];
    if (!map) continue;
    for (const node of map[slot]) out.add(node);
  }
  return [...out];
}

// ---------------------------------------------------------------------------
// Category derivation (legacy Push/Pull/Legs/Core buckets).
// ---------------------------------------------------------------------------
const MUSCLE_TO_CATEGORY: Record<string, CatalogExercise["category"]> = {
  Chest: "Push",
  Shoulders: "Push",
  Triceps: "Push",
  Back: "Pull",
  Biceps: "Pull",
  Trapezius: "Pull",
  Forearms: "Pull",
  Glutes: "Legs",
  Quadriceps: "Legs",
  Hamstrings: "Legs",
  Calves: "Legs",
  Core: "Core",
};

function deriveCategory(primary: string[], pattern: string[]): CatalogExercise["category"] {
  // Movement pattern wins for stretches / mobility so they don't get dumped into "Push".
  if (pattern.includes("Mobility") || pattern.includes("Stretch")) return "Mobility";
  if (pattern.includes("Core")) return "Core";
  for (const m of primary) {
    if (MUSCLE_TO_CATEGORY[m]) return MUSCLE_TO_CATEGORY[m];
  }
  return "Core";
}

// ---------------------------------------------------------------------------
// Build the merged catalog once at module load.
// ---------------------------------------------------------------------------
const LEGACY_BY_ID: Record<string, Exercise> = {};
for (const e of LEGACY_EXERCISES) LEGACY_BY_ID[e.id] = e;

function normaliseDifficulty(d: string): CatalogExercise["difficulty"] {
  const s = d.trim().toLowerCase();
  if (s.startsWith("adv")) return "Advanced";
  if (s.startsWith("int")) return "Intermediate";
  return "Beginner";
}

function buildEntry(raw: RawEntry): CatalogExercise {
  // Canonical id: prefer the legacy id if we have one so existing user data
  // continues to resolve. Otherwise use the pack slug.
  const id = PACK_TO_LEGACY[raw.slug] || raw.slug;
  const legacy = LEGACY_BY_ID[id];

  // Muscle nodes: legacy hand-curated data wins where present, otherwise
  // derived from generic labels.
  const primaryNodes = legacy ? legacy.primary : musclesToNodes(raw.primaryMuscles, 0);
  const secondaryNodes = legacy ? legacy.secondary : musclesToNodes(raw.primaryMuscles, 1).concat(musclesToNodes(raw.secondaryMuscles, 0));

  return {
    id,
    name: raw.name,
    category: deriveCategory(raw.primaryMuscles, raw.movementPattern),
    equipment: raw.equipment[0] || "Bodyweight",
    cue: raw.shortDescription,
    primary: primaryNodes,
    secondary: [...new Set(secondaryNodes)],
    difficulty: normaliseDifficulty(raw.difficulty),
    movementPattern: raw.movementPattern[0] || "Isolation",
    primaryMuscles: raw.primaryMuscles,
    secondaryMuscles: raw.secondaryMuscles,
    tags: raw.tags,
    shortDescription: raw.shortDescription,
    instructions: raw.instructions,
    commonMistakes: raw.commonMistakes,
    benefits: raw.benefits,
  };
}

export const FULL_CATALOG: CatalogExercise[] = CATALOG.map(buildEntry);

// Also add the 2 legacy exercises that have no pack equivalent
// (cable-external-rotation, seated-calf-raise) so nothing goes missing.
for (const [legacyId, packSlug] of Object.entries(LEGACY_ALIAS)) {
  if (packSlug !== null) continue;
  const legacy = LEGACY_BY_ID[legacyId];
  if (!legacy) continue;
  FULL_CATALOG.push({
    id: legacy.id,
    name: legacy.name,
    category: legacy.category,
    equipment: legacy.equipment,
    cue: legacy.cue,
    primary: legacy.primary,
    secondary: legacy.secondary,
    difficulty: "Beginner",
    movementPattern: "Isolation",
    primaryMuscles: [],
    secondaryMuscles: [],
    tags: [],
    shortDescription: legacy.cue,
    instructions: [],
    commonMistakes: [],
    benefits: [],
  });
}

const BY_ID: Record<string, CatalogExercise> = {};
for (const e of FULL_CATALOG) BY_ID[e.id] = e;
// Also index by pack slug so any legacy/new id resolves.
for (const [legacyId, packSlug] of Object.entries(LEGACY_ALIAS)) {
  if (packSlug && BY_ID[legacyId] && !BY_ID[packSlug]) BY_ID[packSlug] = BY_ID[legacyId];
}

/** Resolve any id (legacy or pack slug) to the canonical catalog entry. */
export function getCatalogExercise(id: string): CatalogExercise | undefined {
  return BY_ID[id] || BY_ID[LEGACY_ALIAS[id] || id];
}

export const CATALOG_COUNT = FULL_CATALOG.length;

// Facets for filter chip strips
export const DIFFICULTY_ORDER: CatalogExercise["difficulty"][] = ["Beginner", "Intermediate", "Advanced"];
export const EQUIPMENT_ORDER = [
  "Bodyweight",
  "Barbell",
  "Dumbbell",
  "Kettlebell",
  "Cable Machine",
  "Machine",
  "Band",
];
export const MOVEMENT_PATTERN_ORDER = [
  "Push",
  "Pull",
  "Squat",
  "Hinge",
  "Lunge",
  "Rotation",
  "Isolation",
  "Core",
  "Plyometric",
  "Mobility",
  "Stretch",
  "Hip Abduction",
  "Carry",
];
