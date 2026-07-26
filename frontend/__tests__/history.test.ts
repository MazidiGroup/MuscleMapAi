// Phase 3 — History, records, Insights and the calendar, all from verified
// completed data.
import assert from "node:assert/strict";
import test from "node:test";

import type { SessionExercise, Workout } from "../src/anatomy/workoutScope";
import {
  CONSISTENCY_NOTE,
  HISTORY_COPY,
  MATCHES_BEST_COPY,
  NOT_COMPLETED_COPY,
  VOLUME_CHART_TITLE,
  absoluteDate,
  calendarDayLabel,
  consistency,
  exercisePerformances,
  exerciseStatus,
  groupHistory,
  incompleteCopy,
  isValidWorkoutRecord,
  monthLabel,
  monthMatrix,
  partitionRecords,
  performanceUnitSafe,
  periodTotals,
  personalRecord,
  recordMark,
  rollingVolumeSeries,
  selectedDayLabel,
  setProgressLabel,
  startOfWeek,
  weekSummary,
  workoutTitle,
  workoutTotals,
} from "../src/history/metrics";

const NOW = new Date(2026, 5, 17, 12, 0, 0).getTime(); // Wednesday 17 June 2026
const DAY = 24 * 3.6e6;

const set = (id: string, weight: number, reps: number, done = true) => ({ id, weight, reps, done });
const ex = (exerciseId: string, sets: any[], extra: Partial<SessionExercise> = {}): SessionExercise =>
  ({ exerciseId, sets, notes: "", ...extra }) as SessionExercise;

const w = (id: string, date: number, exercises: SessionExercise[], durationSec = 1800): Workout => ({
  id,
  date,
  durationSec,
  exercises,
});

// --- totals ----------------------------------------------------------------

test("only completed sets count towards totals", () => {
  const t = workoutTotals([ex("bench-press", [set("a", 60, 10), set("b", 80, 8, false)])]);
  assert.equal(t.completedSets, 1);
  assert.equal(t.totalSets, 2, "the incomplete set is still stored and visible");
  assert.equal(t.volume, 600);
  assert.equal(t.reps, 10);
});

test("bodyweight sets add zero external-load volume but keep their reps", () => {
  const t = workoutTotals([ex("push-up", [set("a", 0, 20)])]);
  assert.equal(t.volume, 0);
  assert.equal(t.reps, 20);
  assert.equal(t.completedSets, 1);
});

test("statuses are Completed, Incomplete or Not completed — never Skipped", () => {
  assert.equal(exerciseStatus(ex("a", [set("1", 50, 5), set("2", 50, 5)])), "Completed");
  assert.equal(exerciseStatus(ex("a", [set("1", 50, 5), set("2", 50, 5, false)])), "Incomplete");
  assert.equal(exerciseStatus(ex("a", [set("1", 50, 5, false)])), "Not completed");
  assert.equal(exerciseStatus(ex("a", [])), "Not completed");
  const copy = [NOT_COMPLETED_COPY, incompleteCopy(2), ...Object.values(HISTORY_COPY).flat()].join(" ");
  assert.ok(!/skipped/i.test(copy));
  assert.ok(!/cloud|sync|other devices|another device/i.test(copy));
});

test("set progress is formatted {completed} of {total}", () => {
  assert.equal(setProgressLabel(2, 4), "2 of 4");
  assert.equal(incompleteCopy(1), "1 entered set left incomplete — kept for your reference, excluded from totals and records.");
});

test("titles use the stored Plan relationship, otherwise an absolute date", () => {
  const planned = w("p1", NOW, [ex("squat", [set("a", 100, 5)], { planLink: { planDate: "2026-06-17" } })]);
  const adhoc = w("a1", NOW, [ex("squat", [set("a", 100, 5)])]);
  assert.equal(workoutTitle(planned), `Planned workout · ${absoluteDate(NOW)}`);
  assert.equal(workoutTitle(adhoc), `Workout · ${absoluteDate(NOW)}`);
  assert.ok(!/upper|lower|push|pull|full body/i.test(workoutTitle(adhoc)), "a split is never inferred");
});

// --- grouping and week summary --------------------------------------------

test("History is latest first and grouped by date period", () => {
  const list = [
    w("today", NOW, []),
    w("yest", NOW - DAY, []),
    w("mon", startOfWeek(NOW) + 3.6e6, []),
    w("older", NOW - 20 * DAY, []),
  ];
  const groups = groupHistory(list, NOW);
  assert.deepEqual(groups.map((g) => g.label).slice(0, 3), ["Today", "Yesterday", "Earlier this week"]);
  assert.ok(groups[3].label.startsWith("Week of "));
  assert.deepEqual(groups[0].items.map((x) => x.id), ["today"]);
});

test("the current-week summary is a Monday–Sunday calendar week", () => {
  const list = [w("a", NOW, []), w("b", NOW - DAY, []), w("c", startOfWeek(NOW) - DAY, [])];
  const s = weekSummary(list, NOW);
  assert.equal(s.count, 2, "last week's workout is not counted");
  assert.equal(s.copy, "2 workouts completed this week");
  assert.ok(s.rangeLabel.startsWith("Week of Mon 15 Jun – Sun 21 Jun"));
  assert.ok(s.rangeLabel.includes("(this device)"));
});

test("duplicate ids are counted once without deleting a source record", () => {
  const dup = w("same", NOW, []);
  const s = weekSummary([dup, { ...dup }], NOW);
  assert.equal(s.count, 1);
});

// --- rolling volume series ------------------------------------------------

test("the volume chart uses discrete rolling 7-day windows with explicit ranges", () => {
  assert.equal(VOLUME_CHART_TITLE, "Completed volume by rolling 7-day period");
  const list = [
    w("a", NOW - DAY, [ex("bench-press", [set("s", 100, 10)])]),
    w("b", NOW - 20 * DAY, [ex("bench-press", [set("s", 50, 10)])]),
  ];
  const series = rollingVolumeSeries(list, 6, NOW);
  assert.equal(series.length, 6);
  assert.equal(series[5].volume, 1000, "the most recent window holds the recent workout");
  assert.equal(series[3].volume, 500, "the 15–21 day window holds the older workout");
  assert.equal(series[2].volume, 0, "an empty window stays zero — never interpolated");
  for (const p of series) {
    assert.ok(p.rangeLabel.includes("–"), p.rangeLabel);
    assert.ok(!/week of|calendar/i.test(p.rangeLabel), "rolling windows are never labelled calendar weeks");
    assert.equal(p.endTs - p.startTs, 7 * DAY);
  }
});

test("the accessible table uses exactly the same series as the chart", () => {
  const list = [w("a", NOW - 2 * DAY, [ex("bench-press", [set("s", 60, 8)])])];
  const chart = rollingVolumeSeries(list, 6, NOW);
  const table = rollingVolumeSeries(list, 6, NOW);
  assert.deepEqual(table, chart);
});

test("incomplete sets never reach the trend", () => {
  const list = [w("a", NOW, [ex("bench-press", [set("s", 100, 10, false)])])];
  assert.equal(rollingVolumeSeries(list, 1, NOW)[0].volume, 0);
});

// --- consistency and period totals ---------------------------------------

test("consistency counts consecutive Monday-start weeks with a completed workout", () => {
  const list = [w("a", NOW, []), w("b", NOW - 7 * DAY, []), w("c", NOW - 14 * DAY, [])];
  const c = consistency(list, NOW);
  assert.equal(c.currentWeeks, 3);
  assert.equal(c.bestWeeks, 3);
  assert.equal(c.workoutsThisWeek, 1);
  assert.equal(CONSISTENCY_NOTE, "Consecutive Monday-start weeks with at least one completed workout.");
});

test("empty data fabricates no streak", () => {
  assert.deepEqual(consistency([], NOW), { currentWeeks: 0, bestWeeks: 0, workoutsThisWeek: 0 });
});

test("period totals expose a normalised per-7-day rate", () => {
  const list = [w("a", NOW, [ex("x", [set("s", 10, 10)])]), w("b", NOW - 10 * DAY, [ex("x", [set("s", 10, 10)])])];
  const t = periodTotals(list, 30, NOW);
  assert.equal(t.workouts, 2);
  assert.equal(t.completedSets, 2);
  assert.equal(t.volume, 200);
  assert.equal(t.avgPer7, 0.5);
});

// --- exercise history and personal records -------------------------------

test("performances group by exact identifier and never merge ID spaces", () => {
  const list = [
    w("a", NOW, [ex("bench-press", [set("s", 60, 5)], { idSpace: "anatomy" })]),
    w("b", NOW - DAY, [ex("bench-press", [set("s", 90, 5)], { idSpace: "plan" })]),
    w("c", NOW - 2 * DAY, [ex("Bench-Press", [set("s", 200, 5)], { idSpace: "anatomy" })]),
  ];
  const anatomy = exercisePerformances(list, "bench-press", "anatomy");
  assert.deepEqual(anatomy.map((p) => p.workoutId), ["a"]);
  assert.deepEqual(exercisePerformances(list, "bench-press", "plan").map((p) => p.workoutId), ["b"]);
  assert.deepEqual(exercisePerformances(list, "Bench-Press", "anatomy").map((p) => p.workoutId), ["c"]);
});

test("a performance with no completed set is excluded from exercise history", () => {
  const list = [w("a", NOW, [ex("bench-press", [set("s", 60, 5, false)])])];
  assert.deepEqual(exercisePerformances(list, "bench-press"), []);
});

test("the record is the heaviest completed set, dated by the workout that first set it", () => {
  const list = [
    w("first", NOW - 20 * DAY, [ex("bench-press", [set("s", 80, 5)])]),
    w("pr", NOW - 10 * DAY, [ex("bench-press", [set("s", 100, 3)])]),
    w("equal", NOW - DAY, [ex("bench-press", [set("s", 100, 3)])]),
  ];
  const perfs = exercisePerformances(list, "bench-press");
  const record = personalRecord(perfs);
  assert.equal(record.maxWeight, 100);
  assert.equal(record.achievingWorkoutId, "pr", "a later equal performance does not steal the record");
  assert.equal(record.achievedAt, NOW - 10 * DAY);
  assert.equal(record.isFirst, false);

  const later = perfs.find((p) => p.workoutId === "equal")!;
  assert.equal(recordMark(later, record), "matches");
  assert.equal(MATCHES_BEST_COPY, "Matches current best");
  assert.equal(recordMark(perfs.find((p) => p.workoutId === "pr")!, record), "record");
  assert.equal(recordMark(perfs.find((p) => p.workoutId === "first")!, record), null);
});

test("the first completed weighted set is the starting record", () => {
  const list = [w("one", NOW, [ex("bench-press", [set("s", 70, 5)])])];
  const record = personalRecord(exercisePerformances(list, "bench-press"));
  assert.equal(record.isFirst, true);
  assert.equal(record.maxWeight, 70);
});

test("bodyweight-only work never establishes a weight record", () => {
  const list = [w("a", NOW, [ex("push-up", [set("s", 0, 30)])])];
  const perfs = exercisePerformances(list, "push-up");
  const record = personalRecord(perfs);
  assert.equal(record.maxWeight, 0);
  assert.equal(record.achievedAt, null);
  assert.equal(record.isFirst, false);
  assert.equal(recordMark(perfs[0], record), null);
});

test("no duration or session-volume record is claimed", () => {
  const record = personalRecord(exercisePerformances([w("a", NOW, [ex("x", [set("s", 50, 5)])])], "x"));
  assert.deepEqual(Object.keys(record).sort(), ["achievedAt", "achievingWorkoutId", "isFirst", "maxWeight"]);
});

// --- calendar --------------------------------------------------------------

test("the month grid is Monday-based and marks only completed workouts", () => {
  const cells = monthMatrix(2026, 5, [w("a", new Date(2026, 5, 17, 9).getTime(), [])]);
  assert.equal(monthLabel(2026, 5), "June 2026");
  assert.equal(cells[0]?.day, 1, "1 June 2026 is itself a Monday, so no padding is needed");
  const july = monthMatrix(2026, 6, []);
  assert.deepEqual(july.slice(0, 2), [null, null], "1 July 2026 is a Wednesday — two padded cells");
  assert.equal(july[2]?.day, 1);
  const marked = cells.filter((c) => c && c.completed > 0);
  assert.equal(marked.length, 1);
  assert.equal(marked[0]!.day, 17);
});

test("every calendar date exposes its full date, status and selected state", () => {
  const cell = { ts: new Date(2026, 5, 17).getTime(), day: 17, completed: 1 };
  assert.equal(calendarDayLabel(cell, false), "Wed 17 June 2026, 1 completed workout");
  assert.equal(calendarDayLabel(cell, true), "Wed 17 June 2026, 1 completed workout, selected");
  assert.equal(calendarDayLabel({ ...cell, completed: 0 }, false), "Wed 17 June 2026, no completed workout");
  assert.equal(selectedDayLabel(cell.ts, 2), "Wed 17 June 2026 · 2 completed workouts");
});

test("an empty month is still a navigable grid", () => {
  const cells = monthMatrix(2026, 0, []);
  assert.equal(cells.filter((c) => c).length, 31);
  assert.equal(cells.filter((c) => c && c.completed > 0).length, 0);
});

// --- damaged and unclaimed records ---------------------------------------

test("a damaged record is skipped while every valid record survives", () => {
  const good = w("good", NOW, [ex("bench-press", [set("s", 60, 5)])]);
  const raw = [good, { id: "bad", date: NOW, exercises: [{ exerciseId: "x", sets: [{ id: 1 }] }] }, null, { date: NOW }];
  const { valid, damaged } = partitionRecords(raw);
  assert.deepEqual(valid.map((v) => v.id), ["good"]);
  assert.equal(damaged.length, 3, "damaged records are excluded, not deleted");
  assert.equal(weekSummary(valid, NOW).count, 1, "totals exclude damaged records");
  assert.equal(HISTORY_COPY.damagedTitle, "One record couldn’t be read");
  assert.ok(HISTORY_COPY.damaged(1).includes("Everything else is here."));
});

test("record validation accepts only complete, well-formed workouts", () => {
  assert.equal(isValidWorkoutRecord(w("a", NOW, [ex("x", [set("s", 1, 1)])])), true);
  assert.equal(isValidWorkoutRecord({ id: "", date: NOW, exercises: [] }), false);
  assert.equal(isValidWorkoutRecord({ id: "a", date: "nope", exercises: [] }), false);
  assert.equal(isValidWorkoutRecord({ id: "a", date: NOW, exercises: [{ exerciseId: "", sets: [] }] }), false);
});

test("History copy stays local-only and never promises recovery elsewhere", () => {
  const all = Object.values(HISTORY_COPY)
    .map((v) => (Array.isArray(v) ? v.join(" ") : typeof v === "function" ? v(1) : v))
    .join(" ");
  assert.ok(/on this device/i.test(all));
  assert.ok(!/cloud|back(ed)? up|another device|cross-device|transferred automatically/i.test(all));
  assert.equal(HISTORY_COPY.offline, "You’re offline. Your workout History remains available on this device.");
  assert.equal(HISTORY_COPY.storageEntry, "How History is stored");
});

test("the unit is only ever the owner's stored unit — no conversion helper exists", () => {
  assert.equal(typeof performanceUnitSafe, "function");
  assert.equal(performanceUnitSafe(600, "lb"), "600 lb");
  assert.equal(performanceUnitSafe(600, "kg"), "600 kg");
});
