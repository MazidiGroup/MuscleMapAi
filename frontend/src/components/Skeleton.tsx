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

import { COLORS, RADIUS } from "@/src/theme";

export function Skeleton({ height = 16, width = "100%", style }: { height?: number; width?: number | string; style?: ViewStyle }) {
  const o = useSharedValue(0.4);
  useEffect(() => {
    o.value = withRepeat(withTiming(0.9, { duration: 700, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [o]);
  const animStyle = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View
      style={[
        { height, width: width as any, backgroundColor: COLORS.surfaceElevated, borderRadius: RADIUS.sm },
        animStyle,
        style,
      ]}
    />
  );
}

export function SkeletonHomeScreen() {
  return (
    <View style={styles.container} testID="skeleton-home">
      <Skeleton height={28} width="50%" />
      <Skeleton height={14} width="35%" style={{ marginTop: 8 }} />
      <Skeleton height={96} style={{ marginTop: 20, borderRadius: RADIUS.xl }} />
      <Skeleton height={56} style={{ marginTop: 16, borderRadius: RADIUS.xl }} />
      <Skeleton height={220} style={{ marginTop: 16, borderRadius: RADIUS["2xl"] }} />
      <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
        <Skeleton height={72} width="32%" style={{ borderRadius: RADIUS.lg }} />
        <Skeleton height={72} width="32%" style={{ borderRadius: RADIUS.lg }} />
        <Skeleton height={72} width="32%" style={{ borderRadius: RADIUS.lg }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, flex: 1, backgroundColor: COLORS.bg },
});
