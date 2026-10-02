import React from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { useEffect } from "react";

import { useTheme } from "@/src/theme/ThemeContext";
import { R } from "@/src/theme/tokens";

export function Skeleton({ height = 16, width = "100%", style }: { height?: number; width?: number | string; style?: ViewStyle }) {
  const o = useSharedValue(0.4);
  useEffect(() => {
    o.value = withRepeat(withTiming(0.9, { duration: 700, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [o]);
  const animStyle = useAnimatedStyle(() => ({ opacity: o.value }));
  const { T } = useTheme();
  return (
    <Animated.View
      style={[
        { height, width: width as any, backgroundColor: T.cardAlt, borderRadius: R.sm },
        animStyle,
        style,
      ]}
    />
  );
}

export function SkeletonHomeScreen() {
  const { T } = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: T.bg }]} testID="skeleton-home">
      <Skeleton height={28} width="50%" />
      <Skeleton height={14} width="35%" style={{ marginTop: 8 }} />
      <Skeleton height={96} style={{ marginTop: 20, borderRadius: R.lg }} />
      <Skeleton height={56} style={{ marginTop: 16, borderRadius: R.lg }} />
      <Skeleton height={220} style={{ marginTop: 16, borderRadius: R.lg }} />
      <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
        <Skeleton height={72} width="32%" style={{ borderRadius: R.md }} />
        <Skeleton height={72} width="32%" style={{ borderRadius: R.md }} />
        <Skeleton height={72} width="32%" style={{ borderRadius: R.md }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, flex: 1 },
});
