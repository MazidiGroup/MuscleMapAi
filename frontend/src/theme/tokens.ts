// Design tokens for the Muscle Map AI redesign (July 2026 workout-builder pack).
//
// Two themes: `night` (default, dark radial) and `day` (light). Colours,
// borders, and shadow values are the authoritative palette from the design
// hand-off. Screens should NEVER hard-code colours — always read via
// `useTheme()` so day/night flips work app-wide.

export type ThemeMode = "night" | "day";

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
  posterBg: string;       // always white
  // body-map (onboarding step 5)
  bodyIdle: string;
  bodyStroke: string;
  bodyNeutral: string;
};

const NIGHT: Palette = {
  mode: "night",
  bg: "#04060c",
  bgRadialFrom: "#0e1729",
  bgRadialTo: "#070c16",
  card: "#0f172b",
  cardAlt: "#0d1526",
  border: "#1e2b48",
  borderDashed: "#1a2540",
  text: "#eef4ff",
  text2: "#c7d6ef",
  textMuted: "#8b9bb8",
  textFaint: "#5c6b88",
  textCaps: "#5c8fd6",
  accent: "#2f8dff",
  accentText: "#8fd0ff",
  gradFrom: "#8fd0ff",
  gradTo: "#2f8dff",
  ctaText: "#06101f",
  focusRed: "#ff6b6b",
  focusRedBg: "rgba(255,90,90,0.12)",
  posterBg: "#ffffff",
  bodyIdle: "#2c3f65",
  bodyStroke: "#4a6288",
  bodyNeutral: "#2c3f65",
};

const DAY: Palette = {
  mode: "day",
  bg: "#e9eff9",
  bgRadialFrom: "#f7faff",
  bgRadialTo: "#e9eff9",
  card: "#ffffff",
  cardAlt: "#f2f6fd",
  border: "#d3dff0",
  borderDashed: "#d3dff0",
  text: "#0c1424",
  text2: "#2c3c58",
  textMuted: "#5a6b8c",
  textFaint: "#8090af",
  textCaps: "#2f6fc4",
  accent: "#2f8dff",
  accentText: "#1d6fd6",
  gradFrom: "#8fd0ff",
  gradTo: "#2f8dff",
  ctaText: "#06101f",
  focusRed: "#d84848",
  focusRedBg: "rgba(216,72,72,0.10)",
  posterBg: "#ffffff",
  bodyIdle: "#c3d2ea",
  bodyStroke: "#a9bedd",
  bodyNeutral: "#cfdaec",
};

export const PALETTES: Record<ThemeMode, Palette> = { night: NIGHT, day: DAY };
export const DEFAULT_MODE: ThemeMode = "night";

/** Common spacing scale (8 pt grid). */
export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
/** Border radii scale. */
export const R = { sm: 8, md: 12, lg: 16, xl: 18, pill: 999 };
