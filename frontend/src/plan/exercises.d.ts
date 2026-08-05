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
  | "db" | "bb" | "kb" | "band" | "cable" | "machine" | "pullup" | "bw";
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

export type LibraryExercise = {
  id: string;
  muscle: MuscleKey;
  equipment: Equipment;
  pattern: string;
  level: number;
  compound: boolean;
  timed: boolean;
  name: string;
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
export function entryFor(id: string, answers: Answers, opts?: { badge?: string }): PlanExerciseEntry;
export function alternativesFor(id: string, answers: Answers, excludeIds: string[]): LibraryExercise[];
