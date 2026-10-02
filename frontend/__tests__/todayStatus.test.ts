// Today: the date strip marks completed days and dims rest days.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { completedDayIndexes, mondayIndex } from "../src/plan/weekStrip";

const ROOT = process.env.MMA_TEST_ROOT as string;
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), "utf8");

const at = (y: number, m: number, d: number, h = 18) => new Date(y, m - 1, d, h).getTime();
const set = (reps: number, done = true) => ({ weight: 40, reps, done });
const workout = (date: number, sets: { weight: number; reps: number; done: boolean }[]) => ({ date, exercises: [{ sets }] });

test("mondayIndex is Monday-first", () => {
  assert.equal(mondayIndex(at(2026, 9, 28)), 0, "Mon 28 Sep 2026");
  assert.equal(mondayIndex(at(2026, 10, 4)), 6, "Sun 4 Oct 2026");
});

test("only workouts with a countable set, inside this week, tick their day", () => {
  const weekStart = new Date(2026, 8, 28).getTime(); // Mon 28 Sep 2026, 00:00
  const done = completedDayIndexes(
    [
      workout(at(2026, 9, 28), [set(8)]), // Mon — counts
      workout(at(2026, 9, 30), [set(0)]), // Wed — 0 reps, never counts
      workout(at(2026, 10, 1), [set(8, false)]), // Thu — not ticked
      workout(at(2026, 10, 4, 23), [set(5)]), // Sun late — counts
      workout(at(2026, 9, 27), [set(8)]), // previous Sunday — outside
      workout(at(2026, 10, 5, 0), [set(8)]), // next Monday — outside
    ],
    weekStart,
  );
  assert.deepEqual([...done].sort(), [0, 6]);
});

test("the strip dims rest days, disables them, and names completed days", () => {
  const src = read("src/plan/PlanViews.tsx");
  const strip = src.slice(src.indexOf("function DateStrip"));
  assert.ok(strip.includes("disabled={day.rest}"), "a rest day is not presented as a control");
  assert.ok(strip.includes('(done ? ", completed" : "")'), "completion is in the accessible name");
  assert.ok(src.includes("doneDays={completedDayIndexes(w.history, weekStart)}"), "fed from completed History only");
});
