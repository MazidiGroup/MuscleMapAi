// History, records and Insights calculations — Phase 3.
//
// Every number rendered by History, the calendar and Insights comes from here,
// so the same verified rules apply everywhere:
//   · a set counts only when it is done AND records at least one rep — the rule
//     lives in ../anatomy/setRules so no screen can apply a looser one;
//   · warm-up sets are stored and shown, but stay out of volume and records;
//   · incomplete entered sets stay visible but never enter a total or a record;
//   · bodyweight sets carry weight 0 and therefore add no external-load volume;
//   · calendar weeks are Monday–Sunday; volume periods are discrete rolling
//     7-day windows — the two are always labelled distinctly;
//   · records are grouped by EXACT exercise id plus ID space, never by name.
//
// Pure logic — no React, no storage.

import type { LoggedSet, SessionExercise, Workout } from "@/src/anatomy/workoutScope";
import { isCountableSet, isWorkingSet, setVolume } from "@/src/anatomy/setRules";
import type { ExerciseIdSpace } from "@/src/session/activeSession";

export const DAY_MS = 24 * 3.6e6;
export const WEEK_MS = 7 * DAY_MS;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const LONG_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// --- dates -----------------------------------------------------------------

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Monday-start local calendar week. */
export function startOfWeek(ts: number): number {
  const d = new Date(startOfDay(ts));
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

export const absoluteDate = (ts: number) => {
  const d = new Date(ts);
  return `${DAYS[(d.getDay() + 6) % 7]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

export const absoluteDateLong = (ts: number) => {
  const d = new Date(ts);
  return `${DAYS[(d.getDay() + 6) % 7]} ${d.getDate()} ${LONG_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

export const clockTime = (ts: number) => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export function durationLabel(sec: number): string {
  if (!sec || sec < 60) return `${Math.max(0, Math.round(sec))} sec`;
  const m = Math.round(sec / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

// --- record validation -----------------------------------------------------

function validSet(s: unknown): s is LoggedSet {
  const v = s as LoggedSet;
  return (
    !!v &&
    typeof v.id === "string" &&
    Number.isFinite(v.weight) &&
    Number.isFinite(v.reps) &&
    typeof v.done === "boolean"
  );
}

/** A record we are willing to render and count. Anything else is "damaged". */
export function isValidWorkoutRecord(w: unknown): w is Workout {
  const v = w as Workout;
  if (!v || typeof v.id !== "string" || !v.id) return false;
  if (!Number.isFinite(v.date)) return false;
  if (!Array.isArray(v.exercises)) return false;
  for (const e of v.exercises) {
    if (!e || typeof e.exerciseId !== "string" || !e.exerciseId) return false;
    if (!Array.isArray(e.sets) || !e.sets.every(validSet)) return false;
  }
  return true;
}

/** Splits a raw list without deleting anything: damaged records are only excluded. */
export function partitionRecords(raw: unknown[]): { valid: Workout[]; damaged: unknown[] } {
  const valid: Workout[] = [];
  const damaged: unknown[] = [];
  for (const r of raw || []) (isValidWorkoutRecord(r) ? valid : damaged).push(r as Workout);
  return { valid, damaged };
}

// --- per-workout totals ----------------------------------------------------

export type WorkoutTotals = {
  exercises: number;
  completedSets: number;
  totalSets: number;
  volume: number;
  reps: number;
};

export function workoutTotals(exercises: SessionExercise[]): WorkoutTotals {
  let completedSets = 0;
  let totalSets = 0;
  let volume = 0;
  let reps = 0;
  for (const e of exercises || []) {
    for (const s of e.sets || []) {
      totalSets++;
      // Incomplete sets — and sets ticked with 0 reps — are stored, never counted.
      if (!isCountableSet(s)) continue;
      completedSets++;
      reps += s.reps;
      // Bodyweight carries weight 0 → adds nothing. Warm-ups add nothing either.
      if (isWorkingSet(s)) volume += setVolume(s);
    }
  }
  return { exercises: (exercises || []).length, completedSets, totalSets, volume, reps };
}

export type ExerciseStatus = "Completed" | "Incomplete" | "Not completed";

/** Never "Skipped": no skip-intent flag exists in the data model. */
export function exerciseStatus(e: SessionExercise): ExerciseStatus {
  const total = (e.sets || []).length;
  const done = (e.sets || []).filter(isCountableSet).length;
  if (done === 0) return "Not completed";
  return done === total ? "Completed" : "Incomplete";
}

export const setProgressLabel = (done: number, total: number) => `${done} of ${total}`;

export const NOT_COMPLETED_COPY =
  "No completed sets were saved for this exercise. Entered values remain visible but are excluded from totals and records.";

export const incompleteCopy = (n: number) =>
  `${n} entered set${n === 1 ? "" : "s"} left incomplete — kept for your reference, excluded from totals and records.`;

/**
 * Title rule: use the stored Plan relationship when the record has one,
 * otherwise fall back to an absolute date. A split is never inferred from the
 * exercises a workout happens to contain.
 */
export function workoutTitle(w: Workout): string {
  // The plan day's own name when the record stored one; never a generic label.
  const planName = (w.exercises || []).map((e) => e.planLink?.planName).find((n) => !!n && n.trim() !== "");
  return `${planName ? planName.trim() : "Workout"} · ${absoluteDate(w.date)}`;
}

// --- grouping --------------------------------------------------------------

export type HistoryGroup = { key: string; label: string; items: Workout[] };

/** Latest first, grouped by date period, always paired with absolute dates. */
export function groupHistory(workouts: Workout[], now: number = Date.now()): HistoryGroup[] {
  const sorted = [...workouts].sort((a, b) => b.date - a.date);
  const today = startOfDay(now);
  const yesterday = today - DAY_MS;
  const weekStart = startOfWeek(now);
  const groups: HistoryGroup[] = [];
  const push = (key: string, label: string, w: Workout) => {
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(w);
    else groups.push({ key, label, items: [w] });
  };

  for (const w of sorted) {
    const day = startOfDay(w.date);
    if (day === today) push("today", "Today", w);
    else if (day === yesterday) push("yesterday", "Yesterday", w);
    else if (day >= weekStart) push("thisweek", "Earlier this week", w);
    else {
      const ws = startOfWeek(w.date);
      push(`w${ws}`, `Week of ${absoluteDate(ws)}`, w);
    }
  }
  return groups;
}

// --- current calendar week -------------------------------------------------

export type WeekSummary = { count: number; rangeLabel: string; copy: string };

export function weekSummary(workouts: Workout[], now: number = Date.now()): WeekSummary {
  const start = startOfWeek(now);
  const end = start + WEEK_MS;
  const ids = new Set<string>();
  for (const w of workouts) if (w.date >= start && w.date < end) ids.add(w.id);
  const count = ids.size; // verified duplicates excluded, source records untouched
  return {
    count,
    rangeLabel: `Week of ${absoluteDate(start)} – ${absoluteDate(start + 6 * DAY_MS)} (this device)`,
    copy: `${count} workout${count === 1 ? "" : "s"} completed this week`,
  };
}

// --- rolling volume series -------------------------------------------------

export type VolumePoint = {
  startTs: number;
  endTs: number;
  /** Explicit date range — never called a calendar week. */
  rangeLabel: string;
  volume: number;
  workouts: number;
};

export const VOLUME_CHART_TITLE = "Completed volume by rolling 7-day period";

/** Discrete rolling 7-day windows anchored to `now`. No smoothing, no interpolation. */
export function rollingVolumeSeries(
  workouts: Workout[],
  windows = 6,
  now: number = Date.now(),
): VolumePoint[] {
  const out: VolumePoint[] = [];
  for (let i = windows - 1; i >= 0; i--) {
    const endTs = now - i * WEEK_MS;
    const startTs = endTs - WEEK_MS;
    let volume = 0;
    let count = 0;
    for (const w of workouts) {
      if (w.date > startTs && w.date <= endTs) {
        count++;
        volume += workoutTotals(w.exercises).volume;
      }
    }
    out.push({
      startTs,
      endTs,
      rangeLabel: `${absoluteDate(startTs + DAY_MS)} – ${absoluteDate(endTs)}`,
      volume,
      workouts: count,
    });
  }
  return out;
}

// --- consistency and period totals ----------------------------------------

export type Consistency = { currentWeeks: number; bestWeeks: number; workoutsThisWeek: number };

export const CONSISTENCY_NOTE = "Consecutive Monday-start weeks with at least one completed workout.";

export function consistency(workouts: Workout[], now: number = Date.now()): Consistency {
  if (workouts.length === 0) return { currentWeeks: 0, bestWeeks: 0, workoutsThisWeek: 0 };
  const weeks = new Set<number>();
  for (const w of workouts) weeks.add(startOfWeek(w.date));
  const thisWeek = startOfWeek(now);
  const workoutsThisWeek = workouts.filter((w) => startOfWeek(w.date) === thisWeek).length;

  let cursor = weeks.has(thisWeek) ? thisWeek : thisWeek - WEEK_MS;
  let currentWeeks = 0;
  while (weeks.has(cursor)) {
    currentWeeks++;
    cursor -= WEEK_MS;
  }

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

export type PeriodTotals = { days: number; workouts: number; completedSets: number; volume: number; avgPer7: number };

export function periodTotals(workouts: Workout[], days: number, now: number = Date.now()): PeriodTotals {
  const cutoff = now - days * DAY_MS;
  let count = 0;
  let completedSets = 0;
  let volume = 0;
  for (const w of workouts) {
    if (w.date < cutoff) continue;
    count++;
    const t = workoutTotals(w.exercises);
    completedSets += t.completedSets;
    volume += t.volume;
  }
  return {
    days,
    workouts: count,
    completedSets,
    volume,
    avgPer7: Math.round((count / (days / 7)) * 10) / 10,
  };
}

// --- exercise history and personal records --------------------------------

export type Performance = {
  workoutId: string;
  date: number;
  completedSets: LoggedSet[];
  maxWeight: number;
  volume: number;
  reps: number;
};

/** Grouped by EXACT identifier plus ID space — display names are never used. */
export function exercisePerformances(
  workouts: Workout[],
  exerciseId: string,
  idSpace: ExerciseIdSpace = "anatomy",
): Performance[] {
  const out: Performance[] = [];
  for (const w of workouts) {
    for (const e of w.exercises || []) {
      if (e.exerciseId !== exerciseId) continue;
      if ((e.idSpace ?? "anatomy") !== idSpace) continue;
      // Working sets only — a performance is what the records compare.
      const completedSets = (e.sets || []).filter(isWorkingSet);
      if (completedSets.length === 0) continue;
      out.push({
        workoutId: w.id,
        date: w.date,
        completedSets,
        maxWeight: Math.max(0, ...completedSets.map((s) => s.weight)),
        volume: completedSets.reduce((a, s) => a + setVolume(s), 0),
        reps: completedSets.reduce((a, s) => a + s.reps, 0),
      });
    }
  }
  return out.sort((a, b) => b.date - a.date);
}

export type PersonalRecord = {
  /** Heaviest completed external load. 0 means no weighted set exists yet. */
  maxWeight: number;
  achievedAt: number | null;
  achievingWorkoutId: string | null;
  /** True when the record was set by the only weighted performance so far. */
  isFirst: boolean;
};

/**
 * Heaviest completed set only. Strict-greater-than progression, so a later equal
 * performance never steals the earlier achieving date. Bodyweight sets with no
 * added load cannot establish a weight record.
 */
export function personalRecord(performances: Performance[]): PersonalRecord {
  const weighted = performances.filter((p) => p.maxWeight > 0).sort((a, b) => a.date - b.date);
  let maxWeight = 0;
  let achievedAt: number | null = null;
  let achievingWorkoutId: string | null = null;
  for (const p of weighted) {
    if (p.maxWeight > maxWeight) {
      maxWeight = p.maxWeight;
      achievedAt = p.date;
      achievingWorkoutId = p.workoutId;
    }
  }
  return { maxWeight, achievedAt, achievingWorkoutId, isFirst: weighted.length === 1 && maxWeight > 0 };
}

export type RecordMark = "record" | "matches" | null;

/** How one performance relates to the current record. */
export function recordMark(p: Performance, record: PersonalRecord): RecordMark {
  if (p.maxWeight <= 0 || record.maxWeight <= 0) return null;
  if (p.workoutId === record.achievingWorkoutId && p.maxWeight === record.maxWeight) return "record";
  if (p.maxWeight === record.maxWeight) return "matches";
  return null;
}

export const MATCHES_BEST_COPY = "Matches current best";
export const FIRST_RECORD_COPY = (weight: number, reps: number, unit: string) =>
  `${weight} ${unit} × ${reps} is now your heaviest completed set for this exercise. Every first completed weighted set sets your starting record.`;
export const NO_RECORDS_COPY = {
  title: "No personal records yet",
  body: "Log a completed set with a weight to start tracking your bests.",
};
export const SINGLE_SESSION_COPY =
  "One session recorded. Complete this exercise again to compare performances over time.";
export const BODYWEIGHT_TREND_COPY =
  "Bodyweight sets are stored with 0 added load, so they add nothing to volume. Reps are still recorded and compared.";

// --- calendar --------------------------------------------------------------

export type CalendarCell = { ts: number; day: number; completed: number };

/** Monday-start month grid. `null` cells pad the leading week. */
export function monthMatrix(year: number, month: number, workouts: Workout[]): (CalendarCell | null)[] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const total = new Date(year, month + 1, 0).getDate();
  const byDay = new Map<number, number>();
  for (const w of workouts) {
    const d = new Date(w.date);
    if (d.getFullYear() === year && d.getMonth() === month) {
      byDay.set(d.getDate(), (byDay.get(d.getDate()) || 0) + 1);
    }
  }
  const cells: (CalendarCell | null)[] = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= total; day++) {
    cells.push({ ts: new Date(year, month, day).getTime(), day, completed: byDay.get(day) || 0 });
  }
  return cells;
}

export const monthLabel = (year: number, month: number) => `${LONG_MONTHS[month]} ${year}`;

export const calendarDayLabel = (cell: CalendarCell, selected: boolean) =>
  `${absoluteDateLong(cell.ts)}, ${cell.completed > 0 ? `${cell.completed} completed workout${cell.completed === 1 ? "" : "s"}` : "no completed workout"}${selected ? ", selected" : ""}`;

export const selectedDayLabel = (ts: number, n: number) =>
  `${absoluteDateLong(ts)} · ${n} completed workout${n === 1 ? "" : "s"}`;

// --- state copy (frozen History deck) -------------------------------------

export const HISTORY_COPY = {
  offline: "You’re offline. Your workout History remains available on this device.",
  readFailureTitle: "Couldn’t open your History",
  readFailure:
    "Nothing has been deleted, and your Plan and workouts are unaffected.",
  damagedTitle: "One record couldn’t be read",
  damaged: (n: number) =>
    `${n} saved workout${n === 1 ? "" : "s"} couldn’t be read, so ${n === 1 ? "it isn’t" : "they aren’t"} shown or counted. Everything else is here.`,
  emptyTitle: "No workouts completed yet",
  empty: "Finish your first workout to see your exercise history and progress here.",
  profileEmptyTitle: "No workouts for this profile",
  profileEmpty:
    "Workout history is stored on this device for each account or guest profile separately. Finish a workout to start this profile’s history.",
  storageEntry: "How History is stored",
  storageBody:
    "Workout History is stored on this device for this account or guest profile. It is not automatically transferred between profiles or devices.",
  whatCounts: [
    "Completed sets only (weight × reps)",
    "A set needs at least 1 rep to count",
    "Warm-up sets are stored but excluded",
    "Incomplete sets are stored but excluded",
    "Bodyweight sets add 0 to volume",
  ],
} as const;

/**
 * Renders a stored measurement with the owner's stored unit. There is no
 * conversion here by design: a value is displayed in the unit it was logged in,
 * so a single total can never mix kg and lb.
 */
export function performanceUnitSafe(value: number, unit: string): string {
  return `${value} ${unit}`;
}
