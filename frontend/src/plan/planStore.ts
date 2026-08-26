// Plan store — onboarding answers, the generated weekly Plan, per-day exercise
// ticks and the deterministic shuffle seed.
//
// Persistence is OWNER-SCOPED. This store never touches a legacy `mma.plan.*`
// key: those are read-only sources owned by the migration subsystem. Reads only
// happen once an owner is resolved (the scope is bound by `ScopeBridge`), and
// every write captures the owner token so an account switch cannot publish into
// the wrong namespace or delete an existing value.

import { create } from "zustand";

import { Domain } from "@/src/owner/scopeKeys";
import { OwnerToken, ScopedStore } from "@/src/owner/scopedStore";

import { AdjustOutcome, previewAdjustedPlan } from "./adjustPlan";
import { Answers, Plan } from "./exercises";
// planAdapter's entryFor, not the raw library's: the raw one returns the
// compact row shape (m/eq), and a day must only ever hold normalised entries.
import { entryFor } from "./planAdapter";
import { normalizeAnswers } from "./onboarding";
import { buildPlan } from "./planAdapter";

const newSeed = () => Math.floor(Math.random() * 2_147_483_647);

type CompletionsMap = Record<string, boolean>;

const PLAN_DOMAINS: Domain[] = ["plan", "planAnswers", "planSwaps", "planSeed", "onboardingStep", "planCompletions"];

/** Bound by `ScopeBridge` whenever the resolved owner changes. */
type Scope = { store: ScopedStore; token: OwnerToken } | null;
let scope: Scope = null;

export function setPlanScope(next: Scope) {
  scope = next;
}

export function getPlanScope(): Scope {
  return scope;
}

/** Identity of a bound scope, used to prove hydrated state belongs to this owner. */
export function scopeKeyOf(token: OwnerToken | null | undefined): string | null {
  return token ? `${token.kind}:${token.id}:${token.generation}` : null;
}

type PlanStore = {
  hydrated: boolean;
  /** Owner the current state belongs to; null until this owner has hydrated. */
  ownerKey: string | null;
  step: number;               // 0 welcome → 1-6 onboarding → 7 building → 100 plan ready
  answers: Partial<Answers>;
  plan: Plan | null;
  seed: number;
  completions: CompletionsMap;
  /**
   * Exercise swaps for this program: planned exercise id → the id the user chose
   * instead. Applied to every occurrence of that exercise in the weekly schedule,
   * so a swap sticks across restarts and across a schedule adjust. Generating a
   * brand new program from the answers clears them (see rebuildFromAnswers).
   */
  swaps: Record<string, string>;

  hydrate: () => Promise<void>;
  /** Drops every hydrated value so a previous owner's data can never be shown. */
  resetForOwner: () => void;
  setStep: (n: number) => void;
  setAnswers: (patch: Partial<Answers>) => void;
  /** Computes a verified replacement week. Publishes nothing. */
  previewAdjust: (hasActiveWorkout: boolean) => AdjustOutcome;
  /** Publishes an already-verified replacement. The old plan survives a failure. */
  publishAdjusted: (plan: Plan) => Promise<boolean>;
  /** Records or updates one swap. Swapping back to the original removes the entry. */
  setSwap: (plannedId: string, replacementId: string) => void;
  /** Removes one exercise from one day of the plan, permanently. */
  removeDayExercise: (dayIndex: number, plannedId: string) => void;
  /** Appends one exercise to one day of the plan. */
  addDayExercise: (dayIndex: number, exerciseId: string) => void;
  rebuildFromAnswers: (final: Answers) => void;
  resetAll: () => void;
  toggleCompletion: (dateISO: string, exId: string, done: boolean) => void;
  isCompleted: (dateISO: string, exId: string) => boolean;
};

const EMPTY = { step: 0, answers: {}, plan: null, seed: 0, completions: {}, swaps: {}, ownerKey: null } as const;

/** Captures the owner at mutation start and writes through the guarded journal. */
const persist = (entries: [Domain, unknown][]) => {
  const active = scope;
  if (!active) return;
  for (const [domain, value] of entries) {
    active.store.writeGuarded(active.token, domain, value).catch(() => {});
  }
};

export const usePlanStore = create<PlanStore>((set, get) => ({
  hydrated: false,
  ...EMPTY,

  hydrate: async () => {
    const active = scope;
    if (!active) return; // no read before the owner is resolved
    if (get().hydrated) return;
    const owner = { kind: active.token.kind, id: active.token.id };
    try {
      const [plan, answers, swaps, seed, step, completions] = await Promise.all([
        active.store.read<Plan | null>(owner, "plan", null),
        active.store.read<Partial<Answers>>(owner, "planAnswers", {}),
        active.store.read<Record<string, string>>(owner, "planSwaps", {}),
        active.store.read<number>(owner, "planSeed", 0),
        active.store.read<number>(owner, "onboardingStep", 0),
        active.store.read<CompletionsMap>(owner, "planCompletions", {}),
      ]);
      // A late resolution for a previous owner must never be published.
      if (scope !== active) return;
      set({
        hydrated: true,
        ownerKey: scopeKeyOf(active.token),
        plan: plan || null,
        answers: answers || {},
        swaps: swaps || {},
        seed: seed || 0,
        step: plan ? 100 : step || 0,
        completions: completions || {},
      });
    } catch {
      set({ hydrated: true, ownerKey: scopeKeyOf(active.token) });
    }
  },

  resetForOwner: () => set({ hydrated: false, ...EMPTY }),

  setStep: (n) => {
    set({ step: n });
    persist([["onboardingStep", n]]);
  },

  setAnswers: (patch) => {
    const next = { ...get().answers, ...patch };
    set({ answers: next });
    persist([["planAnswers", next]]);
  },

  setSwap: (plannedId, replacementId) => {
    const next = { ...get().swaps };
    if (!replacementId || replacementId === plannedId) delete next[plannedId];
    else next[plannedId] = replacementId;
    set({ swaps: next });
    persist([["planSwaps", next]]);
  },

  // Day edits rewrite the PLAN itself — unlike a swap, which is an overlay —
  // so they survive a schedule adjust the same way the rest of the week does,
  // and a brand-new program (rebuildFromAnswers) replaces them wholesale.
  removeDayExercise: (dayIndex, plannedId) => {
    const { plan } = get();
    const day = plan?.days[dayIndex];
    if (!plan || !day || day.rest || !day.exercises) return;
    const exercises = day.exercises.filter((e) => e.id !== plannedId);
    if (exercises.length === day.exercises.length) return;
    const next: Plan = { ...plan, days: plan.days.map((d, i) => (i === dayIndex ? { ...d, exercises } : d)) };
    set({ plan: next });
    persist([["plan", next]]);
  },

  addDayExercise: (dayIndex, exerciseId) => {
    const { plan, answers } = get();
    const day = plan?.days[dayIndex];
    if (!plan || !day || day.rest) return;
    if ((day.exercises || []).some((e) => e.id === exerciseId)) return;
    let entry;
    try {
      entry = entryFor(exerciseId, answers as Answers);
    } catch {
      return; // an id we cannot resolve must never blank the day
    }
    const exercises = [...(day.exercises || []), entry];
    const next: Plan = { ...plan, days: plan.days.map((d, i) => (i === dayIndex ? { ...d, exercises } : d)) };
    set({ plan: next });
    persist([["plan", next]]);
  },

  previewAdjust: (hasActiveWorkout) => {
    const { plan, answers, completions } = get();
    return previewAdjustedPlan({
      current: plan,
      answers: normalizeAnswers(answers),
      seed: newSeed(),
      completions,
      hasActiveWorkout,
    });
  },

  publishAdjusted: async (plan) => {
    const active = scope;
    if (!active) return false;
    const seed = plan.seed;
    // The current plan stays in state until both writes are confirmed.
    const [planWrite, seedWrite] = await Promise.all([
      active.store.writeGuarded(active.token, "plan", plan),
      active.store.writeGuarded(active.token, "planSeed", seed),
    ]);
    if (!planWrite.ok || !seedWrite.ok) return false;
    if (scope !== active) return false;
    set({ plan, seed });
    return true;
  },

  rebuildFromAnswers: (final) => {
    const answers = normalizeAnswers(final);
    const seed = newSeed();
    const plan = buildPlan(answers, seed);
    // A brand new program replaces every planned exercise, so swaps made against the
    // old one no longer refer to anything: they are cleared, not silently carried over.
    // A schedule ADJUST (publishAdjusted) keeps them.
    set({ plan, seed, answers, step: 100, swaps: {} });
    persist([
      ["plan", plan],
      ["planSeed", seed],
      ["planAnswers", answers],
      ["planSwaps", {}],
      ["onboardingStep", 100],
    ]);
  },

  resetAll: () => {
    set({ ...EMPTY });
    const active = scope;
    if (!active) return;
    // Explicit deletion, targeting this verified owner only.
    const owner = { kind: active.token.kind, id: active.token.id };
    for (const domain of PLAN_DOMAINS) active.store.clear(owner, domain).catch(() => {});
  },

  toggleCompletion: (dateISO, exId, done) => {
    const key = `${dateISO}:${exId}`;
    const next = { ...get().completions };
    if (done) next[key] = true;
    else delete next[key];
    set({ completions: next });
    persist([["planCompletions", next]]);
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
