// Phase 2 — rest timer clock: wall-clock based, background-safe, never doubled.
import assert from "node:assert/strict";
import test from "node:test";

import {
  formatRemaining,
  isFinished,
  pauseClock,
  progress,
  remainingSec,
  resumeClock,
  setClockTotal,
  startClock,
} from "../src/anatomy/restClock";

const T0 = 1_800_000_000_000;

test("a fresh clock has the whole rest period left", () => {
  const c = startClock(90, T0);
  assert.equal(remainingSec(c, T0), 90);
  assert.equal(progress(c, T0), 1);
});

test("time spent in the background is accounted for on return", () => {
  const c = startClock(60, T0);
  // The app is backgrounded for 25s: no ticks run, but the clock moved on.
  assert.equal(remainingSec(c, T0 + 25_000), 35);
  // Recalculating again from the same state is stable — no drift, no double count.
  assert.equal(remainingSec(c, T0 + 25_000), 35);
});

test("a rest period that elapsed while backgrounded is finished, not frozen", () => {
  const c = startClock(60, T0);
  assert.equal(isFinished(c, T0 + 59_000), false);
  assert.equal(remainingSec(c, T0 + 120_000), 0);
  assert.equal(isFinished(c, T0 + 120_000), true);
  assert.equal(progress(c, T0 + 120_000), 0);
});

test("remaining time is never negative and never exceeds the total", () => {
  const c = startClock(30, T0);
  assert.equal(remainingSec(c, T0 + 10_000_000), 0);
  assert.equal(remainingSec(c, T0 - 10_000_000), 30);
});

test("pausing snapshots the remainder; resuming continues from there", () => {
  const running = startClock(60, T0);
  const paused = pauseClock(running, T0 + 20_000);
  assert.equal(remainingSec(paused, T0 + 20_000), 40);
  // Still 40 after two minutes paused — a paused timer must not drain.
  assert.equal(remainingSec(paused, T0 + 140_000), 40);
  const resumed = resumeClock(paused, T0 + 140_000);
  assert.equal(remainingSec(resumed, T0 + 140_000), 40);
  assert.equal(remainingSec(resumed, T0 + 150_000), 30);
});

test("pausing twice cannot compound", () => {
  const c = pauseClock(pauseClock(startClock(60, T0), T0 + 10_000), T0 + 50_000);
  assert.equal(remainingSec(c, T0 + 50_000), 50);
});

test("resuming a running clock is a no-op", () => {
  const c = startClock(60, T0);
  assert.equal(resumeClock(c, T0 + 5_000), c);
});

test("choosing a preset restarts the rest period from the new total", () => {
  const c = setClockTotal(startClock(60, T0), 120, T0 + 30_000);
  assert.equal(c.total, 120);
  assert.equal(remainingSec(c, T0 + 30_000), 120);
});

test("the display format is stable", () => {
  assert.equal(formatRemaining(90), "1:30");
  assert.equal(formatRemaining(5), "0:05");
  assert.equal(formatRemaining(-4), "0:00");
});
