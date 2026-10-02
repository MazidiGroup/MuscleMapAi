// Today: the date strip marks completed days and dims rest days, and the
// card says whether what today trains is recovered.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { primaryGroupsOf, recoveryLine } from "../src/plan/recoveryLine";
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

// --- recovery line ---------------------------------------------------------------

const grp = (group: string, state: string, hoursLeft = 0, lastTs: number | null = 1) => ({
  group,
  label: group[0].toUpperCase() + group.slice(1),
  state,
  hoursLeft,
  lastTs,
});

test("no history means no recovery line — nothing is invented", () => {
  assert.equal(recoveryLine(["quads"], [grp("quads", "untrained", 0, null)]), null);
  assert.equal(recoveryLine([], [grp("quads", "ready")]), null, "rest day / empty day");
});

test("all of today's groups recovered (untracked counts as fresh)", () => {
  const line = recoveryLine(["quads", "calves"], [grp("quads", "ready"), grp("calves", "untrained", 0, null), grp("chest", "fatigued", 30)]);
  assert.deepEqual(line, { tone: "ready", text: "Every muscle today trains is recovered" });
});

test("still-recovering groups are named, longest wait first, capped at two", () => {
  const line = recoveryLine(
    ["quads", "hamstrings", "glutes", "calves"],
    [grp("quads", "recovering", 5), grp("hamstrings", "fatigued", 40), grp("glutes", "recovering", 12), grp("calves", "ready")],
  );
  assert.deepEqual(line, { tone: "fatigued", text: "Still recovering: Hamstrings ~2 days, Glutes ~12 h +1 more" });
});

test("today's groups come from the engine's node → group mapping", () => {
  assert.deepEqual(primaryGroupsOf("bench-press"), ["chest"]);
  assert.deepEqual(primaryGroupsOf("no-such-exercise", "quads"), ["quads"]);
});

test("the Today card shows the line and reads the same engine as Insights", () => {
  const src = read("src/plan/PlanViews.tsx");
  assert.ok(src.includes('testID="today-recovery"'));
  assert.ok(src.includes("computeRecovery(w.history).groups"));
});
