// The command vocabulary shared by the watch's buttons and its voice actions.
//
// There is exactly ONE path from an intention to a change: a `WorkoutCommand`
// goes into `applyCommand` (see ./session) and either produces events or is
// refused. Siri does not get a shortcut past the rules, and the touch controls
// do not get a second, slightly different copy of them. That is the point of
// this module — App Intents and SwiftUI are adapters that build a command and
// render the outcome, nothing more.
//
// The outcome type carries the safety property the feature lives or dies on: a
// command that is ambiguous or invalid returns `clarify`/`refused`, and NEITHER
// carries a snapshot or an event. It is structurally impossible for a
// misheard command to write a set — there is nothing in those branches to write.
//
// Pure types and pure helpers. No React, no storage, no speech.

import { ExerciseIdSpace } from "@/src/session/activeSession";
import { WeightUnit } from "@/src/units/unitPreference";

import { MAX_REPS, MAX_WEIGHT, MIN_REPS, WatchEvent, WeightValue } from "./protocol";

// ---------------------------------------------------------------------------
// Commands.
// ---------------------------------------------------------------------------

/**
 * `logSet` with no weight inherits the working weight — that inheritance is the
 * entire reason the feature is usable one-handed. "Log 8 reps" is the common
 * case; "log 8 reps at 85 kilos" changes the working weight and logs the set as
 * one command, never as two that can half-fail.
 */
export type WorkoutCommand =
  | { kind: "startWorkout"; planDate?: string }
  | { kind: "pauseWorkout" }
  | { kind: "resumeWorkout" }
  | { kind: "selectExercise"; exerciseId: string; idSpace: ExerciseIdSpace }
  | { kind: "nextExercise" }
  | { kind: "previousExercise" }
  | { kind: "setWeight"; weight: WeightValue }
  | { kind: "logSet"; reps: number; weight?: WeightValue; warmup?: boolean }
  | { kind: "reviseLastSet"; reps?: number; weight?: WeightValue }
  | { kind: "undoLastSet"; confirmed?: boolean }
  | { kind: "endWorkout" };

export type CommandKind = WorkoutCommand["kind"];

/** Commands that can change stored work. Used by the entitlement gate. */
export const MUTATING_COMMANDS: CommandKind[] = [
  "startWorkout",
  "selectExercise",
  "logSet",
  "reviseLastSet",
  "undoLastSet",
  "endWorkout",
];

export function isMutatingCommand(kind: CommandKind): boolean {
  return MUTATING_COMMANDS.includes(kind);
}

// ---------------------------------------------------------------------------
// Feedback.
// ---------------------------------------------------------------------------

/**
 * Every command answers with feedback, including the ones that do nothing.
 * Silence after a voice command is indistinguishable from a command that was
 * never heard, which is exactly when a user logs the same set twice.
 *
 * `speech` is what Siri says back and what the watch shows; `haptic` names a
 * WatchKit haptic the native layer plays. Localisation happens at the adapter,
 * so these are copy keys plus already-formatted values, never raw sentences
 * assembled in the UI.
 */
export type FeedbackTone = "success" | "warning" | "error";

/** Maps to WKHapticType on the watch. Named by meaning, not by API constant. */
export type HapticCue = "success" | "retry" | "failure" | "click" | "start" | "stop";

export type Feedback = {
  tone: FeedbackTone;
  haptic: HapticCue;
  /** One concise line — spoken by Siri and shown on the watch. */
  message: string;
};

export const HAPTIC_FOR_TONE: Record<FeedbackTone, HapticCue> = {
  success: "success",
  warning: "retry",
  error: "failure",
};

export function feedback(tone: FeedbackTone, message: string, haptic?: HapticCue): Feedback {
  return { tone, haptic: haptic ?? HAPTIC_FOR_TONE[tone], message };
}

// ---------------------------------------------------------------------------
// Outcomes.
// ---------------------------------------------------------------------------

export type RefusalReason =
  | "not_entitled"
  | "no_session"
  | "session_already_running"
  | "no_exercise_selected"
  | "no_exercise_in_session"
  | "reps_out_of_range"
  | "weight_out_of_range"
  | "nothing_to_undo"
  | "nothing_to_revise"
  | "needs_confirmation";

/** One candidate when a spoken name matched more than one exercise. */
export type ExerciseChoice = { exerciseId: string; idSpace: ExerciseIdSpace; name: string };

/**
 * The three ways a command can end.
 *
 * `applied` is the only branch with a snapshot or events. `clarify` asks the
 * user a question — an ambiguous exercise name, a missing rep count — and
 * `refused` states why nothing happened. Neither can write.
 */
export type CommandOutcome =
  | { status: "applied"; snapshot: WatchSnapshotLike; events: WatchEvent[]; feedback: Feedback }
  | { status: "clarify"; feedback: Feedback; choices: ExerciseChoice[] }
  | { status: "refused"; reason: RefusalReason; feedback: Feedback };

/**
 * Structural placeholder so this module stays free of a circular import back to
 * ./session, which owns the concrete snapshot shape.
 */
export type WatchSnapshotLike = { schema: number; sessionId: string | null };

export function refuse(reason: RefusalReason, message: string, tone: FeedbackTone = "warning"): CommandOutcome {
  return { status: "refused", reason, feedback: feedback(tone, message) };
}

export function clarify(message: string, choices: ExerciseChoice[] = []): CommandOutcome {
  return { status: "clarify", feedback: feedback("warning", message), choices };
}

// ---------------------------------------------------------------------------
// Copy. Localisation-ready: one key per situation, values interpolated here.
// ---------------------------------------------------------------------------

/**
 * A confirmation always names the exercise, the reps and the load, because the
 * one failure mode voice logging cannot recover from is the user believing a
 * different set was saved than the one that was.
 */
export function confirmSetLine(exerciseName: string, reps: number, weight: number, unit: WeightUnit, warmup = false): string {
  const load = weight > 0 ? `${formatLoadNumber(weight)} ${unit}` : "bodyweight";
  return `${warmup ? "Warm-up: " : ""}${reps} reps at ${load}, ${exerciseName}.`;
}

/** Trims the trailing zeros a converted load picks up (85.0 kg reads wrong). */
export function formatLoadNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return String(Math.round(value * 100) / 100);
}

export const WATCH_COPY = {
  noSession: "Start a workout first, then I can log that set.",
  sessionRunning: "That workout is already running.",
  noExercise: "Pick an exercise first, then say how many reps.",
  emptySession: "There are no exercises in this workout yet. Add one on your iPhone or from the list.",
  repsOutOfRange: `Reps need to be a whole number between ${MIN_REPS} and ${MAX_REPS}.`,
  weightOutOfRange: (unit: WeightUnit) => `That weight is outside the range I can log — up to ${MAX_WEIGHT[unit]} ${unit}.`,
  nothingToUndo: "There is nothing to undo in this workout.",
  nothingToRevise: "There is no set to change yet.",
  ambiguousExercise: (spoken: string) => `More than one exercise matches "${spoken}". Which one?`,
  unknownExercise: (spoken: string) => `I could not find "${spoken}" in this workout or the exercise library.`,
  confirmUndo: (description: string) => `Undo ${description}?`,
  undone: (description: string) => `Undone: ${description}.`,
  paused: "Workout paused.",
  resumed: "Workout resumed.",
  ended: "Workout finished and saved to your iPhone.",
  started: "Workout started.",
  weightSet: (weight: number, unit: WeightUnit) => `Working weight is now ${formatLoadNumber(weight)} ${unit}.`,
  selected: (name: string) => `${name}.`,
  lockedTitle: "Apple Watch logging is part of Premium",
  lockedBody: "Start a workout on your iPhone to see how it works, or upgrade there to log from your wrist.",
  offlineSaved: "Saved on your watch. It will reach your iPhone when they reconnect.",
} as const;
