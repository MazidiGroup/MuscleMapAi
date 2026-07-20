// Search aliases so common gym slang finds the right exercise or muscle.
import { Exercise } from "./exercises";
import { getMuscleInfo } from "./muscleData";

export const EXERCISE_ALIASES: Record<string, string[]> = {
  "bench-press": ["flat bench", "bb bench", "chest press"],
  "incline-db-press": ["incline press", "upper chest press"],
  "cable-fly": ["pec fly", "chest fly", "cable crossover"],
  "push-up": ["pushup", "press up"],
  dips: ["chest dip", "parallel bar dip"],
  "overhead-press": ["ohp", "shoulder press", "military press"],
  "lateral-raise": ["side raise", "lat raise", "side delt raise"],
  "tricep-pushdown": ["rope pushdown", "cable pushdown", "triceps extension"],
  "pull-up": ["pullup", "chin up"],
  "lat-pulldown": ["pulldown"],
  "barbell-row": ["bent over row", "bb row"],
  "cable-row": ["seated row", "low row"],
  "face-pull": ["rear delt pull"],
  "db-curl": ["dumbbell curl", "bicep curl"],
  "barbell-curl": ["bb curl", "bicep curl"],
  deadlift: ["dl", "conventional deadlift"],
  shrug: ["trap shrug"],
  "cable-external-rotation": ["rotator cuff", "external rotation", "cuban rotation"],
  squat: ["back squat", "barbell squat"],
  "leg-press": ["machine leg press"],
  "leg-extension": ["quad extension"],
  rdl: ["romanian deadlift", "stiff leg deadlift"],
  "leg-curl": ["hamstring curl"],
  "hip-thrust": ["glute bridge", "glute thrust"],
  lunge: ["walking lunge", "split squat"],
  "standing-calf-raise": ["calf press"],
  "seated-calf-raise": ["soleus raise"],
  "calf-raise": ["heel raise"],
  "single-leg-calf-raise": ["one leg calf raise", "unilateral calf raise"],
  "cable-crunch": ["kneeling crunch", "ab crunch"],
  "hanging-leg-raise": ["leg lift", "hanging knee raise"],
  plank: ["front plank"],
};

export const MUSCLE_ALIASES: Record<string, string[]> = {
  Pectoralis_Major_Clavicular_Sternocostal_Abdominal: ["pecs", "chest"],
  Latissimus_Dorsi: ["lats"],
  Deltoid_Anterior_Middle_Posterior: ["delts", "shoulders"],
  Trapezius: ["traps"],
  Biceps_Brachii: ["biceps", "bis"],
  Triceps_Lateral_Long_Heads: ["triceps", "tris"],
  Triceps_Medial_Head: ["triceps", "tris"],
  Rectus_Abdominis: ["abs", "six pack"],
  External_Oblique: ["obliques"],
  Gluteus_Maximus: ["glutes"],
  Gluteus_Medius: ["glutes"],
  Rectus_Femoris: ["quads"],
  Vastus_Lateralis: ["quads"],
  Vastus_Medialis: ["quads", "teardrop"],
  Biceps_Femoris_Long_Head: ["hamstrings", "hammies"],
  Semitendinosus: ["hamstrings"],
  Gastrocnemius_Lateral_Medial: ["calves"],
  Soleus: ["calves"],
  Brachioradialis: ["forearms"],
  Rhomboideus_Major: ["rhomboids", "upper back"],
};

/** True if the exercise matches the (lowercase) query by name, equipment, movement, muscles, tags, or alias. */
export function exerciseMatches(ex: Exercise, q: string): boolean {
  if (!q) return true;
  const hay = [
    ex.name,
    ex.equipment,
    ex.category,
    ex.movementPattern,
    ...(ex.primaryMuscles || []),
    ...(ex.secondaryMuscles || []),
    ...(ex.tags || []),
    ...(EXERCISE_ALIASES[ex.id] || []),
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

/** True if a muscle node has a gym-slang alias matching the (lowercase) query. */
export function muscleAliasMatches(node: string, q: string): boolean {
  const aliases = MUSCLE_ALIASES[node];
  return !!aliases && aliases.some((a) => a.includes(q) || q.includes(a));
}

/** The gym muscle group an exercise belongs to (from its first mapped primary muscle). */
export function exerciseGroup(ex: Exercise): string {
  for (const m of ex.primary) {
    const g = getMuscleInfo(m)?.group;
    if (g) return g;
  }
  return "other";
}
