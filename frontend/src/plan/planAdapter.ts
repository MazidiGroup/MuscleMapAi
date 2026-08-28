// Adapter — normalises the raw output of `exercises.js/buildPlan()` into the
// shape our React screens expect.
//
// The upstream JS returns:
//   { days: [<training days only>], split, goalLabel, tip }
// Each training day: { type, name, blurb, dow, dowIdx, exercises, mins, targets, cooldown }
// Each exercise:     { id, name, img, muscle, region, sets, reps, rest, setsLabel, focus, finisher, posture }
//
// Our UI wants:
//   { answers, seed, splitLabel, splitName, days: [7 items including rest] }
// Where each day has: { dow, rest, type?, typeName?, blurb?, minutes?, exercises?, focusMuscles? }
// And each exercise entry: { id, name, muscle, sets, repsOrTime, rest, badge?, pattern?, compound?, timed? }

import * as raw from "./exercises";
import type { Answers, Plan, PlanDay, PlanExerciseEntry } from "./exercises";

const DOW_ALL: PlanDay["dow"][] = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
];

function badgeOf(rawEx: any): PlanExerciseEntry["badge"] {
  if (rawEx.focus) return "FOCUS";
  if (rawEx.finisher) return "FINISHER";
  if (rawEx.posture) return "POSTURE";
  return undefined;
}

function toEntry(rawEx: any): PlanExerciseEntry {
  // `rawEx.muscle` is already a human label ("Chest", "Biceps"…) coming
  // straight from `exercises.js/entryFor`.
  return {
    id: rawEx.id,
    name: rawEx.name,
    muscle: rawEx.muscle,
    pattern: rawEx.region || "iso",
    compound: false,
    timed: !!rawEx.setsLabel && /sec/.test(rawEx.setsLabel),
    sets: rawEx.sets ?? 3,
    repsOrTime: rawEx.reps ?? "10",
    rest: rawEx.rest ?? "60 sec",
    restSeconds: typeof rawEx.restSeconds === "number" ? rawEx.restSeconds : undefined,
    badge: badgeOf(rawEx),
  };
}

/**
 * Wraps raw.buildPlan and pads the 7-day week (Mon-Sun) with rest cards.
 */
export function buildPlan(answers: Answers, seed: number): Plan {
  const rawPlan = (raw as any).buildPlan(answers, seed) as {
    days: any[]; split: string; goalLabel: string; tip: string; generator: number;
  };

  const trainingByDow: Record<string, any> = {};
  for (const d of rawPlan.days || []) {
    trainingByDow[d.dow] = d;
  }

  const days: PlanDay[] = DOW_ALL.map((dow) => {
    const t = trainingByDow[dow];
    if (!t) {
      return { dow, rest: true };
    }
    const entries = (t.exercises || []).map(toEntry);
    // Focus muscles = unique muscle labels from the day's exercises.
    const seenM = new Set<string>();
    const focusMuscles: any[] = [];
    for (const e of t.exercises || []) {
      const m = e.muscle as string | undefined;
      if (m && !seenM.has(m)) { seenM.add(m); focusMuscles.push(m); }
    }
    return {
      dow,
      rest: false,
      type: t.type,
      typeName: t.name,
      blurb: t.blurb,
      minutes: t.mins ?? 45,
      exercises: entries,
      focusMuscles,
    };
  });

  return {
    answers,
    seed,
    // A stored plan is never rewritten by a new generator; regeneration under a
    // newer version is EXPECTED to differ, and this number is what says so.
    generator: rawPlan.generator ?? 1,
    splitLabel: rawPlan.split || "Custom split",
    splitName: rawPlan.split || "Custom split",
    days,
  };
}

/** Returns the entry for a single exercise, with the given answers, for the swap sheet. */
export function entryFor(id: string, answers: Answers): PlanExerciseEntry {
  const en = (raw as any).entryFor(id, answers, {});
  return toEntry(en);
}

/** Returns candidate alternatives for the swap sheet as our library-exercise shape. */
export function alternativesFor(id: string, answers: Answers, excludeIds: string[]): any[] {
  return (raw as any).alternativesFor(id, answers, excludeIds);
}

export const GOAL_LABEL: Record<string, string> = {
  muscle:   "Build muscle",
  strength: "Get stronger",
  fatloss:  "Lose fat",
  general:  "General fitness",
};

export const REGION_LABEL: Record<string, string> = {
  chest: "Chest",
  shoulders: "Shoulders",
  arms: "Arms",
  back: "Back",
  core: "Core",
  glutes: "Glutes",
  legs: "Legs",
};

// A short human label for each muscle key returned by exercises.js. Also
// mapped through the labels themselves so callers can pass either the raw key
// or an already-humanised label ("Chest") and get a sensible string back.
const _LABEL_MAP: Record<string, string> = {
  chest: "Chest", back: "Back", shoulders: "Shoulders", biceps: "Biceps",
  triceps: "Triceps", forearms: "Forearms", core: "Core", lowback: "Lower Back",
  glutes: "Glutes", quads: "Quads", hams: "Hamstrings", calves: "Calves",
  traps: "Traps", full: "Full Body",
};
export const MUSCLE_LABEL: Record<string, string> = new Proxy(_LABEL_MAP, {
  get: (target, prop: string) => target[prop] ?? prop,
}) as any;
