// Anatomy grouping + hierarchy mapping for the Ecorche model.
// Node names below match exactly the named objects inside ecorche.glb.

export type ExplorerNode = {
  key: string;
  label: string;
  // container node name in the GLB whose descendants make up this category
  container: string;
  icon: string; // ionicons name
};

export type ExplorerSection = {
  key: string;
  label: string;
  container: string; // top container (Bones / Muscles)
  system: "skeletal" | "muscular";
  children: ExplorerNode[];
};

export const EXPLORER: ExplorerSection[] = [
  {
    key: "skeletal",
    label: "Skeletal System",
    container: "Bones",
    system: "skeletal",
    children: [
      { key: "skull", label: "Skull & Jaw", container: "Bones_Head", icon: "skull-outline" },
      { key: "spine", label: "Spine", container: "Bones_Spine", icon: "git-commit-outline" },
      { key: "ribcage", label: "Ribcage", container: "Bones_Ribcage", icon: "grid-outline" },
      { key: "pelvis", label: "Pelvis", container: "Bones_Hip", icon: "ellipse-outline" },
      { key: "arms_b", label: "Arms & Hands", container: "Bones_Arm", icon: "hand-left-outline" },
      { key: "legs_b", label: "Legs & Feet", container: "Bones_Leg", icon: "walk-outline" },
    ],
  },
  {
    key: "muscular",
    label: "Muscular System",
    container: "Muscles",
    system: "muscular",
    children: [
      { key: "head_m", label: "Head & Face", container: "Muscles_Head", icon: "happy-outline" },
      { key: "torso_m", label: "Chest, Back & Core", container: "Muscles_Torso", icon: "body-outline" },
      { key: "upperarm_m", label: "Shoulders & Upper Arm", container: "Muscles_Arm_Upper", icon: "barbell-outline" },
      { key: "forearm_m", label: "Forearm", container: "Muscles_Arm_Lower", icon: "fitness-outline" },
      { key: "thigh_m", label: "Thighs, Hips & Glutes", container: "Muscles_Leg_Upper", icon: "man-outline" },
      { key: "calf_m", label: "Lower Leg & Calf", container: "Muscles_Leg_Lower", icon: "walk-outline" },
    ],
  },
];

// Gym-focused muscle groups -> exact GLB node names. Used in Workout Mode & Muscle Info.
export const GYM_GROUPS: Record<string, { label: string; nodes: string[] }> = {
  chest: {
    label: "Chest",
    nodes: ["Pectoralis_Major_Clavicular_Sternocostal_Abdominal", "Pectoralis_Minor", "Serratus_Anterior"],
  },
  back: {
    label: "Back",
    nodes: [
      "Latissimus_Dorsi",
      "Trapezius",
      "Rhomboideus_Major",
      "Rhomboideus_Minor",
      "Teres_Major",
      "Iliocostalis_Lumborum",
      "Longissimus_Thoracis",
      "Spinalis_Thoracis",
    ],
  },
  shoulders: {
    label: "Shoulders",
    nodes: [
      "Deltoid_Anterior_Middle_Posterior",
      "Supraspinatus",
      "Infraspinatus",
      "Teres_Minor",
      "Subscapularis",
    ],
  },
  arms: {
    label: "Arms",
    nodes: ["Biceps_Brachii", "Brachialis", "Corabrachialis", "Triceps_Lateral_Long_Heads", "Triceps_Medial_Head", "Anconeus"],
  },
  forearms: {
    label: "Forearms",
    nodes: [
      "Brachioradialis",
      "Flexor_Carpi_Radialis",
      "Flexor_Carpi_Ulnaris",
      "Flexor_Digitorum_Superficialis",
      "Extensor_Digitorum",
      "Extensor_Carpi_Radialis_Longus",
      "Pronator_Teres",
    ],
  },
  core: {
    label: "Core",
    nodes: ["Rectus_Abdominis", "External_Oblique", "Psoas_Major"],
  },
  glutes: {
    label: "Glutes",
    nodes: ["Gluteus_Maximus", "Gluteus_Medius", "Gluteus_Minimus"],
  },
  quads: {
    label: "Quads",
    nodes: ["Rectus_Femoris", "Vastus_Lateralis", "Vastus_Medialis", "Vastus_Intermedius"],
  },
  hamstrings: {
    label: "Hamstrings",
    nodes: ["Biceps_Femoris_Long_Head", "Biceps_Femoris_Short_Head", "Semitendinosus", "Semimembranosus"],
  },
  adductors: {
    label: "Adductors",
    nodes: ["Adductor_Magnus", "Adductor_Longus", "Adductor_Brevis", "Gracilis", "Pectineus"],
  },
  calves: {
    label: "Calves",
    nodes: ["Gastrocnemius_Lateral_Medial", "Soleus"],
  },
};

export const GYM_GROUP_ORDER = [
  "chest",
  "back",
  "shoulders",
  "arms",
  "forearms",
  "core",
  "glutes",
  "quads",
  "hamstrings",
  "adductors",
  "calves",
];

// Turn a raw GLB node name into a readable label, e.g. "Biceps_Femoris_Long_Head" -> "Biceps Femoris (Long Head)".
export function prettyName(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\bAnterior Middle Posterior\b/, "(All Heads)")
    .replace(/\bClavicular Sternocostal Abdominal\b/, "")
    .replace(/\bLateral Long Heads\b/, "(Lateral & Long Head)")
    .replace(/\bMedial Head\b/, "(Medial Head)")
    .replace(/\bLong Head\b/, "(Long Head)")
    .replace(/\bShort Head\b/, "(Short Head)")
    .trim();
}
