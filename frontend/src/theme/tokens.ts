// Design tokens for the Muscle Map AI redesign (July 2026 workout-builder pack).
//
// The app supports three persisted appearance modes. Day is a cool, soft-light
// canvas; Night is the high-contrast premium treatment; Dim reduces contrast
// for evening use without going fully black. Screens should never hard-code
// theme colours — always read them through `useTheme()`.

export type ThemeMode = "day" | "night" | "dim";

export type Palette = {
  mode: ThemeMode;
  // page
  bg: string;             // solid page background
  bgRadialFrom: string;   // radial gradient inner (used behind cards)
  bgRadialTo: string;     // radial gradient outer
  // surfaces
  card: string;           // card fill
  cardAlt: string;        // secondary card fill (nested / rest days)
  border: string;         // 1 px card border
  borderDashed: string;   // dashed rest / cool-down border
  // text
  text: string;           // primary
  text2: string;          // secondary (body)
  textMuted: string;      // captions
  textFaint: string;      // 4th-tier
  textCaps: string;       // 11 px label-caps
  // accents
  accent: string;         // solid #2f8dff
  accentText: string;     // link colour on top of dark bg
  gradFrom: string;       // "#8fd0ff"
  gradTo: string;         // "#2f8dff"
  ctaText: string;        // text on top of gradient
  // semantic
  focusRed: string;
  focusRedBg: string;
  posterBg: string;       // neutral exercise-art backing for the current mode
  // body-map (onboarding step 5)
  bodyIdle: string;
  bodyStroke: string;
  bodyNeutral: string;
};

const NIGHT: Palette = {
  mode: "night",
  bg: "#070a10",
  bgRadialFrom: "#182844",
  bgRadialTo: "#070a10",
  card: "rgba(22,28,39,0.76)",
  cardAlt: "rgba(34,42,56,0.58)",
  border: "rgba(205,225,255,0.15)",
  borderDashed: "rgba(205,225,255,0.10)",
  text: "#f7f9fd",
  text2: "#cbd3df",
  textMuted: "#98a3b4",
  textFaint: "#697589",
  textCaps: "#85b9ff",
  accent: "#4e9fff",
  accentText: "#b5d6ff",
  gradFrom: "#a8d9ff",
  gradTo: "#397eff",
  ctaText: "#06101f",
  focusRed: "#ff6b6b",
  focusRedBg: "rgba(255,90,90,0.12)",
  posterBg: "#ffffff",
  bodyIdle: "#29364e",
  bodyStroke: "#536780",
  bodyNeutral: "#29364e",
};

const DIM: Palette = {
  mode: "dim",
  bg: "#151920",
  bgRadialFrom: "#293449",
  bgRadialTo: "#151920",
  card: "rgba(42,48,61,0.74)",
  cardAlt: "rgba(54,61,76,0.56)",
  border: "rgba(220,232,255,0.15)",
  borderDashed: "rgba(220,232,255,0.10)",
  text: "#f5f6f8",
  text2: "#c8ccd4",
  textMuted: "#989eaa",
  textFaint: "#707784",
  textCaps: "#8fbcff",
  accent: "#69acff",
  accentText: "#bad7ff",
  gradFrom: "#b8dcff",
  gradTo: "#5798f1",
  ctaText: "#07111f",
  focusRed: "#ff7878",
  focusRedBg: "rgba(255,120,120,0.12)",
  posterBg: "#f7f8fb",
  bodyIdle: "#3c475b",
  bodyStroke: "#66738a",
  bodyNeutral: "#3c475b",
};

const DAY: Palette = {
  mode: "day",
  bg: "#edf3fb",
  bgRadialFrom: "#dceaff",
  bgRadialTo: "#edf3fb",
  card: "rgba(255,255,255,0.76)",
  cardAlt: "rgba(255,255,255,0.48)",
  border: "rgba(55,80,116,0.15)",
  borderDashed: "rgba(55,80,116,0.11)",
  text: "#111827",
  text2: "#3a4658",
  textMuted: "#647086",
  textFaint: "#8b96a8",
  textCaps: "#2768c8",
  accent: "#2479ea",
  accentText: "#175cbf",
  gradFrom: "#69b7ff",
  gradTo: "#246bd2",
  ctaText: "#ffffff",
  focusRed: "#d94343",
  focusRedBg: "rgba(217,67,67,0.10)",
  posterBg: "#ffffff",
  bodyIdle: "#b7c5d8",
  bodyStroke: "#8292aa",
  bodyNeutral: "#b7c5d8",
};


export const PALETTES: Record<ThemeMode, Palette> = { day: DAY, night: NIGHT, dim: DIM };
export const DEFAULT_MODE: ThemeMode = "night";

/** Common spacing scale (8 pt grid). */
export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
/** Border radii scale. */
export const R = { sm: 8, md: 12, lg: 16, xl: 18, pill: 999 };
