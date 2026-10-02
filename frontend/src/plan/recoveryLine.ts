// One line on the Today card: are the muscles today's workout trains
// recovered? Read from computeRecovery()'s per-group output and reduced to the
// day's PRIMARY groups through the same node → group mapping the recovery
// engine uses, so the line can never disagree with the Insights heat map.
//
// Pure logic — no React, no storage.

import { primaryGroupsOf } from "@/src/anatomy/sessionGroups";

export { primaryGroupsOf };

/** Structural slice of computeRecovery()'s GroupRecovery. */
export type GroupRecoveryLike = {
  group: string;
  label: string;
  state: string;
  hoursLeft: number;
  lastTs: number | null;
};

export type RecoveryLine = {
  /** "ready" when nothing today trains is still recovering; otherwise the worst state present. */
  tone: "ready" | "recovering" | "fatigued";
  text: string;
};

/** Hours as the card says them: "~5 h", or "~2 days" past a day and a half. */
function hoursLabel(h: number): string {
  return h >= 36 ? `~${Math.round(h / 24)} days` : `~${Math.max(1, Math.round(h))} h`;
}

/**
 * The line for today's groups, or null when there is nothing honest to say:
 * no training history at all, or no groups for the day. A group with no
 * completed work on record is fresh, so it counts as ready.
 */
export function recoveryLine(todayGroups: readonly string[], groups: readonly GroupRecoveryLike[]): RecoveryLine | null {
  if (todayGroups.length === 0) return null;
  if (!groups.some((g) => g.lastTs !== null)) return null;

  const byKey = new Map(groups.map((g) => [g.group, g]));
  const pending = todayGroups
    .map((k) => byKey.get(k))
    .filter((g): g is GroupRecoveryLike => !!g && (g.state === "fatigued" || g.state === "recovering"))
    .sort((a, b) => b.hoursLeft - a.hoursLeft);

  if (pending.length === 0) {
    return {
      tone: "ready",
      text: todayGroups.length === 1 ? "Recovered and ready to train" : "Every muscle today trains is recovered",
    };
  }

  const tone = pending.some((g) => g.state === "fatigued") ? "fatigued" : "recovering";
  const named = pending.slice(0, 2).map((g) => `${g.label} ${hoursLabel(g.hoursLeft)}`);
  const more = pending.length > 2 ? ` +${pending.length - 2} more` : "";
  return { tone, text: `Still recovering: ${named.join(", ")}${more}` };
}
