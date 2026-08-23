import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useOwner } from "@/src/owner/OwnerContext";
import { WeightUnit, setUnitPreference } from "@/src/units/unitPreference";
import { convertWeight } from "@/src/units/weight";
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
import { canMarkDone, isCountableSet, isWorkingSet, setVolume } from "./setRules";
import { openingSets, plannedRepsFrom } from "./progression";
import { exercisePerformances } from "@/src/history/metrics";

export type LoggedSet = {
  id: string;
  weight: number;
  reps: number;
  done: boolean;
  /** v1.2.0 warm-up flag. Saved, but excluded from volume and records. */
  warmup?: boolean;
};
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
  /** v1.2.0. Exercises sharing an id are alternated as a superset. */
  supersetId?: string;
};
/** Mirrors workoutScope.Workout. `unit` records which unit the loads were
 *  entered in, so switching the preference converts them instead of relabelling. */
export type Workout = {
  id: string;
  date: number;
  durationSec: number;
  exercises: SessionExercise[];
  unit?: WeightUnit;
};
export type PRs = { byExercise: Record<string, { maxWeight: number; maxVolume: number }>; longestSec: number };

// Persistence is owner-scoped and lives in ./workoutScope. The legacy `anat.*`
// keys are read-only sources owned by the migration subsystem.

const uid = () => Math.random().toString(36).slice(2, 10);

/** Empty set rows for a planned exercise (count decided by plannedSetCount). */
const plannedSetRows = (planned: unknown) =>
  Array.from({ length: plannedSetCount(planned) }, () => ({ id: uid(), weight: 0, reps: 0, done: false }));

/**
 * Set rows for a newly added exercise, pre-filled from the user's own last
 * completed performance so a workout can be started without typing. Every value
 * is editable and none is marked done.
 */
const openingSetRows = (
  history: Workout[],
  exerciseId: string,
  idSpace: ExerciseIdSpace,
  plannedCount = 0,
  plannedReps = 0,
  displayUnit: WeightUnit = "kg",
) => {
  const { count, weight, reps } = openingSets(
    exercisePerformances(history, exerciseId, idSpace, displayUnit),
    plannedCount,
    plannedReps,
  );
  return Array.from({ length: count }, () => ({ id: uid(), weight, reps, done: false }));
};

export function workoutStats(exs: SessionExercise[]) {
  let sets = 0,
    completed = 0,
    reps = 0,
    volume = 0;
  for (const e of exs) {
    for (const s of e.sets) {
      sets++;
      // A ticked set with 0 reps records no work and is not counted.
      if (!isCountableSet(s)) continue;
      completed++;
      reps += s.reps;
      // Warm-ups are logged work but carry no volume.
      if (isWorkingSet(s)) volume += setVolume(s);
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
    // Warm-ups do not drive activation shading either.
    const weight = e.sets.filter(isWorkingSet).length;
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
  /**
   * Plan seed the active session was started under, or null when unknown
   * (a session saved before v1.2.0). Compare with the plan's current seed to
   * detect a session that outlived a plan regeneration.
   */
  sessionPlanSeed: number | null;
  restPref: number;
  history: Workout[];
  prs: PRs;
  startWorkout: () => void;
  addExercise: (id: string) => void;
  /**
   * Add an exercise from a Plan day, carrying the planned set count into the
   * session. Auto-ticks the Plan when all sets complete.
   */
  addExerciseFromPlan: (id: string, planDate: string, plannedSets?: number, planName?: string, repsOrTime?: string) => void;
  hasExercise: (id: string) => boolean;
  addSet: (exId: string) => void;
  updateSet: (exId: string, setId: string, patch: Partial<LoggedSet>) => void;
  deleteSet: (exId: string, setId: string) => void;
  duplicateSet: (exId: string, setId: string) => void;
  toggleDone: (exId: string, setId: string) => void;
  /** Marks a set as a warm-up: logged, but outside volume and records. */
  toggleWarmup: (exId: string, setId: string) => void;
  /** Groups/ungroups an exercise into a superset with the one above it. */
  toggleSuperset: (exId: string) => void;
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
  // The plan seed the session was started under, so a session that outlived a
  // plan regeneration can be identified instead of silently advertised as
  // belonging to the new week.
  const [sessionPlanSeed, setSessionPlanSeed] = useState<number | null>(null);

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
    setSessionPlanSeed(null);
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
            supersetId: e.supersetId,
          })),
        );
        setStartedAt(snap.active.startedAt);
        setSessionPlanSeed(
          typeof snap.active.planSeed === "number" ? snap.active.planSeed : null,
        );
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
    const payload = buildActiveSession(
      token,
      sessionIdRef.current,
      startedAt ?? Date.now(),
      session,
      Date.now,
      sessionPlanSeed ?? undefined,
    );
    persistActiveSession(store, token, payload).catch(() => {});
  }, [session, startedAt, hydratedFor, ownerKey, token, owner, store, sessionPlanSeed]);

  /**
   * Records which plan a session belongs to, exactly once per session. Mirrors
   * the `startedAt` pattern: only the first creator sets it.
   */
  const stampPlanSeed = useCallback(() => {
    const seed = usePlanStore.getState().seed;
    setSessionPlanSeed((s) => s ?? (typeof seed === "number" ? seed : null));
  }, []);

  const startWorkout = useCallback(() => {
    setSession([]);
    setStartedAt(Date.now());
    stampPlanSeed();
  }, [stampPlanSeed]);

  const addExercise = useCallback((id: string) => {
    setSession((prev) => {
      const base = prev || [];
      if (base.some((e) => e.exerciseId === id)) return base;
      return [
        ...base,
        {
          exerciseId: id,
          idSpace: "anatomy" as ExerciseIdSpace,
          sets: openingSetRows(history, id, "anatomy", 0, 0, unit),
          notes: "",
        },
      ];
    });
    setStartedAt((s) => s ?? Date.now());
    stampPlanSeed();
  }, [stampPlanSeed, history, unit]);

  const addExerciseFromPlan = useCallback((id: string, planDate: string, plannedSets = 1, planName?: string, repsOrTime?: string) => {
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
          // The Plan day promises N sets at a rep target for this goal, so the
          // session opens with N rows at that target, loaded from the last time
          // this exercise was logged.
          sets: openingSetRows(history, id, "plan", plannedSetCount(plannedSets), plannedRepsFrom(repsOrTime), unit),
          notes: "",
          planLink: { planDate, planName },
        },
      ];
    });
    setStartedAt((s) => s ?? Date.now());
    stampPlanSeed();
  }, [stampPlanSeed, history, unit]);

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
    mutate(exId, (e) => ({
      ...e,
      sets: e.sets.map((s) => {
        if (s.id !== setId) return s;
        const next = { ...s, ...patch };
        // Editing the reps back down to 0 releases the Done tick, so a counted
        // set can never be left holding no work.
        return next.done && !canMarkDone(next) ? { ...next, done: false } : next;
      }),
    }));
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

  // Ticking a set requires at least one rep; un-ticking is always allowed so a
  // mistaken entry can still be undone. The screen disables the control too —
  // this is the guard that keeps the rule true for every caller.
  const toggleDone = useCallback((exId: string, setId: string) => {
    mutate(exId, (e) => ({
      ...e,
      sets: e.sets.map((s) => {
        if (s.id !== setId) return s;
        if (s.done) return { ...s, done: false };
        return canMarkDone(s) ? { ...s, done: true } : s;
      }),
    }));
  }, []);

  /** Warm-up sets stay in the log but leave volume and records untouched. */
  const toggleWarmup = useCallback((exId: string, setId: string) => {
    mutate(exId, (e) => ({
      ...e,
      sets: e.sets.map((s) => (s.id === setId ? { ...s, warmup: !s.warmup } : s)),
    }));
  }, []);

  /**
   * Supersets are expressed as a shared id on adjacent exercises rather than a
   * nested structure, so every existing reader (History, PRs, the Plan tick)
   * keeps working untouched and a record saved without the flag still loads.
   */
  const toggleSuperset = useCallback((exId: string) => {
    setSession((prev) => {
      if (!prev) return prev;
      const idx = prev.findIndex((e) => e.exerciseId === exId);
      if (idx <= 0) return prev; // nothing above to pair with
      const above = prev[idx - 1];
      const me = prev[idx];
      const joined = !!me.supersetId && me.supersetId === above.supersetId;

      let next: SessionExercise[];
      if (joined) {
        next = prev.map((e, i) => (i === idx ? { ...e, supersetId: undefined } : e));
      } else {
        const groupId = above.supersetId || `ss_${uid()}`;
        next = prev.map((e, i) =>
          i === idx ? { ...e, supersetId: groupId } : i === idx - 1 ? { ...e, supersetId: groupId } : e,
        );
      }
      // A group of one is not a superset — release the leftover marker.
      const counts = new Map<string, number>();
      for (const e of next) if (e.supersetId) counts.set(e.supersetId, (counts.get(e.supersetId) || 0) + 1);
      return next.map((e) => (e.supersetId && counts.get(e.supersetId) === 1 ? { ...e, supersetId: undefined } : e));
    });
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
      setUnitState((prev) => {
        if (prev === u) return prev;
        // Switching the unit CONVERTS the loads on screen. Relabelling them
        // would restate 40 kg as 40 lb — a different lift. Only the live
        // session is rewritten; finished history keeps its own numbers and
        // carries the unit it was logged in.
        setSession((cur) =>
          cur
            ? cur.map((e) => ({
                ...e,
                sets: e.sets.map((st) =>
                  st.weight ? { ...st, weight: convertWeight(st.weight, prev, u) } : st,
                ),
              }))
            : cur,
        );
        return u;
      });
      setUnitPreference(store, token, u).catch(() => {});
    },
    [store, token],
  );

  const finish = useCallback(async (): Promise<FinishResult> => {
    if (!session || session.length === 0) return { ok: false, reason: "empty_session" };
    if (!token || !owner) return { ok: false, reason: "unresolved_owner" };

    const durationSec = startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0;
    const workout: Workout = { id: uid(), date: Date.now(), durationSec, exercises: session, unit };
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
    setSessionPlanSeed(null);
    return { ok: true, workout, newPRs };
  }, [session, startedAt, history, prs, store, token, owner, unit]);

  const cancel = useCallback(() => {
    setSession(null);
    setStartedAt(null);
    setSessionPlanSeed(null);
  }, []);

  // Keep the Plan tick in sync with the Session in BOTH directions: a plan-linked
  // exercise is ticked when every set is done, and un-ticked if a set is removed
  // or unchecked so the sets drop back below complete. Runs on every session change.
  useEffect(() => {
    if (!session || session.length === 0) return;
    const toggle = usePlanStore.getState().toggleCompletion;
    for (const se of session) {
      if (!se.planLink) continue;
      const allDone = se.sets.length > 0 && se.sets.every(isCountableSet);
      toggle(se.planLink.planDate, se.exerciseId, allDone);
    }
  }, [session]);

  const retryRead = useCallback(() => {
    setReadFailed(false);
    setHydratedFor(null);
    setReloadNonce((n) => n + 1);
  }, []);

  // Memoised deliberately. As an inline object this was a NEW value on every
  // render of the provider, so EVERY useWorkout() consumer in the app — each
  // session card, the plan, history — re-rendered on every keystroke into a
  // weight field. The callbacks are already stable via useCallback, so only
  // real state changes propagate now.
  const value = useMemo(
    () => ({
      session,
      startedAt,
      sessionPlanSeed,
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
      toggleWarmup,
      toggleSuperset,
      removeExercise,
      setNotes,
      setRestPref,
      finish,
      cancel,
      unit,
      setUnit,
      hydrated: hydratedFor === ownerKey,
      readFailed,
      retryRead,
    }),
    [addExercise, addExerciseFromPlan, addSet, cancel, deleteSet, duplicateSet, finish, hasExercise, history, hydratedFor, ownerKey, prs, readFailed, removeExercise, restPref, retryRead, session, sessionPlanSeed, setNotes, setRestPref, setUnit, startWorkout, startedAt, toggleDone, toggleSuperset, toggleWarmup, unit, updateSet],
  );

  return <WorkoutContext.Provider value={value}>{children}</WorkoutContext.Provider>;
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

/**
 * Recovery heat map — v1.2.0.
 *
 * The model used to carry two meanings on one colour: a muscle you trained a
 * month ago and a muscle you have never trained both rendered as "recovered"
 * green, which is why a legs-only session left the whole body looking trained.
 * Recency is now its own axis, and "no completed work recorded" is a state of
 * its own rather than the absence of one.
 */
export type RecoveryState = "fatigued" | "recovering" | "ready" | "undertrained" | "untrained";

export const RECOVERY_COLORS: Record<RecoveryState, string> = {
  fatigued: "#FF4438",
  recovering: "#FFB020",
  ready: "#2FBF71",
  undertrained: "#3B82F6",
  untrained: "#48566B",
};

/** Days without a completed working set after which a muscle reads undertrained. */
export const UNDERTRAINED_DAYS = 10;

/** The key to the colours. Rendered verbatim so the model is never unexplained. */
export const RECOVERY_LEGEND: { state: RecoveryState; label: string; help: string }[] = [
  { state: "fatigued", label: "Fatigued", help: "Trained recently — still early in recovery" },
  { state: "recovering", label: "Recovering", help: "Part-way through its recovery window" },
  { state: "ready", label: "Ready", help: "Recovered and ready to train again" },
  { state: "undertrained", label: "Undertrained", help: `No completed sets in ${UNDERTRAINED_DAYS} days` },
  { state: "untrained", label: "Not tracked", help: "No completed sets recorded yet" },
];

export const RECOVERY_NOTE =
  "Based on the completed sets stored on this device and typical recovery windows of 24–72 hours by muscle group. A guide, not a medical assessment.";

/** Which state one muscle is in, given when it was last worked. */
export function recoveryStateFor(lastTs: number | null, recoveryHours: number, now: number): RecoveryState {
  if (!lastTs) return "untrained";
  const hoursSince = (now - lastTs) / 3.6e6;
  if (hoursSince < recoveryHours * 0.5) return "fatigued";
  if (hoursSince < recoveryHours) return "recovering";
  return hoursSince > UNDERTRAINED_DAYS * 24 ? "undertrained" : "ready";
}

export type GroupRecovery = {
  group: string;
  label: string;
  state: RecoveryState;
  pct: number;
  hoursLeft: number;
  lastTs: number | null;
};

export function computeRecovery(
  history: Workout[],
  now: number = Date.now(),
): { colorMap: Record<string, string>; groups: GroupRecovery[] } {
  const lastByMuscle: Record<string, number> = {};
  for (const wk of history) {
    for (const e of wk.exercises) {
      if (!e.sets.some(isWorkingSet)) continue;
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
    colorMap[m] = RECOVERY_COLORS[recoveryStateFor(ts, recH, now)];
    if (g) groupLast[g] = Math.max(groupLast[g] || 0, ts);
  }

  const groups: GroupRecovery[] = GYM_GROUP_ORDER.map((group) => {
    const recH = RECOVERY_HOURS[group] || 48;
    const lastTs = groupLast[group] || null;
    const state = recoveryStateFor(lastTs, recH, now);
    if (!lastTs) {
      return { group, label: GYM_GROUPS[group].label, state, pct: 0, hoursLeft: 0, lastTs: null };
    }
    const hoursSince = (now - lastTs) / 3.6e6;
    return {
      group,
      label: GYM_GROUPS[group].label,
      state,
      pct: Math.max(0, Math.min(1, hoursSince / recH)),
      hoursLeft: Math.max(0, Math.round(recH - hoursSince)),
      lastTs,
    };
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
      const done = e.sets.filter(isWorkingSet).length;
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
