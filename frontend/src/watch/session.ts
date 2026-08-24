// The watch's live session state, and the one reducer that changes it.
//
// `applyCommand` is the whole business layer of the feature. A tap on the watch
// and "log 8 reps" through Siri build the same `WorkoutCommand` and arrive here,
// so there is exactly one implementation of every rule — the rep range, the
// inherited weight, the undo confirmation, the entitlement check — and no way
// for the two interaction paths to drift apart.
//
// It is a pure function of (snapshot, command, deps) → outcome. It performs no
// I/O: persisting the new snapshot and queueing the events it returns is the
// caller's job (see ./outbox), which is what makes "the set is saved" a claim
// the watch only makes after the write actually happened.
//
// Two details worth stating outright:
//
//   · The working weight carries its own unit rather than a bare number. Saying
//     "85 kilograms" while the app displays pounds stores 85 kg and shows 187
//     lb; it does not relabel 85 as pounds. This is the same rule the phone
//     already applies to stored loads, and it is here for the same reason —
//     relabelling silently restates every load as roughly double.
//   · Pausing does NOT change the duration the phone records. Duration is
//     wall-clock from `startedAt` and feeds the longest-workout record, so a
//     watch-side pause that shortened it would quietly rewrite a personal
//     record. Pause holds the rest timer and the live readout; the recorded
//     session is still the time from start to finish.

import { ExerciseIdSpace } from "@/src/session/activeSession";
import { RestClock, pauseClock, resumeClock, startClock } from "@/src/anatomy/restClock";
import { WeightUnit } from "@/src/units/unitPreference";
import { convertWeight, displayWeight } from "@/src/units/weight";

import {
  CommandOutcome,
  ExerciseChoice,
  Feedback,
  WATCH_COPY,
  WorkoutCommand,
  confirmSetLine,
  feedback,
  isMutatingCommand,
  refuse,
} from "./commands";
import { ACCESS_COPY, WatchEntitlement, watchAccess } from "./gate";
import {
  WATCH_SCHEMA_VERSION,
  WatchEvent,
  WatchEventKind,
  WatchEventPayload,
  WatchSource,
  WeightValue,
  isValidReps,
  isValidWeight,
  mintId,
} from "./protocol";

// ---------------------------------------------------------------------------
// State.
// ---------------------------------------------------------------------------

export type WatchSetView = {
  setId: string;
  reps: number;
  weight: WeightValue;
  warmup: boolean;
  /** Undone sets are kept as tombstones so a retry cannot resurrect them. */
  voided: boolean;
  /** 0 until edited. The phone keeps the highest revision it has seen. */
  revision: number;
  source: WatchSource;
  at: number;
};

export type WatchExerciseView = {
  exerciseId: string;
  idSpace: ExerciseIdSpace;
  name: string;
  /** The plan's rep target, or 0 when the plan did not give one. */
  targetReps: number;
  sets: WatchSetView[];
};

export type LastAction =
  | { kind: "logged"; exerciseIndex: number; setId: string; description: string }
  | {
      kind: "revised";
      exerciseIndex: number;
      setId: string;
      previous: { reps: number; weight: WeightValue; warmup: boolean };
      description: string;
    };

export type WatchSnapshot = {
  schema: number;
  sessionId: string | null;
  startedAt: number | null;
  /** Display preference mirrored from the phone. Loads keep their own units. */
  unit: WeightUnit;
  exercises: WatchExerciseView[];
  currentIndex: number;
  /** What the next set inherits when no weight is spoken. */
  workingWeight: WeightValue;
  /** The user's rest preference, in seconds. */
  restSeconds: number;
  rest: RestClock | null;
  paused: boolean;
  /** Next `seq` to mint. Monotonic for the life of the session. */
  seq: number;
  /**
   * When THIS watch was granted access for this session. Non-null is the only
   * thing that extends access through a lapsed or unreachable entitlement, and
   * it is set solely by a command that passed a live check.
   */
  grantedAt: number | null;
  lastAction: LastAction | null;
};

export const DEFAULT_REST_SECONDS = 90;

export function emptySnapshot(unit: WeightUnit = "kg"): WatchSnapshot {
  return {
    schema: WATCH_SCHEMA_VERSION,
    sessionId: null,
    startedAt: null,
    unit,
    exercises: [],
    currentIndex: 0,
    workingWeight: { value: 0, unit },
    restSeconds: DEFAULT_REST_SECONDS,
    rest: null,
    paused: false,
    seq: 0,
    grantedAt: null,
    lastAction: null,
  };
}

// ---------------------------------------------------------------------------
// Derived reads. The watch UI renders from these, never from raw fields.
// ---------------------------------------------------------------------------

export function currentExercise(s: WatchSnapshot): WatchExerciseView | null {
  if (s.exercises.length === 0) return null;
  const i = Math.min(Math.max(s.currentIndex, 0), s.exercises.length - 1);
  return s.exercises[i];
}

/** Sets that count toward the visible set number — tombstones do not. */
export function liveSets(e: WatchExerciseView | null): WatchSetView[] {
  return (e?.sets ?? []).filter((x) => !x.voided);
}

/** The set number the user is about to record, 1-based. */
export function nextSetNumber(s: WatchSnapshot): number {
  return liveSets(currentExercise(s)).length + 1;
}

/** The working weight as it should be shown, converted into the display unit. */
export function displayedWorkingWeight(s: WatchSnapshot): number {
  return displayWeight(s.workingWeight.value, s.workingWeight.unit, s.unit, s.unit);
}

/** The most recent live set anywhere in the session — what "the last set" means. */
export function lastLoggedSet(s: WatchSnapshot): { exerciseIndex: number; set: WatchSetView } | null {
  let found: { exerciseIndex: number; set: WatchSetView } | null = null;
  s.exercises.forEach((e, exerciseIndex) => {
    for (const set of e.sets) {
      if (set.voided) continue;
      if (!found || set.at > found.set.at) found = { exerciseIndex, set };
    }
  });
  return found;
}

// ---------------------------------------------------------------------------
// Reducer.
// ---------------------------------------------------------------------------

export type ApplyDeps = {
  now: number;
  entitlement: WatchEntitlement;
  /** Where the command came from. Recorded on every set this command writes. */
  source?: WatchSource;
  /** Display name for an exercise id. Injected so this module stays pure. */
  nameOf?: (exerciseId: string, idSpace: ExerciseIdSpace) => string | undefined;
};

function nameFor(s: WatchSnapshot, e: WatchExerciseView | null): string {
  return e?.name || "this exercise";
}

function applied(snapshot: WatchSnapshot, events: WatchEvent[], fb: Feedback): CommandOutcome {
  return { status: "applied", snapshot, events, feedback: fb };
}

function event(
  s: WatchSnapshot,
  kind: WatchEventKind,
  payload: WatchEventPayload,
  deps: ApplyDeps,
  seq: number,
): WatchEvent {
  return {
    schema: WATCH_SCHEMA_VERSION,
    eventId: mintId("ev", () => deps.now),
    sessionId: s.sessionId ?? "",
    seq,
    at: deps.now,
    source: deps.source ?? "watch.ui",
    kind,
    payload,
  };
}

/**
 * The single entry point for every change the watch makes.
 *
 * Note what the refusal branches do NOT return: a snapshot, or an event. A
 * misheard or out-of-range command cannot write, because the branch that would
 * write is not reachable from it.
 */
export function applyCommand(snapshot: WatchSnapshot, command: WorkoutCommand, deps: ApplyDeps): CommandOutcome {
  if (isMutatingCommand(command.kind)) {
    const decision = watchAccess(deps.entitlement, {
      now: deps.now,
      sessionGranted: snapshot.grantedAt !== null,
    });
    if (!decision.allow) {
      return refuse("not_entitled", ACCESS_COPY[decision.basis] || WATCH_COPY.lockedTitle, "error");
    }
  }

  switch (command.kind) {
    case "startWorkout":
      return start(snapshot, deps);
    case "pauseWorkout":
      return pause(snapshot, deps);
    case "resumeWorkout":
      return resume(snapshot, deps);
    case "selectExercise":
      return select(snapshot, command.exerciseId, command.idSpace, deps);
    case "nextExercise":
      return step(snapshot, +1, deps);
    case "previousExercise":
      return step(snapshot, -1, deps);
    case "setWeight":
      return setWeight(snapshot, command.weight, deps);
    case "logSet":
      return logSet(snapshot, command, deps);
    case "reviseLastSet":
      return reviseLastSet(snapshot, command, deps);
    case "undoLastSet":
      return undoLastSet(snapshot, command.confirmed === true, deps);
    case "endWorkout":
      return endWorkout(snapshot, deps);
    default:
      return refuse("no_session", WATCH_COPY.noSession);
  }
}

// --- individual commands ----------------------------------------------------

function start(s: WatchSnapshot, deps: ApplyDeps): CommandOutcome {
  if (s.sessionId) return refuse("session_already_running", WATCH_COPY.sessionRunning);
  const sessionId = mintId("s", () => deps.now);
  const next: WatchSnapshot = {
    ...s,
    sessionId,
    startedAt: deps.now,
    seq: 1,
    grantedAt: deps.now,
    paused: false,
    rest: null,
    lastAction: null,
  };
  const ev = event({ ...next, sessionId }, "session.start", { startedAt: deps.now }, deps, 0);
  return applied(next, [ev], feedback("success", WATCH_COPY.started, "start"));
}

function pause(s: WatchSnapshot, deps: ApplyDeps): CommandOutcome {
  if (!s.sessionId) return refuse("no_session", WATCH_COPY.noSession);
  const next: WatchSnapshot = {
    ...s,
    paused: true,
    rest: s.rest ? pauseClock(s.rest, deps.now) : null,
  };
  return applied(next, [], feedback("success", WATCH_COPY.paused, "stop"));
}

function resume(s: WatchSnapshot, deps: ApplyDeps): CommandOutcome {
  if (!s.sessionId) return refuse("no_session", WATCH_COPY.noSession);
  const next: WatchSnapshot = {
    ...s,
    paused: false,
    rest: s.rest ? resumeClock(s.rest, deps.now) : null,
  };
  return applied(next, [], feedback("success", WATCH_COPY.resumed, "start"));
}

/**
 * Selecting an exercise that is not yet in the session appends it, so "start
 * bench press at 80 kilos" works on an empty session without a second command.
 * Position is never identity: the exercise is found by id and id space.
 */
function select(s: WatchSnapshot, exerciseId: string, idSpace: ExerciseIdSpace, deps: ApplyDeps): CommandOutcome {
  if (!s.sessionId) return refuse("no_session", WATCH_COPY.noSession);

  const existing = s.exercises.findIndex((e) => e.exerciseId === exerciseId && e.idSpace === idSpace);
  if (existing >= 0) {
    const next = { ...s, currentIndex: existing };
    return applied(next, [], feedback("success", WATCH_COPY.selected(s.exercises[existing].name), "click"));
  }

  const name = deps.nameOf?.(exerciseId, idSpace) || exerciseId;
  const view: WatchExerciseView = { exerciseId, idSpace, name, targetReps: 0, sets: [] };
  const next: WatchSnapshot = {
    ...s,
    exercises: [...s.exercises, view],
    currentIndex: s.exercises.length,
    seq: s.seq + 1,
  };
  const ev = event(s, "exercise.add", { exerciseId, idSpace }, deps, s.seq);
  return applied(next, [ev], feedback("success", WATCH_COPY.selected(name), "click"));
}

function step(s: WatchSnapshot, delta: number, deps: ApplyDeps): CommandOutcome {
  if (!s.sessionId) return refuse("no_session", WATCH_COPY.noSession);
  if (s.exercises.length === 0) return refuse("no_exercise_in_session", WATCH_COPY.emptySession);
  const index = Math.min(Math.max(s.currentIndex + delta, 0), s.exercises.length - 1);
  const target = s.exercises[index];
  // Moving to a new exercise clears the inherited load: the last exercise's
  // weight is not a sensible default for the next one, and a wrong prefilled
  // number asserts where a blank one asks.
  const carried = index === s.currentIndex ? s.workingWeight : lastWeightFor(target, s.unit);
  const next = { ...s, currentIndex: index, workingWeight: carried, rest: null };
  return applied(next, [], feedback("success", WATCH_COPY.selected(target.name), "click"));
}

/** An exercise's own most recent load, so returning to it restores its weight. */
function lastWeightFor(e: WatchExerciseView, unit: WeightUnit): WeightValue {
  const live = e.sets.filter((x) => !x.voided);
  const last = live.length ? live[live.length - 1] : null;
  return last ? last.weight : { value: 0, unit };
}

function setWeight(s: WatchSnapshot, weight: WeightValue, deps: ApplyDeps): CommandOutcome {
  if (!s.sessionId) return refuse("no_session", WATCH_COPY.noSession);
  if (!isValidWeight(weight?.value, weight?.unit)) {
    return refuse("weight_out_of_range", WATCH_COPY.weightOutOfRange(weight?.unit ?? s.unit));
  }
  const next = { ...s, workingWeight: weight };
  const shown = displayWeight(weight.value, weight.unit, s.unit, s.unit);
  return applied(next, [], feedback("success", WATCH_COPY.weightSet(shown, s.unit), "click"));
}

/**
 * The command the whole feature exists for.
 *
 * An explicit weight updates the working weight AND logs the set as one
 * indivisible step: there is a single returned snapshot, so "log 8 reps at 85
 * kilos" can never land as a weight change whose set failed to save.
 */
function logSet(
  s: WatchSnapshot,
  command: { reps: number; weight?: WeightValue; warmup?: boolean },
  deps: ApplyDeps,
): CommandOutcome {
  if (!s.sessionId) return refuse("no_session", WATCH_COPY.noSession);
  const exercise = currentExercise(s);
  if (!exercise) return refuse("no_exercise_selected", WATCH_COPY.emptySession);
  if (!isValidReps(command.reps)) return refuse("reps_out_of_range", WATCH_COPY.repsOutOfRange);

  const explicit = command.weight;
  if (explicit !== undefined && !isValidWeight(explicit?.value, explicit?.unit)) {
    return refuse("weight_out_of_range", WATCH_COPY.weightOutOfRange(explicit?.unit ?? s.unit));
  }
  const weight = explicit ?? s.workingWeight;

  const setId = mintId("set", () => deps.now);
  const set: WatchSetView = {
    setId,
    reps: command.reps,
    weight,
    warmup: command.warmup === true,
    voided: false,
    revision: 0,
    source: deps.source ?? "watch.ui",
    at: deps.now,
  };

  const index = s.exercises.indexOf(exercise);
  const exercises = s.exercises.map((e, i) => (i === index ? { ...e, sets: [...e.sets, set] } : e));
  const shown = displayWeight(weight.value, weight.unit, s.unit, s.unit);
  const description = confirmSetLine(exercise.name, set.reps, shown, s.unit, set.warmup);

  const next: WatchSnapshot = {
    ...s,
    exercises,
    workingWeight: weight,
    seq: s.seq + 1,
    rest: startClock(s.restSeconds, deps.now),
    paused: false,
    lastAction: { kind: "logged", exerciseIndex: index, setId, description },
  };

  const ev = event(
    s,
    "set.log",
    {
      setId,
      exerciseId: exercise.exerciseId,
      idSpace: exercise.idSpace,
      reps: set.reps,
      weight,
      ...(set.warmup ? { warmup: true } : {}),
    },
    deps,
    s.seq,
  );
  return applied(next, [ev], feedback("success", description));
}

function reviseLastSet(
  s: WatchSnapshot,
  command: { reps?: number; weight?: WeightValue },
  deps: ApplyDeps,
): CommandOutcome {
  if (!s.sessionId) return refuse("no_session", WATCH_COPY.noSession);
  const target = lastLoggedSet(s);
  if (!target) return refuse("nothing_to_revise", WATCH_COPY.nothingToRevise);

  const reps = command.reps ?? target.set.reps;
  const weight = command.weight ?? target.set.weight;
  if (!isValidReps(reps)) return refuse("reps_out_of_range", WATCH_COPY.repsOutOfRange);
  if (!isValidWeight(weight?.value, weight?.unit)) {
    return refuse("weight_out_of_range", WATCH_COPY.weightOutOfRange(weight?.unit ?? s.unit));
  }

  const previous = { reps: target.set.reps, weight: target.set.weight, warmup: target.set.warmup };
  const revision = target.set.revision + 1;
  const exercises = s.exercises.map((e, i) =>
    i !== target.exerciseIndex
      ? e
      : { ...e, sets: e.sets.map((x) => (x.setId === target.set.setId ? { ...x, reps, weight, revision } : x)) },
  );

  const exercise = s.exercises[target.exerciseIndex];
  const shown = displayWeight(weight.value, weight.unit, s.unit, s.unit);
  const description = confirmSetLine(exercise.name, reps, shown, s.unit, target.set.warmup);

  const next: WatchSnapshot = {
    ...s,
    exercises,
    workingWeight: weight,
    seq: s.seq + 1,
    lastAction: {
      kind: "revised",
      exerciseIndex: target.exerciseIndex,
      setId: target.set.setId,
      previous,
      description,
    },
  };
  const ev = event(
    s,
    "set.revise",
    {
      setId: target.set.setId,
      revision,
      reps,
      weight,
      ...(target.set.warmup ? { warmup: true } : {}),
    },
    deps,
    s.seq,
  );
  return applied(next, [ev], feedback("success", description));
}

/**
 * Undo, with a confirmation step that is a REFUSAL rather than a pending state.
 *
 * Returning `needs_confirmation` means nothing has been queued and nothing is
 * half-done — the adapter (App Intents' confirmation prompt, or a watch dialog)
 * asks, and a confirmed command comes back through the same path. A pending
 * "about to undo" state on the watch would be one crash away from silently
 * deleting a set the user never confirmed.
 */
function undoLastSet(s: WatchSnapshot, confirmed: boolean, deps: ApplyDeps): CommandOutcome {
  if (!s.sessionId) return refuse("no_session", WATCH_COPY.noSession);
  const action = s.lastAction;
  if (!action) return refuse("nothing_to_undo", WATCH_COPY.nothingToUndo);
  if (!confirmed) return refuse("needs_confirmation", WATCH_COPY.confirmUndo(action.description));

  if (action.kind === "logged") {
    const exercises = s.exercises.map((e, i) =>
      i !== action.exerciseIndex
        ? e
        : { ...e, sets: e.sets.map((x) => (x.setId === action.setId ? { ...x, voided: true } : x)) },
    );
    const next: WatchSnapshot = { ...s, exercises, seq: s.seq + 1, rest: null, lastAction: null };
    const ev = event(s, "set.void", { setId: action.setId }, deps, s.seq);
    return applied(next, [ev], feedback("success", WATCH_COPY.undone(action.description)));
  }

  // Undoing an edit restores the previous values as a further revision, so the
  // phone converges on them by the same highest-revision-wins rule.
  const restored = action.previous;
  let revision = 1;
  const exercises = s.exercises.map((e, i) =>
    i !== action.exerciseIndex
      ? e
      : {
          ...e,
          sets: e.sets.map((x) => {
            if (x.setId !== action.setId) return x;
            revision = x.revision + 1;
            return { ...x, reps: restored.reps, weight: restored.weight, warmup: restored.warmup, revision };
          }),
        },
  );
  const next: WatchSnapshot = {
    ...s,
    exercises,
    workingWeight: restored.weight,
    seq: s.seq + 1,
    lastAction: null,
  };
  const ev = event(
    s,
    "set.revise",
    {
      setId: action.setId,
      revision,
      reps: restored.reps,
      weight: restored.weight,
      ...(restored.warmup ? { warmup: true } : {}),
    },
    deps,
    s.seq,
  );
  return applied(next, [ev], feedback("success", WATCH_COPY.undone(action.description)));
}

function endWorkout(s: WatchSnapshot, deps: ApplyDeps): CommandOutcome {
  if (!s.sessionId) return refuse("no_session", WATCH_COPY.noSession);
  const ev = event(s, "session.end", { endedAt: deps.now }, deps, s.seq);
  // The snapshot is cleared, but the events keep the session id they were minted
  // with, so a backlog that syncs after the workout ended still lands correctly.
  const next: WatchSnapshot = { ...emptySnapshot(s.unit), restSeconds: s.restSeconds };
  return applied(next, [ev], feedback("success", WATCH_COPY.ended, "stop"));
}

// ---------------------------------------------------------------------------
// Crown / button helpers, shared with the SwiftUI controls.
// ---------------------------------------------------------------------------

/**
 * The next weight one crown detent away, expressed in the display unit and
 * converted back into the working weight's own unit so repeated nudges cannot
 * drift the stored value through rounding.
 */
export function nudgeWeight(s: WatchSnapshot, steps: number, increment: number): WeightValue {
  const shown = displayedWorkingWeight(s);
  const target = Math.max(0, shown + steps * increment);
  if (s.workingWeight.unit === s.unit) return { value: target, unit: s.unit };
  return { value: convertWeight(target, s.unit, s.workingWeight.unit), unit: s.workingWeight.unit };
}

/** Options a clarification offers, capped for a watch-sized list. */
export function sessionChoices(s: WatchSnapshot): ExerciseChoice[] {
  return s.exercises.map((e) => ({ exerciseId: e.exerciseId, idSpace: e.idSpace, name: e.name }));
}

export { nameFor };
