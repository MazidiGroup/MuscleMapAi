import React, { useEffect, useRef } from "react";
import { Animated, Platform, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useReducedMotion } from "@/src/components/useReducedMotion";
import { ThemeMode } from "@/src/theme/tokens";
import { useTheme } from "@/src/theme/ThemeContext";
import { GlassSurface, LiquidSheen } from "@/src/ui/GlassSurface";
import { ScalePressable } from "@/src/ui/ScalePressable";

const OPTIONS: { value: ThemeMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: "day", label: "Day", icon: "sunny-outline" },
  { value: "night", label: "Night", icon: "moon-outline" },
  { value: "dim", label: "Dim", icon: "contrast-outline" },
];

export function ThemeSwitcher({
  compact = false,
  style,
}: {
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { mode, setMode, T } = useTheme();
  const reduceMotion = useReducedMotion();
  // The reference switcher squashes the selected option horizontally and lets
  // it settle. Reduce Motion turns the animation off, never the selection.
  const squash = useRef(new Animated.Value(1)).current;
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (reduceMotion) return;
    Animated.sequence([
      Animated.timing(squash, { toValue: 1.1, duration: 110, useNativeDriver: true }),
      Animated.spring(squash, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true }),
    ]).start();
  }, [mode, reduceMotion, squash]);

  return (
    <GlassSurface
      style={[styles.track, compact ? styles.trackCompact : styles.trackFull, style]}
      intensity={compact ? 26 : 38}
    >
      {OPTIONS.map((option) => {
        const active = mode === option.value;
        return (
          <ScalePressable
            key={option.value}
            style={styles.item}
            onPress={() => setMode(option.value)}
            accessibilityRole="radio"
            accessibilityLabel={`${option.label} appearance`}
            accessibilityState={{ selected: active, checked: active }}
            {...(Platform.OS === "web" ? ({ "aria-checked": active } as any) : {})}
            testID={`theme-${option.value}`}
          >
            <View style={styles.itemContent}>
              {active ? (
                <Animated.View
                  style={[
                    StyleSheet.absoluteFill,
                    styles.active,
                    { backgroundColor: T.accent, transform: [{ scaleX: squash }] },
                  ]}
                >
                  <LiquidSheen tone="accent" />
                </Animated.View>
              ) : null}
              <View style={styles.itemForeground}>
                <Ionicons
                  name={option.icon}
                  size={compact ? 17 : 18}
                  color={active ? T.ctaText : T.textMuted}
                />
                {!compact ? (
                  <Text style={[styles.label, { color: active ? T.ctaText : T.textMuted }]}>{option.label}</Text>
                ) : null}
              </View>
            </View>
          </ScalePressable>
        );
      })}
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: "row", padding: 3, borderRadius: 22, gap: 3 },
  trackCompact: { width: 124, height: 42 },
  trackFull: { width: "100%", height: 52 },
  item: { flex: 1, zIndex: 1 },
  itemContent: { flex: 1, alignItems: "center", justifyContent: "center" },
  itemForeground: { alignItems: "center", justifyContent: "center", flexDirection: "row", zIndex: 1 },
  active: { borderRadius: 22, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.28)" },
  label: { fontSize: 11.5, fontWeight: "700", marginLeft: 6 },
});
