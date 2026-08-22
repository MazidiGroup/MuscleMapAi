// Semantic design tokens — Direction B, Phase 1.
//
// Single source of truth for status/focus/disabled/elevation/typography/target
// roles layered on top of the existing `tokens.ts` palettes. Colour values for
// the night theme are taken from the frozen State System authority palette
// (`MuscleMapAI State System.dc.html`): ok #3DDC97, warn #FFB020, err #EF4444.
//
// Screens must read these through `useSemanticTokens()`. Nothing here changes
// the production font — typography roles only carry
// size/weight/line-height, never a family.

import { useMemo } from "react";

import { useTheme } from "./ThemeContext";
import { Palette, R, S, ThemeMode } from "./tokens";

export type StatusRole = "info" | "success" | "warning" | "error";

export type StatusColors = {
  /** icon + title colour */
  fg: string;
  /** body text colour on top of `bg` */
  text: string;
  /** container fill */
  bg: string;
  /** container border */
  border: string;
};

export type SemanticTokens = {
  mode: ThemeMode;
  palette: Palette;
  color: {
    bg: string;
    surface: string;
    surfaceAlt: string;
    border: string;
    borderSubtle: string;
    text: string;
    textSecondary: string;
    textMuted: string;
    textFaint: string;
    accent: string;
    accentSoft: string;
    onAccent: string;
    focusRing: string;
    scrim: string;
    skeletonBase: string;
    skeletonHighlight: string;
  };
  status: Record<StatusRole, StatusColors>;
  space: typeof S;
  radius: { sm: number; md: number; lg: number; xl: number; xxl: number; pill: number };
  /** Size/weight/line-height only — family is inherited from the platform. */
  type: {
    title: { fontSize: number; fontWeight: "800"; lineHeight: number };
    heading: { fontSize: number; fontWeight: "800"; lineHeight: number };
    subheading: { fontSize: number; fontWeight: "700"; lineHeight: number };
    body: { fontSize: number; fontWeight: "500"; lineHeight: number };
    bodyStrong: { fontSize: number; fontWeight: "600"; lineHeight: number };
    caption: { fontSize: number; fontWeight: "500"; lineHeight: number };
    label: { fontSize: number; fontWeight: "700"; lineHeight: number };
  };
  elevation: {
    none: Record<string, never>;
    card: { borderWidth: number; borderColor: string };
    raised: { borderWidth: number; borderColor: string };
  };
  state: {
    disabledOpacity: number;
    pressedOpacity: number;
    focusRingWidth: number;
  };
  /** Minimum interactive target, per the accessibility contract. */
  target: { min: number; comfortable: number };
};

const NIGHT_STATUS: Record<StatusRole, StatusColors> = {
  info: { fg: "#8fd0ff", text: "#c7d6ef", bg: "rgba(47,141,255,0.10)", border: "rgba(47,141,255,0.34)" },
  success: { fg: "#3DDC97", text: "#c7d6ef", bg: "rgba(61,220,151,0.10)", border: "rgba(61,220,151,0.34)" },
  warning: { fg: "#FFB020", text: "#f2e0b8", bg: "rgba(255,176,32,0.12)", border: "rgba(255,176,32,0.40)" },
  error: { fg: "#EF4444", text: "#fca5a5", bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.42)" },
};

const DAY_STATUS: Record<StatusRole, StatusColors> = {
  info: { fg: "#175cbf", text: "#293750", bg: "rgba(40,120,232,0.08)", border: "rgba(40,120,232,0.24)" },
  success: { fg: "#087a50", text: "#225846", bg: "rgba(8,122,80,0.08)", border: "rgba(8,122,80,0.24)" },
  warning: { fg: "#9a5a00", text: "#68471c", bg: "rgba(154,90,0,0.08)", border: "rgba(154,90,0,0.24)" },
  error: { fg: "#c73535", text: "#6f3030", bg: "rgba(199,53,53,0.08)", border: "rgba(199,53,53,0.24)" },
};


export function semanticTokens(palette: Palette): SemanticTokens {
  return {
    mode: palette.mode,
    palette,
    color: {
      bg: palette.bg,
      surface: palette.card,
      surfaceAlt: palette.cardAlt,
      border: palette.border,
      borderSubtle: palette.borderDashed,
      text: palette.text,
      textSecondary: palette.text2,
      textMuted: palette.textMuted,
      textFaint: palette.textFaint,
      accent: palette.accent,
      accentSoft: palette.accentText,
      onAccent: palette.ctaText,
      focusRing: palette.accent,
      scrim: palette.mode === "day" ? "rgba(35,42,54,0.35)" : "rgba(2,5,11,0.62)",
      skeletonBase: palette.mode === "day" ? "#e3e7ee" : palette.card,
      skeletonHighlight: palette.mode === "day" ? "#f7f9fc" : palette.cardAlt,
    },
    status: palette.mode === "day" ? DAY_STATUS : NIGHT_STATUS,
    space: S,
    radius: { sm: R.sm, md: R.md, lg: R.lg, xl: 20, xxl: 24, pill: R.pill },
    type: {
      title: { fontSize: 24, fontWeight: "800", lineHeight: 30 },
      heading: { fontSize: 19, fontWeight: "800", lineHeight: 24 },
      subheading: { fontSize: 15, fontWeight: "700", lineHeight: 20 },
      body: { fontSize: 13, fontWeight: "500", lineHeight: 20 },
      bodyStrong: { fontSize: 13, fontWeight: "600", lineHeight: 20 },
      caption: { fontSize: 11.5, fontWeight: "500", lineHeight: 17 },
      label: { fontSize: 12, fontWeight: "700", lineHeight: 16 },
    },
    elevation: {
      none: {},
      card: { borderWidth: 1, borderColor: palette.border },
      raised: { borderWidth: 1, borderColor: palette.accent },
    },
    state: { disabledOpacity: 0.55, pressedOpacity: 0.8, focusRingWidth: 2 },
    target: { min: 44, comfortable: 52 },
  };
}

export function useSemanticTokens(): SemanticTokens {
  const { T } = useTheme();
  return useMemo(() => semanticTokens(T), [T]);
}
