// Anatomy-trainer theme tokens.
//
// This file exports the dark palette `T` plus `legacyPalette()`, which the
// screens call (via useMemo) so their existing `T.*` references keep working.
// There is no day variant: light mode is not part of the approved design.

import type { ThemeMode } from "@/src/theme/tokens";

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
  bone: string;
  muscle: string;
  primary: string;
  secondary: string;
};

const NIGHT_T: LegacyPalette = {
  bg: "#070A0F",
  bg2: "#0C111A",
  surface: "#121826",
  surfaceHi: "#18202F",
  border: "rgba(120,160,220,0.16)",
  borderHi: "rgba(120,160,220,0.30)",
  text: "#EAF1FB",
  textDim: "#9AA7BD",
  textFaint: "#5E6B82",
  accent: "#34C7FF",
  accentDim: "#1E9BFF",
  bone: "#E8E1CE",
  muscle: "#C0584F",
  primary: "#FF4438",
  secondary: "#FFB020",
};


/**
 * The legacy-shaped palette. The app ships one theme (night); the parameter is
 * kept so the existing `legacyPalette(mode)` call sites stay untouched, and
 * there is no light variant to return.
 */
export function legacyPalette(_mode?: ThemeMode): LegacyPalette {
  return NIGHT_T;
}

// Backward-compatible default (night) for screens not yet theme-aware.
export const T: LegacyPalette = NIGHT_T;

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
