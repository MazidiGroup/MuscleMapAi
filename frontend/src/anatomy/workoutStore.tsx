import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { storage } from "@/src/utils/storage";
import { getExercise } from "./exercises";
import { getMuscleInfo } from "./muscleData";
import { prettyName } from "./groups";

export type LoggedSet = { id: string; weight: number; reps: number; done: boolean };
export type SessionExercise = { exerciseId: string; sets: LoggedSet[]; notes: string };
export type Workout = { id: string; date: number; durationSec: number; exercises: SessionExercise[] };
export type PRs = { byExercise: Record<string, { maxWeight: number; maxVolume: number }>; longestSec: number };

const HISTORY_KEY = "anat.workouts";
const PR_KEY = "anat.prs";
const REST_KEY = "anat.restPref";

const uid = () => Math.random().toString(36).slice(2, 10);

async function loadJSON<T>(key: string, fallback: T): Promise<T> {
  const raw = await storage.getItem<string>(key, "");
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
const saveJSON = (key: string, v: any) => storage.setItem(key, JSON.stringify(v));

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
  hasExercise: (id: string) => boolean;
  addSet: (exId: string) => void;
  updateSet: (exId: string, setId: string, patch: Partial<LoggedSet>) => void;
  deleteSet: (exId: string, setId: string) => void;
  duplicateSet: (exId: string, setId: string) => void;
  toggleDone: (exId: string, setId: string) => void;
  removeExercise: (exId: string) => void;
  setNotes: (exId: string, notes: string) => void;
  setRestPref: (n: number) => void;
  finish: () => { workout: Workout; newPRs: string[] } | null;
  cancel: () => void;
};

const WorkoutContext = createContext<Ctx | null>(null);

export function WorkoutProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SessionExercise[] | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [restPref, setRestPrefState] = useState(60);
  const [history, setHistory] = useState<Workout[]>([]);
  const [prs, setPRs] = useState<PRs>({ byExercise: {}, longestSec: 0 });

  useEffect(() => {
    loadJSON<Workout[]>(HISTORY_KEY, []).then(setHistory);
    loadJSON<PRs>(PR_KEY, { byExercise: {}, longestSec: 0 }).then(setPRs);
    storage.getItem<number>(REST_KEY, 60).then((v) => v && setRestPrefState(Number(v)));
  }, []);

  const startWorkout = useCallback(() => {
    setSession([]);
    setStartedAt(Date.now());
  }, []);

  const addExercise = useCallback((id: string) => {
    setSession((prev) => {
      const base = prev || [];
      if (base.some((e) => e.exerciseId === id)) return base;
      return [...base, { exerciseId: id, sets: [{ id: uid(), weight: 0, reps: 0, done: false }], notes: "" }];
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

  const setRestPref = useCallback((n: number) => {
    setRestPrefState(n);
    saveJSON(REST_KEY, n);
  }, []);

  const finish = useCallback(() => {
    if (!session || session.length === 0) return null;
    const durationSec = startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0;
    const workout: Workout = { id: uid(), date: Date.now(), durationSec, exercises: session };

    // compute PRs
    const newPRs: string[] = [];
    const nextPRs: PRs = { byExercise: { ...prs.byExercise }, longestSec: prs.longestSec };
    for (const e of session) {
      const ex = getExercise(e.exerciseId);
      const done = e.sets.filter((s) => s.done);
      if (done.length === 0) continue;
      const maxW = Math.max(0, ...done.map((s) => s.weight));
      const vol = done.reduce((a, s) => a + s.weight * s.reps, 0);
      const cur = nextPRs.byExercise[e.exerciseId] || { maxWeight: 0, maxVolume: 0 };
      if (maxW > cur.maxWeight && maxW > 0) newPRs.push(`${ex?.name || e.exerciseId}: ${maxW} kg`);
      if (vol > cur.maxVolume && vol > 0) newPRs.push(`${ex?.name || e.exerciseId}: ${vol} kg volume`);
      nextPRs.byExercise[e.exerciseId] = { maxWeight: Math.max(cur.maxWeight, maxW), maxVolume: Math.max(cur.maxVolume, vol) };
    }
    if (durationSec > nextPRs.longestSec) {
      nextPRs.longestSec = durationSec;
      if (prs.longestSec > 0) newPRs.push("Longest workout!");
    }

    const nextHistory = [workout, ...history];
    setHistory(nextHistory);
    setPRs(nextPRs);
    saveJSON(HISTORY_KEY, nextHistory);
    saveJSON(PR_KEY, nextPRs);
    setSession(null);
    setStartedAt(null);
    return { workout, newPRs };
  }, [session, startedAt, history, prs]);

  const cancel = useCallback(() => {
    setSession(null);
    setStartedAt(null);
  }, []);

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
