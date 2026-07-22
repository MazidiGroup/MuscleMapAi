// Plan store — holds the onboarding answers, the generated weekly Plan,
// which exercises the user has ticked as done, and the deterministic seed
// used for shuffling.
//
// Persisted via our storage shim so re-opens restore the user right back
// where they were (onboarding step or their built plan).

import { create } from "zustand";

import { storage } from "@/src/utils/storage";

import { Answers, Plan } from "./exercises";
import { buildPlan } from "./planAdapter";

const KEY_PLAN = "mma.plan.v1";
const KEY_ANSWERS = "mma.plan.answers.v1";
const KEY_SEED = "mma.plan.seed.v1";
const KEY_STEP = "mma.plan.onboardingStep.v1"; // 0 = welcome, 1..6 = onboarding, 7 = building
const KEY_COMPLETIONS = "mma.plan.completions.v1"; // { "YYYY-MM-DD:exId": true }

type CompletionsMap = Record<string, boolean>;

type PlanStore = {
  hydrated: boolean;
  step: number;               // 0 welcome → 1-6 onboarding → 7 building → 100 plan ready
  answers: Partial<Answers>;
  plan: Plan | null;
  seed: number;
  completions: CompletionsMap;

  hydrate: () => Promise<void>;
  setStep: (n: number) => void;
  setAnswers: (patch: Partial<Answers>) => void;
  reshuffle: () => void;
  rebuildFromAnswers: (final: Answers) => void;
  resetAll: () => void;
  toggleCompletion: (dateISO: string, exId: string, done: boolean) => void;
  isCompleted: (dateISO: string, exId: string) => boolean;
};

const persist = (partial: Record<string, unknown>) => {
  for (const [k, v] of Object.entries(partial)) {
    storage.setItem(k, v).catch(() => {});
  }
};

export const usePlanStore = create<PlanStore>((set, get) => ({
  hydrated: false,
  step: 0,
  answers: {},
  plan: null,
  seed: 0,
  completions: {},

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const [plan, answers, seed, step, completions] = await Promise.all([
        storage.getItem<Plan | null>(KEY_PLAN, null),
        storage.getItem<Partial<Answers>>(KEY_ANSWERS, {}),
        storage.getItem<number>(KEY_SEED, 0),
        storage.getItem<number>(KEY_STEP, 0),
        storage.getItem<CompletionsMap>(KEY_COMPLETIONS, {}),
      ]);
      set({
        hydrated: true,
        plan: plan || null,
        answers: answers || {},
        seed: seed || 0,
        step: plan ? 100 : step || 0,
        completions: completions || {},
      });
    } catch {
      set({ hydrated: true });
    }
  },

  setStep: (n) => {
    set({ step: n });
    persist({ [KEY_STEP]: n });
  },

  setAnswers: (patch) => {
    const next = { ...get().answers, ...patch };
    set({ answers: next });
    persist({ [KEY_ANSWERS]: next });
  },

  reshuffle: () => {
    const ans = get().answers as Answers;
    if (!ans.goal) return;
    const seed = Math.floor(Math.random() * 2_147_483_647);
    const plan = buildPlan(ans, seed);
    set({ plan, seed });
    persist({ [KEY_PLAN]: plan, [KEY_SEED]: seed });
  },

  rebuildFromAnswers: (final) => {
    const seed = Math.floor(Math.random() * 2_147_483_647);
    const plan = buildPlan(final, seed);
    set({ plan, seed, answers: final, step: 100 });
    persist({
      [KEY_PLAN]: plan,
      [KEY_SEED]: seed,
      [KEY_ANSWERS]: final,
      [KEY_STEP]: 100,
    });
  },

  resetAll: () => {
    set({ step: 0, answers: {}, plan: null, seed: 0, completions: {} });
    for (const k of [KEY_PLAN, KEY_ANSWERS, KEY_SEED, KEY_STEP, KEY_COMPLETIONS]) {
      storage.removeItem(k).catch(() => {});
    }
  },

  toggleCompletion: (dateISO, exId, done) => {
    const key = `${dateISO}:${exId}`;
    const next = { ...get().completions };
    if (done) next[key] = true;
    else delete next[key];
    set({ completions: next });
    persist({ [KEY_COMPLETIONS]: next });
  },

  isCompleted: (dateISO, exId) => {
    return !!get().completions[`${dateISO}:${exId}`];
  },
}));

/** Today's ISO date (YYYY-MM-DD, local time). */
export function todayISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
