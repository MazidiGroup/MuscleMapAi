// Rest timer clock — wall-clock based so backgrounding cannot freeze or double it.
//
// The timer stores an ABSOLUTE end timestamp instead of counting interval ticks.
// A tick only re-reads the clock, so time that passes while the app is in the
// background is accounted for, and returning to the foreground recalculates the
// remaining time from elapsed wall-clock time. Pausing snapshots the remainder.
//
// Pure logic — no React, no timers.

export type RestClock = {
  /** Total selected rest, in seconds. */
  total: number;
  /** Absolute epoch ms when rest ends. Ignored while paused. */
  endsAt: number;
  /** Remaining seconds captured at the moment of pausing; null while running. */
  pausedRemaining: number | null;
};

export function startClock(total: number, now: number): RestClock {
  return { total, endsAt: now + total * 1000, pausedRemaining: null };
}

/** Whole seconds left, never negative, never above `total`. */
export function remainingSec(clock: RestClock, now: number): number {
  if (clock.pausedRemaining !== null) return clamp(clock.pausedRemaining, clock.total);
  return clamp(Math.ceil((clock.endsAt - now) / 1000), clock.total);
}

export function isFinished(clock: RestClock, now: number): boolean {
  return remainingSec(clock, now) <= 0;
}

export function pauseClock(clock: RestClock, now: number): RestClock {
  if (clock.pausedRemaining !== null) return clock;
  return { ...clock, pausedRemaining: remainingSec(clock, now) };
}

export function resumeClock(clock: RestClock, now: number): RestClock {
  if (clock.pausedRemaining === null) return clock;
  return { total: clock.total, endsAt: now + clock.pausedRemaining * 1000, pausedRemaining: null };
}

/** Choosing a preset restarts the rest period from the new total. */
export function setClockTotal(clock: RestClock, total: number, now: number): RestClock {
  return { total, endsAt: now + total * 1000, pausedRemaining: clock.pausedRemaining === null ? null : total };
}

export function formatRemaining(seconds: number): string {
  const s = Math.max(0, seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function progress(clock: RestClock, now: number): number {
  if (clock.total <= 0) return 0;
  return clamp(remainingSec(clock, now), clock.total) / clock.total;
}

function clamp(value: number, total: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), Math.max(total, 0));
}
