import React from "react";
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { BlurView } from "expo-blur";

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
export function LiquidSheen(_: { tone?: GlassTone }) {
  // Deliberately renders nothing.
  //
  // The diagonal white sheen read as a gradient wash across every card, button
  // and menu surface, and on Dim and Night it was worse than on Day: a few
  // percent of white over a near-black fill is exactly where banding shows. A
  // surface is now its fill, its blur and its shadow — nothing else.
  //
  // Kept as a no-op rather than deleted from its nine call sites so the change
  // is one line to reverse if the sheen is ever wanted back.
  return null;
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
