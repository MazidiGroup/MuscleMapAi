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

import { Answers, Plan } from "./exercises";
import { buildPlan } from "./planAdapter";

type CompletionsMap = Record<string, boolean>;

const PLAN_DOMAINS: Domain[] = ["plan", "planAnswers", "planSeed", "onboardingStep", "planCompletions"];

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

  hydrate: () => Promise<void>;
  /** Drops every hydrated value so a previous owner's data can never be shown. */
  resetForOwner: () => void;
  setStep: (n: number) => void;
  setAnswers: (patch: Partial<Answers>) => void;
  reshuffle: () => void;
  rebuildFromAnswers: (final: Answers) => void;
  resetAll: () => void;
  toggleCompletion: (dateISO: string, exId: string, done: boolean) => void;
  isCompleted: (dateISO: string, exId: string) => boolean;
};

const EMPTY = { step: 0, answers: {}, plan: null, seed: 0, completions: {}, ownerKey: null } as const;

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
      const [plan, answers, seed, step, completions] = await Promise.all([
        active.store.read<Plan | null>(owner, "plan", null),
        active.store.read<Partial<Answers>>(owner, "planAnswers", {}),
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

  reshuffle: () => {
    const ans = get().answers as Answers;
    if (!ans.goal) return;
    const seed = Math.floor(Math.random() * 2_147_483_647);
    const plan = buildPlan(ans, seed);
    set({ plan, seed });
    persist([
      ["plan", plan],
      ["planSeed", seed],
    ]);
  },

  rebuildFromAnswers: (final) => {
    const seed = Math.floor(Math.random() * 2_147_483_647);
    const plan = buildPlan(final, seed);
    set({ plan, seed, answers: final, step: 100 });
    persist([
      ["plan", plan],
      ["planSeed", seed],
      ["planAnswers", final],
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
