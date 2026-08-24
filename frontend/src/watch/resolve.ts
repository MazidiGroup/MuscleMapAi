// Turning a spoken exercise name into an exact exercise id.
//
// This is the only place in the watch feature that deals with free text, and it
// is deliberately conservative. Reps and weights arrive as typed App Intent
// parameters, so a number is never parsed out of a sentence; an exercise name
// cannot be typed that way because the catalogue is 206 entries deep and grows,
// so it is matched here — with an explicit "ask, do not guess" rule.
//
// Two decisions carry the safety:
//
//   · The user's OWN workout is searched first, and if anything in it matches at
//     all the catalogue is not consulted. Saying "press" during a session that
//     contains one press means that press; it must not silently resolve to a
//     different one out of 206.
//   · A tie is an answer. When two candidates score the same, the result is
//     `ambiguous` and the caller asks. Picking the alphabetically-first match
//     would be indistinguishable from working correctly right up until it logs
//     a set against the wrong lift.
//
// Pure: the candidate lists are injected, so this is testable without loading
// the 330 KB catalogue.

import { ExerciseIdSpace } from "@/src/session/activeSession";

import { ExerciseChoice } from "./commands";

export type ResolvableExercise = {
  exerciseId: string;
  idSpace: ExerciseIdSpace;
  name: string;
  /** Gym slang for the same movement, e.g. "ohp" for the overhead press. */
  aliases?: string[];
};

export type ResolveResult =
  | { status: "resolved"; choice: ExerciseChoice }
  | { status: "ambiguous"; choices: ExerciseChoice[] }
  | { status: "unknown" };

/** Words a recogniser inserts that carry no identifying information. */
const FILLER = new Set(["the", "a", "an", "my", "to", "on", "of", "do", "some"]);

/**
 * Lowercase, unpunctuated, filler-free tokens. Hyphens become spaces so
 * "push-up" and "push up" are the same phrase, which matters because the
 * catalogue slugs are hyphenated and speech never is.
 */
export function normalizeSpoken(text: string): string[] {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w.length > 0 && !FILLER.has(w));
}

function phrase(text: string): string {
  return normalizeSpoken(text).join(" ");
}

/**
 * How well a candidate matches, 0 when it does not.
 *
 *   3 — the whole phrase is the candidate's name or one of its aliases;
 *   2 — the phrase is a contiguous part of the name ("bench" in "bench press");
 *   1 — every spoken word appears somewhere in the name, in any order.
 *
 * A partial word is never a match: "row" must not hit "narrow grip", which is
 * why comparison is on whole tokens rather than on substrings.
 */
export function matchScore(spokenPhrase: string, candidate: ResolvableExercise): number {
  const spokenTokens = spokenPhrase.split(" ").filter(Boolean);
  if (spokenTokens.length === 0) return 0;

  const namePhrase = phrase(candidate.name);
  if (namePhrase === spokenPhrase) return 3;
  for (const alias of candidate.aliases ?? []) {
    if (phrase(alias) === spokenPhrase) return 3;
  }

  const nameTokens = namePhrase.split(" ").filter(Boolean);
  const contiguous = nameTokens.join(" ").includes(spokenPhrase);
  if (contiguous && spokenTokens.length > 0) {
    // Guard against a one-letter fragment scoring on a long name.
    const wholeWords = spokenTokens.every((t) => nameTokens.includes(t));
    if (wholeWords) return 2;
  }

  const everyWordPresent = spokenTokens.every(
    (t) => nameTokens.includes(t) || (candidate.aliases ?? []).some((a) => phrase(a).split(" ").includes(t)),
  );
  return everyWordPresent ? 1 : 0;
}

function toChoice(c: ResolvableExercise): ExerciseChoice {
  return { exerciseId: c.exerciseId, idSpace: c.idSpace, name: c.name };
}

function best(spokenPhrase: string, candidates: readonly ResolvableExercise[]): ResolveResult | null {
  let top = 0;
  let winners: ResolvableExercise[] = [];
  for (const c of candidates) {
    const score = matchScore(spokenPhrase, c);
    if (score === 0) continue;
    if (score > top) {
      top = score;
      winners = [c];
    } else if (score === top) {
      winners.push(c);
    }
  }
  if (winners.length === 0) return null;

  // Two entries for the same exercise (the same id in the same space) are not a
  // tie — that is one exercise listed twice, so it resolves.
  const distinct = new Map(winners.map((w) => [`${w.idSpace}:${w.exerciseId}`, w]));
  const unique = [...distinct.values()];
  if (unique.length === 1) return { status: "resolved", choice: toChoice(unique[0]) };
  return { status: "ambiguous", choices: unique.map(toChoice) };
}

/**
 * Resolves against the active workout first, then the catalogue.
 *
 * `inSession` winning outright is what makes "log 8 reps on the press" safe
 * mid-workout: if the session holds exactly one press, the 206-entry catalogue
 * never gets a vote and cannot turn a clear instruction into a question.
 */
export function resolveExercise(
  spoken: string,
  inSession: readonly ResolvableExercise[],
  catalogue: readonly ResolvableExercise[] = [],
): ResolveResult {
  const spokenPhrase = phrase(spoken);
  if (!spokenPhrase) return { status: "unknown" };

  const sessionMatch = best(spokenPhrase, inSession);
  if (sessionMatch) return sessionMatch;

  const catalogueMatch = best(spokenPhrase, catalogue);
  if (catalogueMatch) return catalogueMatch;

  return { status: "unknown" };
}

/**
 * Caps how many options a clarification offers. A watch face cannot show eight
 * choices and a spoken list of eight is unusable, so past this many the caller
 * asks the user to be more specific instead.
 */
export const MAX_CLARIFY_CHOICES = 4;

export function clarifiable(choices: ExerciseChoice[]): ExerciseChoice[] {
  return choices.slice(0, MAX_CLARIFY_CHOICES);
}
