// Anatomy-trainer theme tokens.
//
// Existing anatomy-shaped tokens are projected from the same live palette as
// the rest of the app, keeping older screens visually connected.
import { DEFAULT_MODE, PALETTES, type ThemeMode } from "@/src/theme/tokens";

export type LegacyPalette = {
  bg: string;
  bg2: string;
  surface: string;
  /** Opaque card fill — for cards that overlap. */
  surfaceSolid: string;
  surfaceHi: string;
  border: string;
  borderHi: string;
  text: string;
  textDim: string;
  textFaint: string;
  accent: string;
  accentDim: string;
  /** Personal record / celebration. Never the anatomy legend. */
  pr: string;
  bone: string;
  muscle: string;
  primary: string;
  secondary: string;
};

export function legacyPalette(mode: ThemeMode = DEFAULT_MODE): LegacyPalette {
  const p = PALETTES[mode];
  return {
    bg: p.bg,
    bg2: p.cardAlt,
    surface: p.card,
    surfaceSolid: p.cardSolid,
    surfaceHi: p.cardAlt,
    border: p.border,
    borderHi: mode === "day" ? "rgba(45,34,27,0.20)" : "rgba(255,244,235,0.20)",
    text: p.text,
    textDim: p.textMuted,
    textFaint: p.textFaint,
    accent: p.accent,
    accentDim: p.accentText,
    pr: p.pr,
    bone: "#E8E1CE",
    muscle: "#C0584F",
    // ANATOMY LEGEND ONLY — prime mover / assists on the 3D model, always shown
    // beside their key. These are not UI colours and must not be borrowed for
    // buttons, badges or state, or they compete with the copper accent.
    primary: "#FF4438",
    secondary: "#FFB020",
  };
}

export const T: LegacyPalette = legacyPalette(DEFAULT_MODE);

/**
 * The copper ramp — five tonal steps from the idle body (#3a322c) to the
 * brightest gradient stop. It encodes AMOUNT (sets on the share card), never
 * identity: red / amber / green stay with the recovery and role legends.
 */
export const COPPER_RAMP = ["#3a322c", "#6b4a33", "#9c6136", "#d0783a", "#f5c08c"] as const;

/** Ramp step for a count against a maximum: idle at zero, brightest at the max, any work above idle. */
export function copperForCount(count: number, max: number): string {
  if (count <= 0 || max <= 0) return COPPER_RAMP[0];
  const step = Math.ceil((Math.min(count, max) / max) * (COPPER_RAMP.length - 1));
  return COPPER_RAMP[Math.max(1, step)];
}
