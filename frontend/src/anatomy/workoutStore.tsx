import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useOwner } from "@/src/owner/OwnerContext";
import { WeightUnit, setUnitPreference } from "@/src/units/unitPreference";
import {
  EMPTY_PRS,
  buildActiveSession,
  clearActiveSession,
  hydrateWorkoutScope,
  persistActiveSession,
  persistHistory,
  persistPRs,
  persistRestPref,
  plannedSetCount,
} from "./workoutScope";
import type { ExerciseIdSpace } from "@/src/session/activeSession";
import { computePRUpdate, commitFinishedWorkout } from "./finishWorkout";
import { getExercise } from "./exercises";
import { getMuscleInfo } from "./muscleData";
import { prettyName, GYM_GROUPS, GYM_GROUP_ORDER } from "./groups";
import { usePlanStore } from "@/src/plan/planStore";

export type LoggedSet = { id: string; weight: number; reps: number; done: boolean };
export type SessionExercise = {
  /** The exact source id — never renamed, never inferred from a display name. */
  exerciseId: string;
  /** Which catalogue the id came from. Preserved for the lifetime of the set. */
  idSpace?: ExerciseIdSpace;
  sets: LoggedSet[];
  notes: string;
  /** When the exercise was added via the Plan tab, this remembers the plan-day
   *  it belongs to so we can auto-tick it once every set is done. */
  planLink?: { planDate: string; planName?: string };
};
export type Workout = { id: string; date: number; durationSec: number; exercises: SessionExercise[] };
export type PRs = { byExercise: Record<string, { maxWeight: number; maxVolume: number }>; longestSec: number };

// Persistence is owner-scoped and lives in ./workoutScope. The legacy `anat.*`
// keys are read-only sources owned by the migration subsystem.

const uid = () => Math.random().toString(36).slice(2, 10);

/** Empty set rows for a planned exercise (count decided by plannedSetCount). */
const plannedSetRows = (planned: unknown) =>
  Array.from({ length: plannedSetCount(planned) }, () => ({ id: uid(), weight: 0, reps: 0, done: false }));

export function workoutStats(exs: SessionExercise[]) {
  let sets = 0,
    completed = 0,
    reps = 0,
    volume = 0;
  for (const e of exs) {
    for (const s of e.sets) {
      sets++;
      if (s.done) {
        completed++;
        reps += s.reps;
        volume += s.weight * s.reps;
      }
    }
  }
  return { sets, completed, reps, volume };
}

export type Activation = { name: string; label: string; pct: number; role: "primary" | "secondary" };

export function muscleActivation(exs: SessionExercise[]): { list: Activation[]; primary: string[]; secondary: string[] } {
  const score: Record<string, number> = {};
  const roles: Record<string, "primary" | "secondary"> = {};
  for (const e of exs) {
    const ex = getExercise(e.exerciseId);
    if (!ex) continue;
    const completed = e.sets.filter((s) => s.done).length || (e.sets.length ? 0 : 0);
    const weight = completed > 0 ? completed : 0;
    if (weight === 0) continue;
    for (const m of ex.primary) {
      score[m] = (score[m] || 0) + weight * 1;
      roles[m] = "primary";
    }
    for (const m of ex.secondary) {
      score[m] = (score[m] || 0) + weight * 0.5;
      if (roles[m] !== "primary") roles[m] = "secondary";
    }
  }
  const max = Math.max(1, ...Object.values(score));
  const list: Activation[] = Object.keys(score)
    .map((name) => ({
      name,
      label: getMuscleInfo(name)?.label || prettyName(name),
      pct: Math.round((score[name] / max) * 100),
      role: roles[name],
    }))
    .sort((a, b) => b.pct - a.pct);
  return {
    list,
    primary: list.filter((a) => a.role === "primary").map((a) => a.name),
    secondary: list.filter((a) => a.role === "secondary").map((a) => a.name),
  };
}

type Ctx = {
  session: SessionExercise[] | null;
  startedAt: number | null;
  restPref: number;
  history: Workout[];
  prs: PRs;
  startWorkout: () => void;
  addExercise: (id: string) => void;
  /**
   * Add an exercise from a Plan day, carrying the planned set count into the
   * session. Auto-ticks the Plan when all sets complete.
   */
  addExerciseFromPlan: (id: string, planDate: string, plannedSets?: number, planName?: string) => void;
  hasExercise: (id: string) => boolean;
  addSet: (exId: string) => void;
  updateSet: (exId: string, setId: string, patch: Partial<LoggedSet>) => void;
  deleteSet: (exId: string, setId: string) => void;
  duplicateSet: (exId: string, setId: string) => void;
  toggleDone: (exId: string, setId: string) => void;
  removeExercise: (exId: string) => void;
  setNotes: (exId: string, notes: string) => void;
  setRestPref: (n: number) => void;
  finish: () => Promise<FinishResult>;
  cancel: () => void;
  /** The one stored weight unit for Workout and History. */
  unit: WeightUnit;
  setUnit: (u: WeightUnit) => void;
  /** False until this owner's scope has hydrated. */
  hydrated: boolean;
  /** True when this owner's local records could not be read at all. */
  readFailed: boolean;
  /** Re-attempts the owner-scoped read. Safe: reading is idempotent. */
  retryRead: () => void;
};

export type FinishResult =
  | { ok: true; workout: Workout; newPRs: string[] }
  | { ok: false; reason: "empty_session" | "unresolved_owner" | "history_write_failed" | "prs_write_failed" };

const WorkoutContext = createContext<Ctx | null>(null);

export function WorkoutProvider({ children }: { children: React.ReactNode }) {
  const { owner, token, ready, store } = useOwner();
  const ownerKey = token ? `${token.kind}:${token.id}:${token.generation}` : "none";

  const [session, setSession] = useState<SessionExercise[] | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [restPref, setRestPrefState] = useState(60);
  const [history, setHistory] = useState<Workout[]>([]);
  const [prs, setPRs] = useState<PRs>(EMPTY_PRS);
  const [unit, setUnitState] = useState<WeightUnit>("kg");
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  const [readFailed, setReadFailed] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const sessionIdRef = useRef<string | null>(null);

  // Owner-scoped hydration. Stale values are dropped the moment the owner
  // changes, so a previous owner's History can never render.
  useEffect(() => {
    let cancelled = false;
    setHistory([]);
    setPRs(EMPTY_PRS);
    setRestPrefState(60);
    setSession(null);
    setStartedAt(null);
    setUnitState("kg");
    setHydratedFor(null);
    setReadFailed(false);
    sessionIdRef.current = null;
    if (!ready || !owner) return;

    (async () => {
      let snap;
      try {
        snap = await hydrateWorkoutScope(store, owner);
      } catch (e) {
        // A local read failure is surfaced instead of looking like "no history".
        if (!cancelled) {
          console.error("[Workout] local read failed:", e);
          setReadFailed(true);
          setHydratedFor(ownerKey);
        }
        return;
      }
      if (cancelled) return;
      setReadFailed(false);
      setHistory(snap.history);
      setPRs(snap.prs);
      setRestPrefState(snap.restPref);
      setUnitState(snap.unit);
      if (snap.active) {
        sessionIdRef.current = snap.active.sessionId;
        setSession(
          snap.active.exercises.map((e) => ({
            exerciseId: e.exerciseId,
            idSpace: e.idSpace,
            sets: e.sets,
            notes: e.notes,
            planLink: e.planLink,
          })),
        );
        setStartedAt(snap.active.startedAt);
      }
      setHydratedFor(ownerKey);
    })();

    return () => {
      cancelled = true;
    };
  }, [ownerKey, ready, owner, store, reloadNonce]);

  // Persist the active session so an interruption cannot lose it. One key per
  // owner means one active session per owner.
  useEffect(() => {
    if (hydratedFor !== ownerKey || !token || !owner) return;
    if (session === null) {
      sessionIdRef.current = null;
      clearActiveSession(store, owner).catch(() => {});
      return;
    }
    if (!sessionIdRef.current) sessionIdRef.current = `s_${Date.now().toString(36)}_${uid()}`;
    const payload = buildActiveSession(token, sessionIdRef.current, startedAt ?? Date.now(), session);
    persistActiveSession(store, token, payload).catch(() => {});
  }, [session, startedAt, hydratedFor, ownerKey, token, owner, store]);

  const startWorkout = useCallback(() => {
    setSession([]);
    setStartedAt(Date.now());
  }, []);

  const addExercise = useCallback((id: string) => {
    setSession((prev) => {
      const base = prev || [];
      if (base.some((e) => e.exerciseId === id)) return base;
      return [
        ...base,
        { exerciseId: id, idSpace: "anatomy" as ExerciseIdSpace, sets: [{ id: uid(), weight: 0, reps: 0, done: false }], notes: "" },
      ];
    });
    setStartedAt((s) => s ?? Date.now());
  }, []);

  const addExerciseFromPlan = useCallback((id: string, planDate: string, plannedSets = 1, planName?: string) => {
    setSession((prev) => {
      const base = prev || [];
      if (base.some((e) => e.exerciseId === id)) {
        // If already there, ensure the planLink is stamped so completion ticks.
        // An existing entry is never rewritten: the user may already be logging it.
        return base.map((e) =>
          e.exerciseId === id
            ? { ...e, planLink: e.planLink || { planDate, planName } }
            : e,
        );
      }
      return [
        ...base,
        {
          exerciseId: id,
          idSpace: "plan" as ExerciseIdSpace,
          // The Plan day promises N sets, so the session starts with N empty sets.
          sets: plannedSetRows(plannedSets),
          notes: "",
          planLink: { planDate, planName },
        },
      ];
    });
    setStartedAt((s) => s ?? Date.now());
  }, []);

  const hasExercise = useCallback((id: string) => !!session?.some((e) => e.exerciseId === id), [session]);

  const mutate = (exId: string, fn: (e: SessionExercise) => SessionExercise) =>
    setSession((prev) => (prev ? prev.map((e) => (e.exerciseId === exId ? fn(e) : e)) : prev));

  const addSet = useCallback((exId: string) => {
    mutate(exId, (e) => {
      const last = e.sets[e.sets.length - 1];
      return { ...e, sets: [...e.sets, { id: uid(), weight: last?.weight || 0, reps: last?.reps || 0, done: false }] };
    });
  }, []);

  const updateSet = useCallback((exId: string, setId: string, patch: Partial<LoggedSet>) => {
    mutate(exId, (e) => ({ ...e, sets: e.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)) }));
  }, []);

  const deleteSet = useCallback((exId: string, setId: string) => {
    mutate(exId, (e) => ({ ...e, sets: e.sets.filter((s) => s.id !== setId) }));
  }, []);

  const duplicateSet = useCallback((exId: string, setId: string) => {
    mutate(exId, (e) => {
      const idx = e.sets.findIndex((s) => s.id === setId);
      if (idx < 0) return e;
      const copy = { ...e.sets[idx], id: uid(), done: false };
      const next = e.sets.slice();
      next.splice(idx + 1, 0, copy);
      return { ...e, sets: next };
    });
  }, []);

  const toggleDone = useCallback((exId: string, setId: string) => {
    mutate(exId, (e) => ({ ...e, sets: e.sets.map((s) => (s.id === setId ? { ...s, done: !s.done } : s)) }));
  }, []);

  const removeExercise = useCallback((exId: string) => {
    setSession((prev) => (prev ? prev.filter((e) => e.exerciseId !== exId) : prev));
  }, []);

  const setNotes = useCallback((exId: string, notes: string) => mutate(exId, (e) => ({ ...e, notes })), []);

  const setRestPref = useCallback(
    (n: number) => {
      setRestPrefState(n);
      persistRestPref(store, token, n).catch(() => {});
    },
    [store, token],
  );

  const setUnit = useCallback(
    (u: WeightUnit) => {
      setUnitState(u);
      setUnitPreference(store, token, u).catch(() => {});
    },
    [store, token],
  );

  const finish = useCallback(async (): Promise<FinishResult> => {
    if (!session || session.length === 0) return { ok: false, reason: "empty_session" };
    if (!token || !owner) return { ok: false, reason: "unresolved_owner" };

    const durationSec = startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0;
    const workout: Workout = { id: uid(), date: Date.now(), durationSec, exercises: session };
    const { prs: nextPRs, newPRs } = computePRUpdate(prs, session, {
      unit,
      durationSec,
      nameOf: (id) => getExercise(id)?.name,
    });

    // Verified local transaction: History and PRs are both confirmed written
    // before the active session is released.
    const res = await commitFinishedWorkout(store, token, owner, {
      workout,
      previousHistory: history,
      nextPRs,
    });
    if (!res.ok) return { ok: false, reason: res.reason };

    setHistory(res.history);
    setPRs(res.prs);
    sessionIdRef.current = null;
    setSession(null);
    setStartedAt(null);
    return { ok: true, workout, newPRs };
  }, [session, startedAt, history, prs, store, token, owner, unit]);

  const cancel = useCallback(() => {
    setSession(null);
    setStartedAt(null);
  }, []);

  // Keep the Plan tick in sync with the Session in BOTH directions: a plan-linked
  // exercise is ticked when every set is done, and un-ticked if a set is removed
  // or unchecked so the sets drop back below complete. Runs on every session change.
  useEffect(() => {
    if (!session || session.length === 0) return;
    const toggle = usePlanStore.getState().toggleCompletion;
    for (const se of session) {
      if (!se.planLink) continue;
      const allDone = se.sets.length > 0 && se.sets.every((s) => s.done);
      toggle(se.planLink.planDate, se.exerciseId, allDone);
    }
  }, [session]);

  return (
    <WorkoutContext.Provider
      value={{
        session,
        startedAt,
        restPref,
        history,
        prs,
        startWorkout,
        addExercise,
        addExerciseFromPlan,
        hasExercise,
        addSet,
        updateSet,
        deleteSet,
        duplicateSet,
        toggleDone,
        removeExercise,
        setNotes,
        setRestPref,
        finish,
        cancel,
        unit,
        setUnit,
        hydrated: hydratedFor === ownerKey,
        readFailed,
        retryRead: () => {
          setReadFailed(false);
          setHydratedFor(null);
          setReloadNonce((n) => n + 1);
        },
      }}
    >
      {children}
    </WorkoutContext.Provider>
  );
}

export function useWorkout() {
  const ctx = useContext(WorkoutContext);
  if (!ctx) throw new Error("useWorkout must be used within WorkoutProvider");
  return ctx;
}

export function getWorkoutById(history: Workout[], id: string) {
  return history.find((w) => w.id === id);
}

// ---------------- Analytics ----------------
export const RECOVERY_HOURS: Record<string, number> = {
  chest: 60,
  back: 60,
  shoulders: 36,
  arms: 36,
  forearms: 24,
  core: 24,
  glutes: 60,
  quads: 72,
  hamstrings: 72,
  adductors: 48,
  calves: 36,
};

const REC_COLORS = { red: "#FF4438", orange: "#FFB020", green: "#2FBF71" };

export type GroupRecovery = { group: string; label: string; state: "red" | "orange" | "green"; pct: number; hoursLeft: number; lastTs: number | null };

export function computeRecovery(history: Workout[]): { colorMap: Record<string, string>; groups: GroupRecovery[] } {
  const now = Date.now();
  const lastByMuscle: Record<string, number> = {};
  for (const wk of history) {
    for (const e of wk.exercises) {
      if (!e.sets.some((s) => s.done)) continue;
      const ex = getExercise(e.exerciseId);
      if (!ex) continue;
      for (const m of [...ex.primary, ...ex.secondary]) {
        lastByMuscle[m] = Math.max(lastByMuscle[m] || 0, wk.date);
      }
    }
  }

  const colorMap: Record<string, string> = {};
  // per-group aggregation (most recently trained muscle drives the group)
  const groupLast: Record<string, number> = {};
  for (const [m, ts] of Object.entries(lastByMuscle)) {
    const g = getMuscleInfo(m)?.group;
    const recH = (g && RECOVERY_HOURS[g]) || 48;
    const hoursSince = (now - ts) / 3.6e6;
    const pct = Math.max(0, Math.min(1, hoursSince / recH));
    const state = pct < 0.5 ? "red" : pct < 1 ? "orange" : "green";
    colorMap[m] = REC_COLORS[state];
    if (g) groupLast[g] = Math.max(groupLast[g] || 0, ts);
  }

  const groups: GroupRecovery[] = GYM_GROUP_ORDER.map((group) => {
    const recH = RECOVERY_HOURS[group] || 48;
    const lastTs = groupLast[group] || null;
    if (!lastTs) return { group, label: GYM_GROUPS[group].label, state: "green", pct: 1, hoursLeft: 0, lastTs: null };
    const hoursSince = (now - lastTs) / 3.6e6;
    const pct = Math.max(0, Math.min(1, hoursSince / recH));
    const state = pct < 0.5 ? "red" : pct < 1 ? "orange" : "green";
    return { group, label: GYM_GROUPS[group].label, state, pct, hoursLeft: Math.max(0, Math.round(recH - hoursSince)), lastTs };
  });

  return { colorMap, groups };
}

export type GroupVolume = { group: string; label: string; sets: number };

export function weeklySetsByGroup(history: Workout[], days = 7): { list: GroupVolume[]; neglected: string[]; totalSets: number; workouts: number } {
  const cutoff = Date.now() - days * 24 * 3.6e6;
  const counts: Record<string, number> = {};
  let totalSets = 0;
  let workouts = 0;
  for (const wk of history) {
    if (wk.date < cutoff) continue;
    workouts++;
    for (const e of wk.exercises) {
      const done = e.sets.filter((s) => s.done).length;
      if (done === 0) continue;
      totalSets += done;
      const ex = getExercise(e.exerciseId);
      if (!ex) continue;
      const groups = new Set<string>();
      for (const m of ex.primary) {
        const g = getMuscleInfo(m)?.group;
        if (g) groups.add(g);
      }
      groups.forEach((g) => (counts[g] = (counts[g] || 0) + done));
    }
  }
  const list = GYM_GROUP_ORDER.map((g) => ({ group: g, label: GYM_GROUPS[g].label, sets: counts[g] || 0 }));
  const neglected = list.filter((g) => g.sets === 0).map((g) => g.label);
  return { list, neglected, totalSets, workouts };
}

export type WeekPoint = { label: string; volume: number; workouts: number };

export function weeklyVolumeSeries(history: Workout[], weeks = 6): WeekPoint[] {
  const out: WeekPoint[] = [];
  const now = Date.now();
  for (let i = weeks - 1; i >= 0; i--) {
    const end = now - i * 7 * 24 * 3.6e6;
    const start = end - 7 * 24 * 3.6e6;
    let volume = 0;
    let workouts = 0;
    for (const wk of history) {
      if (wk.date > start && wk.date <= end) {
        workouts++;
        volume += workoutStats(wk.exercises).volume;
      }
    }
    out.push({ label: i === 0 ? "This wk" : `${i}w`, volume, workouts });
  }
  return out;
}

// ---------------- v1.1.0 Insights: streaks, period stats, personal records ----------------
// All values below are computed from the workout history already stored on this
// device — no new data is collected or sent anywhere.
const WEEK_MS = 7 * 24 * 3.6e6;

function startOfWeekTs(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day);
  return d.getTime();
}

export type Streaks = { currentWeeks: number; bestWeeks: number; workoutsThisWeek: number };

/** Consecutive calendar weeks (Mon-based) with at least one finished workout. */
export function computeStreaks(history: Workout[]): Streaks {
  if (history.length === 0) return { currentWeeks: 0, bestWeeks: 0, workoutsThisWeek: 0 };
  const weeks = new Set<number>();
  for (const wk of history) weeks.add(startOfWeekTs(wk.date));
  const thisWeek = startOfWeekTs(Date.now());
  const workoutsThisWeek = history.filter((w) => startOfWeekTs(w.date) === thisWeek).length;

  // Current streak: count back from this week (or last week if this week is still empty).
  let cursor = weeks.has(thisWeek) ? thisWeek : thisWeek - WEEK_MS;
  let currentWeeks = 0;
  while (weeks.has(cursor)) {
    currentWeeks++;
    cursor -= WEEK_MS;
  }

  // Best streak ever.
  const sorted = [...weeks].sort((a, b) => a - b);
  let bestWeeks = 0;
  let run = 0;
  let prev = 0;
  for (const w of sorted) {
    run = prev && w - prev === WEEK_MS ? run + 1 : 1;
    bestWeeks = Math.max(bestWeeks, run);
    prev = w;
  }
  return { currentWeeks, bestWeeks: Math.max(bestWeeks, currentWeeks), workoutsThisWeek };
}

export type PeriodStats = { workouts: number; sets: number; reps: number; volume: number; perWeek: number };

/** Totals for the last `days` days (7 = week view, 30 = month view). */
export function periodStats(history: Workout[], days: number): PeriodStats {
  const cutoff = Date.now() - days * 24 * 3.6e6;
  let workouts = 0;
  let sets = 0;
  let reps = 0;
  let volume = 0;
  for (const wk of history) {
    if (wk.date < cutoff) continue;
    workouts++;
    const st = workoutStats(wk.exercises);
    sets += st.completed;
    reps += st.reps;
    volume += st.volume;
  }
  const perWeek = Math.round((workouts / (days / 7)) * 10) / 10;
  return { workouts, sets, reps, volume, perWeek };
}

export type PRItem = { exerciseId: string; name: string; maxWeight: number; maxVolume: number };

/** Best lifts per exercise, heaviest first. */
export function topPRs(prs: PRs, limit = 8): PRItem[] {
  return Object.entries(prs.byExercise)
    .map(([exerciseId, v]) => ({
      exerciseId,
      name: getExercise(exerciseId)?.name || exerciseId,
      maxWeight: v.maxWeight,
      maxVolume: v.maxVolume,
    }))
    .filter((p) => p.maxWeight > 0 || p.maxVolume > 0)
    .sort((a, b) => b.maxWeight - a.maxWeight || b.maxVolume - a.maxVolume)
    .slice(0, limit);
}
