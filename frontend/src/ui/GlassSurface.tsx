import React from "react";
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";

import { useTheme } from "@/src/theme/ThemeContext";
import type { ThemeMode } from "@/src/theme/tokens";

export type GlassTone = "neutral" | "subtle" | "accent" | "danger";

/** Lightweight shared elevation for glass cards and controls. */
export function liquidShadow(mode: ThemeMode, raised = false): ViewStyle {
  return Platform.select<ViewStyle>({
    ios: {
      shadowColor: mode === "day" ? "#5b7191" : "#000000",
      shadowOpacity: raised ? (mode === "day" ? 0.18 : 0.34) : (mode === "day" ? 0.10 : 0.22),
      shadowRadius: raised ? 18 : 10,
      shadowOffset: { width: 0, height: raised ? 9 : 5 },
    },
    android: { elevation: raised ? 8 : 4 },
    web: {
      boxShadow: mode === "day"
        ? raised ? "0 14px 34px rgba(49,72,107,0.18)" : "0 7px 20px rgba(49,72,107,0.11)"
        : raised ? "0 18px 40px rgba(0,0,0,0.38)" : "0 8px 24px rgba(0,0,0,0.24)",
    } as ViewStyle,
    default: {},
  }) ?? {};
}

/**
 * Specular highlight for dense controls. It uses a gradient but no blur, so
 * exercise lists can contain many glass buttons without lag.
 *
 * It is ONLY a gradient. An earlier version also drew an inner hairline rim
 * and a 1 px specular band, both as absolutely-filled rectangles with no
 * corner radius. Inside a rounded, clipped container those rectangles showed
 * as straight lines along the flat edges that vanished at the corners — the
 * "thick and thin connected lines" effect — and stacked with the container's
 * own border to give three outlines of different weights. The parent alone
 * decides whether it has an outline.
 */
export function LiquidSheen({ tone = "neutral" }: { tone?: GlassTone }) {
  const { mode } = useTheme();
  // Every stop is WHITE, fading to fully transparent. Two earlier bugs came
  // from this gradient and both were colour, not geometry:
  //
  //  - the final stop used to be blue (rgba(14,75,178) / rgba(78,159,255)),
  //    left over from the pre-copper palette. It landed on the bottom-right
  //    corner of every copper control, so the fill turned muddy exactly where
  //    the curve is — reading as a dark line tracing the radius.
  //  - the opening stop was far too strong (0.76 white in Day), which put a
  //    bright patch behind whatever sat in the top-left corner.
  //
  // Fading to transparent white means the sheen can never tint a surface or
  // fight its edge: at the boundary it IS the surface colour.
  const peak = tone === "accent"
    ? mode === "day" ? 0.26 : 0.20
    : tone === "danger"
      ? 0.16
      : mode === "day" ? 0.30 : 0.085;
  const colors: [string, string, ...string[]] = [
    `rgba(255,255,255,${peak})`,
    `rgba(255,255,255,${(peak * 0.22).toFixed(4)})`,
    "rgba(255,255,255,0)",
  ];
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={colors}
        // Weighted early so the highlight is a soft falloff off the top-left
        // rather than a band with a visible edge mid-surface.
        locations={[0, 0.35, 0.85]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

/**
 * Native liquid-glass panel. Blur is reserved for larger panels and docks;
 * compact controls share LiquidSheen so the app stays smooth.
 */
export function GlassSurface({
  children,
  style,
  intensity = 34,
  tone = "neutral",
  testID,
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  tone?: GlassTone;
  testID?: string;
}) {
  const { T, mode } = useTheme();
  const fill = tone === "accent"
    ? T.accent + "DC"
    : tone === "danger"
      ? T.focusRedBg
      : tone === "subtle" ? T.cardAlt : T.card;
  // No outline by default: a panel is its fill, its blur and its shadow.
  // Callers add a border only for a selected or dangerous state.
  return (
    <View testID={testID} style={[styles.shell, { backgroundColor: fill }, liquidShadow(mode), style]}>
      <BlurView
        intensity={intensity}
        tint={mode === "day" ? "light" : "dark"}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <LiquidSheen tone={tone} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { overflow: "hidden" },
});
