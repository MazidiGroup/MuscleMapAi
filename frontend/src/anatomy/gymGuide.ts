// Practical gym-coaching data layered on top of the anatomy database.
// Grouped by gym muscle group (see groups.ts GYM_GROUPS) to stay accurate without bloating per-muscle.

export type RepRanges = { strength: string; hypertrophy: string; endurance: string };
export type GymGuide = {
  purpose: string;
  frequency: string;
  recovery: string;
  weeklyVolume: string;
  repRanges: RepRanges;
  mistakes: string[];
  tips: string[];
};

const REPS: RepRanges = { strength: "4–6 reps", hypertrophy: "8–12 reps", endurance: "12–20 reps" };

export const GROUP_GUIDE: Record<string, GymGuide> = {
  chest: {
    purpose: "Responsible for pressing strength and chest development.",
    frequency: "2 sessions / week",
    recovery: "48–72 hours",
    weeklyVolume: "12–20 sets",
    repRanges: REPS,
    mistakes: [
      "Flaring the elbows out excessively",
      "Bouncing the bar off the chest",
      "Cutting the range of motion short",
      "Using too much weight and losing form",
      "Not controlling the lowering (eccentric) phase",
    ],
    tips: [
      "Retract and pin your shoulder blades back",
      "Control the lowering phase for 2–3 seconds",
      "Use a full range of motion",
      "Squeeze the chest hard at the top",
    ],
  },
  back: {
    purpose: "Builds pulling strength, a wide back and healthy posture.",
    frequency: "2–3 sessions / week",
    recovery: "48–72 hours",
    weeklyVolume: "14–22 sets",
    repRanges: REPS,
    mistakes: [
      "Yanking with the lower back instead of the lats",
      "Using momentum / excessive swinging",
      "Not retracting the shoulder blades",
      "Pulling with the arms instead of the back",
      "Shrugging the traps on every rep",
    ],
    tips: [
      "Initiate the pull by depressing the shoulder blades",
      "Drive the elbows down and back",
      "Pause and squeeze at peak contraction",
      "Think 'pull with the elbows, not the hands'",
    ],
  },
  shoulders: {
    purpose: "Drives overhead strength and builds capped, round delts.",
    frequency: "2–3 sessions / week",
    recovery: "24–48 hours",
    weeklyVolume: "12–20 sets",
    repRanges: REPS,
    mistakes: [
      "Using too much weight on raises and swinging",
      "Pressing with a flared, unstable elbow path",
      "Neglecting the rear delts",
      "Shrugging the traps during lateral raises",
    ],
    tips: [
      "Lead lateral raises with the elbows",
      "Keep the core braced and ribs down when pressing",
      "Train all three heads (front, side, rear)",
      "Control the negative on every rep",
    ],
  },
  arms: {
    purpose: "Powers elbow flexion and extension for bigger, stronger arms.",
    frequency: "2–3 sessions / week",
    recovery: "24–48 hours",
    weeklyVolume: "10–16 sets",
    repRanges: REPS,
    mistakes: [
      "Swinging the torso to move the weight",
      "Letting the elbows drift forward",
      "Half-repping and missing the stretch",
      "Going too heavy and losing the mind-muscle link",
    ],
    tips: [
      "Keep the elbows pinned to your sides",
      "Get a full stretch at the bottom",
      "Squeeze hard at peak contraction",
      "Slow, controlled negatives build the most size",
    ],
  },
  forearms: {
    purpose: "Develops grip strength and forearm size.",
    frequency: "2–4 sessions / week",
    recovery: "24 hours",
    weeklyVolume: "8–14 sets",
    repRanges: REPS,
    mistakes: ["Rushing the reps", "Limited range of motion", "Only training one direction (flexion)"],
    tips: ["Train both flexion and extension", "Use a full wrist range", "High reps work well for forearms"],
  },
  core: {
    purpose: "Stabilises the spine and transfers force between upper and lower body.",
    frequency: "2–4 sessions / week",
    recovery: "24 hours",
    weeklyVolume: "10–16 sets",
    repRanges: REPS,
    mistakes: [
      "Pulling on the neck during crunches",
      "Using hip flexors instead of the abs",
      "Holding the breath instead of bracing",
      "Only doing flexion (ignoring anti-rotation)",
    ],
    tips: [
      "Exhale and curl the spine, don't just hinge",
      "Brace as if about to be punched",
      "Add anti-rotation and anti-extension work",
      "Control the eccentric on leg raises",
    ],
  },
  glutes: {
    purpose: "Generates hip-extension power and athletic strength.",
    frequency: "2–3 sessions / week",
    recovery: "48–72 hours",
    weeklyVolume: "12–20 sets",
    repRanges: REPS,
    mistakes: [
      "Overarching the lower back on thrusts",
      "Not reaching full hip lockout",
      "Letting the knees cave inward",
      "Quad-dominant squatting with no hip drive",
    ],
    tips: [
      "Tuck the chin and ribs on hip thrusts",
      "Squeeze the glutes hard at lockout",
      "Push the knees out, not in",
      "Drive through the heels",
    ],
  },
  quads: {
    purpose: "Provides knee-extension strength and overall leg size.",
    frequency: "2 sessions / week",
    recovery: "48–72 hours",
    weeklyVolume: "12–18 sets",
    repRanges: REPS,
    mistakes: [
      "Knees caving inward under load",
      "Cutting squat depth short",
      "Heels rising off the floor",
      "Bouncing out of the bottom",
    ],
    tips: ["Hit at least parallel depth", "Track the knees over the toes", "Stay braced and upright", "Control the descent"],
  },
  hamstrings: {
    purpose: "Powers the hip hinge and knee flexion.",
    frequency: "2 sessions / week",
    recovery: "48–72 hours",
    weeklyVolume: "10–16 sets",
    repRanges: REPS,
    mistakes: [
      "Rounding the lower back on hinges",
      "Bending the knees too much on RDLs",
      "Using momentum on leg curls",
      "Not feeling the stretch",
    ],
    tips: ["Hinge from the hips with soft knees", "Keep the bar close to the body", "Feel the stretch, then drive the hips", "Pause at peak contraction on curls"],
  },
  adductors: {
    purpose: "Builds inner-thigh strength and hip stability.",
    frequency: "2 sessions / week",
    recovery: "48 hours",
    weeklyVolume: "8–12 sets",
    repRanges: REPS,
    mistakes: ["Using too much range too soon", "Rushing the reps", "Ignoring them entirely"],
    tips: ["Control the stretch", "Wide-stance squats hit them well", "Progress range gradually"],
  },
  calves: {
    purpose: "Delivers ankle power and calf development.",
    frequency: "3–4 sessions / week",
    recovery: "24–48 hours",
    weeklyVolume: "12–20 sets",
    repRanges: REPS,
    mistakes: [
      "Bouncing through reps with no control",
      "Partial range (no full stretch)",
      "Going too fast",
      "Only training standing (ignoring the soleus)",
    ],
    tips: ["Get a deep stretch at the bottom", "Pause at the top and bottom", "Train both straight- and bent-knee", "Higher reps work well"],
  },
};

// Short beginner-friendly one-liners for the headline muscles (fallback = the muscle's `fn`).
export const MUSCLE_SUMMARY: Record<string, string> = {
  Pectoralis_Major_Clavicular_Sternocostal_Abdominal:
    "The primary chest muscle responsible for pushing movements and building upper-body strength.",
  Latissimus_Dorsi: "The big back muscle that drives every pulling movement and creates a wide, V-taper back.",
  Deltoid_Anterior_Middle_Posterior: "The cap of the shoulder that lifts the arm in every direction.",
  Biceps_Brachii: "The front-of-arm muscle that bends the elbow and shows off in a flex.",
  Triceps_Lateral_Long_Heads: "The back-of-arm muscle that straightens the elbow and makes up most of your arm size.",
  Gluteus_Maximus: "The body's most powerful muscle — it drives hip extension in squats, jumps and sprints.",
  Rectus_Femoris: "A key quad that straightens the knee and helps lift the thigh.",
  Vastus_Lateralis: "The largest quad — the outer sweep that straightens the knee.",
  Biceps_Femoris_Long_Head: "A main hamstring that bends the knee and extends the hip.",
  Rectus_Abdominis: "The 'six-pack' muscle that flexes the trunk and braces your core.",
  Gastrocnemius_Lateral_Medial: "The diamond-shaped calf that powers every push-off and jump.",
  Trapezius: "The big upper-back muscle that moves and stabilises the shoulder blades.",
};

export type ExerciseMeta = { difficulty: "Beginner" | "Intermediate" | "Advanced"; rating: number; icon: string };

export const EXERCISE_META: Record<string, ExerciseMeta> = {
  "bench-press": { difficulty: "Intermediate", rating: 5, icon: "barbell-outline" },
  "incline-db-press": { difficulty: "Intermediate", rating: 4, icon: "barbell-outline" },
  "cable-fly": { difficulty: "Beginner", rating: 4, icon: "git-merge-outline" },
  "push-up": { difficulty: "Beginner", rating: 4, icon: "body-outline" },
  dips: { difficulty: "Advanced", rating: 4, icon: "body-outline" },
  "overhead-press": { difficulty: "Intermediate", rating: 5, icon: "barbell-outline" },
  "lateral-raise": { difficulty: "Beginner", rating: 5, icon: "fitness-outline" },
  "tricep-pushdown": { difficulty: "Beginner", rating: 4, icon: "git-merge-outline" },
  "pull-up": { difficulty: "Advanced", rating: 5, icon: "body-outline" },
  "lat-pulldown": { difficulty: "Beginner", rating: 4, icon: "git-merge-outline" },
  "barbell-row": { difficulty: "Intermediate", rating: 5, icon: "barbell-outline" },
  "cable-row": { difficulty: "Beginner", rating: 4, icon: "git-merge-outline" },
  "face-pull": { difficulty: "Beginner", rating: 5, icon: "git-merge-outline" },
  "db-curl": { difficulty: "Beginner", rating: 4, icon: "fitness-outline" },
  "barbell-curl": { difficulty: "Beginner", rating: 4, icon: "barbell-outline" },
  deadlift: { difficulty: "Advanced", rating: 5, icon: "barbell-outline" },
  shrug: { difficulty: "Beginner", rating: 3, icon: "barbell-outline" },
  "cable-external-rotation": { difficulty: "Beginner", rating: 3, icon: "git-merge-outline" },
  squat: { difficulty: "Intermediate", rating: 5, icon: "barbell-outline" },
  "leg-press": { difficulty: "Beginner", rating: 4, icon: "albums-outline" },
  "leg-extension": { difficulty: "Beginner", rating: 3, icon: "albums-outline" },
  rdl: { difficulty: "Intermediate", rating: 5, icon: "barbell-outline" },
  "leg-curl": { difficulty: "Beginner", rating: 4, icon: "albums-outline" },
  "hip-thrust": { difficulty: "Intermediate", rating: 5, icon: "barbell-outline" },
  lunge: { difficulty: "Beginner", rating: 4, icon: "walk-outline" },
  "standing-calf-raise": { difficulty: "Beginner", rating: 4, icon: "albums-outline" },
  "seated-calf-raise": { difficulty: "Beginner", rating: 4, icon: "albums-outline" },
  "calf-raise": { difficulty: "Beginner", rating: 3, icon: "body-outline" },
  "single-leg-calf-raise": { difficulty: "Beginner", rating: 3, icon: "body-outline" },
  "cable-crunch": { difficulty: "Beginner", rating: 4, icon: "git-merge-outline" },
  "hanging-leg-raise": { difficulty: "Advanced", rating: 5, icon: "body-outline" },
  plank: { difficulty: "Beginner", rating: 4, icon: "body-outline" },
};

export function getGuide(groupKey?: string): GymGuide | null {
  if (!groupKey) return null;
  return GROUP_GUIDE[groupKey] || null;
}

export function getExerciseMeta(id: string): ExerciseMeta {
  return EXERCISE_META[id] || { difficulty: "Beginner", rating: 4, icon: "barbell-outline" };
}
