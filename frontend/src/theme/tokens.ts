// Design tokens for the Muscle Map redesign (graphite + copper, Aug 2026).
//
// The app supports three persisted appearance modes. Day is a warm paper
// canvas; Night is a warm near-black premium treatment; Dim sits between them
// for evening use. Screens should never hard-code theme colours — always read
// them through `useTheme()`.
//
// COLOUR ROLES — each hue means exactly one thing, so nothing competes:
//   accent (copper)   brand, interactive, selected
//   pr     (violet)   a personal record — the only celebratory colour
//   ok     (green)    a completed set, defined in semantic.ts
//   primary/secondary anatomy legend ONLY (prime mover / assists), see ui.ts
// Warm-ups and superset chrome are deliberately neutral: they are states, not
// achievements, and tinting them competes with the copper accent.

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
  accent: string;         // copper — brand and interactive
  accentText: string;     // link colour on top of the page background
  gradFrom: string;
  gradTo: string;
  ctaText: string;        // text on top of the accent
  // semantic
  pr: string;             // personal record / celebration
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
  bg: "#0d0b0a",
  bgRadialFrom: "#2a211b",
  bgRadialTo: "#0d0b0a",
  card: "rgba(30,26,23,0.78)",
  cardAlt: "rgba(46,40,35,0.60)",
  border: "rgba(240,228,215,0.14)",
  borderDashed: "rgba(240,228,215,0.09)",
  text: "#faf7f4",
  text2: "#d6cec6",
  textMuted: "#a2988e",
  textFaint: "#776e66",
  textCaps: "#e39a5c",
  accent: "#e39a5c",
  accentText: "#f2c39a",
  gradFrom: "#f5c08c",
  gradTo: "#d0783a",
  ctaText: "#17100a",
  pr: "#a78bfa",
  focusRed: "#ff7a6b",
  focusRedBg: "rgba(255,110,95,0.12)",
  posterBg: "#ffffff",
  bodyIdle: "#3a322c",
  bodyStroke: "#6a5f55",
  bodyNeutral: "#3a322c",
};

const DIM: Palette = {
  mode: "dim",
  bg: "#1b1917",
  bgRadialFrom: "#33291f",
  bgRadialTo: "#1b1917",
  card: "rgba(48,43,39,0.76)",
  cardAlt: "rgba(62,56,50,0.58)",
  border: "rgba(238,229,220,0.15)",
  borderDashed: "rgba(238,229,220,0.10)",
  text: "#f7f4f1",
  text2: "#d2cac2",
  textMuted: "#9e958c",
  textFaint: "#7a716a",
  textCaps: "#d2884e",
  accent: "#d2884e",
  accentText: "#eebd93",
  gradFrom: "#edb88a",
  gradTo: "#be7239",
  ctaText: "#150f0a",
  pr: "#9e8bf5",
  focusRed: "#ff8474",
  focusRedBg: "rgba(255,132,116,0.12)",
  posterBg: "#f8f6f3",
  bodyIdle: "#4a423b",
  bodyStroke: "#75695f",
  bodyNeutral: "#4a423b",
};

const DAY: Palette = {
  mode: "day",
  bg: "#f6f3f0",
  bgRadialFrom: "#efe7df",
  bgRadialTo: "#f6f3f0",
  card: "rgba(255,255,255,0.82)",
  cardAlt: "rgba(255,255,255,0.55)",
  border: "rgba(60,48,40,0.14)",
  borderDashed: "rgba(60,48,40,0.10)",
  text: "#1b1714",
  text2: "#4a423b",
  textMuted: "#71675e",
  textFaint: "#9a8f85",
  textCaps: "#a5551f",
  accent: "#b4622c",
  accentText: "#8f4a1e",
  gradFrom: "#e0a070",
  gradTo: "#b4622c",
  ctaText: "#ffffff",
  pr: "#6d5bd0",
  focusRed: "#c0392b",
  focusRedBg: "rgba(192,57,43,0.10)",
  posterBg: "#ffffff",
  bodyIdle: "#d6ccc2",
  bodyStroke: "#a89c90",
  bodyNeutral: "#d6ccc2",
};


export const PALETTES: Record<ThemeMode, Palette> = { day: DAY, night: NIGHT, dim: DIM };
export const DEFAULT_MODE: ThemeMode = "night";

/** Common spacing scale (8 pt grid). */
export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

/**
 * Border radii.
 *
 * One family of curves. A 44 pt control is a circle at radius 22, and every
 * large panel uses that same 22 so a card and a button read as the same
 * material. Only genuinely tiny chrome (inputs, pills inside a row) steps
 * down, and capsule controls go fully round.
 */
export const R = { sm: 12, md: 16, lg: 22, xl: 22, pill: 999 };
/** Radius for a 44 pt square control — a true circle. */
export const CONTROL_RADIUS = 22;
/** Radius for cards, panels and prompt boxes. */
export const CARD_RADIUS = 22;
/** Bottom sheets and full-screen modals carry a slightly larger top curve. */
export const SHEET_RADIUS = 28;
