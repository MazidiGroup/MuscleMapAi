// Anatomy-trainer theme tokens.
//
// Existing anatomy-shaped tokens are projected from the same live palette as
// the rest of the app, keeping older screens visually connected.
import { DEFAULT_MODE, PALETTES, type ThemeMode } from "@/src/theme/tokens";

export type LegacyPalette = {
  bg: string;
  bg2: string;
  surface: string;
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

export const GROUP_COLORS: Record<string, string> = {
  chest: "#FF6B5E",
  back: "#5EA8FF",
  shoulders: "#FFB020",
  arms: "#B98BFF",
  forearms: "#8B9BFF",
  core: "#FF5EA8",
  glutes: "#FF8A3D",
  quads: "#3DDC97",
  hamstrings: "#36C5C0",
  adductors: "#9DD63D",
  calves: "#E0C341",
};
