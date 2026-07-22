// Anatomy-trainer theme tokens.
//
// Historically this file exported a single dark palette `T`. To support the
// app-wide Day/Night mode we now expose BOTH a night and a day variant with
// the SAME keys, plus `legacyPalette(mode)` which the screens call (via
// useMemo) so their existing `T.*` references simply flip colours.

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

const DAY_T: LegacyPalette = {
  bg: "#eef2f9",
  bg2: "#ffffff",
  surface: "#ffffff",
  surfaceHi: "#eaf0fa",
  border: "rgba(40,80,140,0.16)",
  borderHi: "rgba(40,80,140,0.28)",
  text: "#0c1424",
  textDim: "#42506c",
  textFaint: "#8090af",
  accent: "#1E9BFF",
  accentDim: "#1877d6",
  bone: "#C8A96A",
  muscle: "#C0584F",
  primary: "#E23B30",
  secondary: "#E09415",
};

/** Returns the legacy-shaped palette for the given theme mode. */
export function legacyPalette(mode: "night" | "day"): LegacyPalette {
  return mode === "day" ? DAY_T : NIGHT_T;
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
