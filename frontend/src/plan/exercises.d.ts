// Type shim for the plain-JS plan generator we ship straight from the design
// hand-off bundle (`src/plan/exercises.js`). Keeping the JS untouched preserves
// upstream parity — this .d.ts only declares the exports so TS callers get
// autocompletion and safety at call sites.

export type Goal = "muscle" | "strength" | "fatloss" | "general";
export type Experience = "beginner" | "intermediate" | "advanced";
export type Region = "chest" | "shoulders" | "arms" | "back" | "core" | "glutes" | "legs";
export type MuscleKey =
  | "chest" | "back" | "shoulders" | "biceps" | "triceps" | "forearms"
  | "core" | "lowback" | "glutes" | "quads" | "hams" | "calves" | "traps" | "full";
export type Equipment =
  | "db" | "bb" | "kb" | "band" | "cable" | "machine" | "pullup" | "dip" | "bw";
export type Answers = {
  goal: Goal;
  exp: Experience;
  days: number[];         // 0=Mon … 6=Sun
  equip: Equipment[];
  focus: Region[];        // max 3
  posture: boolean;
  /** Advanced Lifter Mode: muscle-group specialisation split, needs 5+ training days. */
  advanced?: boolean;
};

/**
 * One row of `EXERCISES` AS IT EXISTS AT RUNTIME: the rows are parsed straight
 * out of the compact `DB` string and carry COMPACT keys (`m`, `eq`, `pat`,
 * `c`, `t`) — never the normalised spellings. The normalised names are
 * declared as optional `undefined` so `row.muscle ?? row.m` reads typecheck,
 * and so nobody can silently treat a raw row as a normalised entry again.
 * Normalised shapes come only from `planAdapter.entryFor`.
 */
export type LibraryExercise = {
  id: string;
  name: string;
  m: MuscleKey;
  eq: Equipment;
  pat: string;
  level: number;
  c: boolean;
  t: boolean;
  muscle?: undefined;
  equipment?: undefined;
  pattern?: undefined;
  compound?: undefined;
  timed?: undefined;
};

/** What `exercises.js/entryFor` actually returns — `muscle` is a HUMAN LABEL
 *  ("Chest"), not a MuscleKey. `planAdapter.toEntry` converts this to
 *  `PlanExerciseEntry`; call sites should go through `planAdapter.entryFor`. */
export type RawPlanEntry = {
  id: string;
  name: string;
  img: string;
  muscle: string;
  region: Region | null;
  sets: number;
  reps: string;
  rest: string;
  restSeconds: number;
  setsLabel: string;
  focus: boolean;
  finisher: boolean;
  posture: boolean;
};

export type PlanExerciseEntry = {
  id: string;
  name: string;
  muscle: MuscleKey;
  pattern: string;
  compound: boolean;
  timed: boolean;
  sets: number;
  repsOrTime: string;
  rest: string;
  /** The rest prescription as seconds the session timer can run. */
  restSeconds?: number;
  badge?: "FOCUS" | "FINISHER" | "POSTURE";
};

export type PlanDay = {
  dow: string;             // "Monday" …
  rest: boolean;
  type?: string;           // "full" | "push" | "pull" | "legs" | "upper" | "lower"
  typeName?: string;       // "Full Body"
  blurb?: string;
  minutes?: number;
  exercises?: PlanExerciseEntry[];
  focusMuscles?: MuscleKey[];
};

export type Plan = {
  answers: Answers;
  seed: number;
  /** Generator version that produced this plan. Absent/1 = the pre-level generator. */
  generator?: number;
  splitLabel: string;
  splitName: string;
  days: PlanDay[];         // length 7 (Mon–Sun)
};

export const EXERCISES: LibraryExercise[];
export const MUSCLE_LABEL: Record<MuscleKey, string>;
export const REGION: Record<MuscleKey, Region | null>;
export const REGION_LABEL: Record<Region, string>;
export const GOAL_LABEL: Record<Goal, string>;
export const SPLIT_LABEL: Record<number, string>;
/** Advanced Lifter Mode requires at least this many training days. */
export const ADVANCED_MIN_DAYS: number;
export const PROGRESS_TIP: Record<Goal, string>;
export const posterUrl: (id: string) => string;
export function buildPlan(answers: Answers, seed: number): Plan;
export function entryFor(id: string, answers: Answers, opts?: { focus?: boolean; finisher?: boolean; posture?: boolean }): RawPlanEntry;
/** Returns up to 6 candidates; `muscle` here is a human label, like RawPlanEntry's. */
export function alternativesFor(
  id: string,
  answers: Answers,
  excludeIds: string[],
): { id: string; name: string; img: string; muscle: string }[];
