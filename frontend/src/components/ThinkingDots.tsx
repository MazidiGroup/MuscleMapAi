import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
} from "react-native-reanimated";

import { useTheme } from "@/src/theme/ThemeContext";

export function ThinkingDots() {
  const { T } = useTheme();
  const d1 = useSharedValue(0.4);
  const d2 = useSharedValue(0.4);
  const d3 = useSharedValue(0.4);

  useEffect(() => {
    const cfg = { duration: 400 };
    d1.value = withRepeat(withSequence(withTiming(1, cfg), withTiming(0.4, cfg)), -1);
    d2.value = withDelay(150, withRepeat(withSequence(withTiming(1, cfg), withTiming(0.4, cfg)), -1));
    d3.value = withDelay(300, withRepeat(withSequence(withTiming(1, cfg), withTiming(0.4, cfg)), -1));
  }, [d1, d2, d3]);

  const s1 = useAnimatedStyle(() => ({ opacity: d1.value, transform: [{ scale: 0.85 + d1.value * 0.3 }] }));
  const s2 = useAnimatedStyle(() => ({ opacity: d2.value, transform: [{ scale: 0.85 + d2.value * 0.3 }] }));
  const s3 = useAnimatedStyle(() => ({ opacity: d3.value, transform: [{ scale: 0.85 + d3.value * 0.3 }] }));

  return (
    <View style={styles.row} testID="thinking-dots">
      <Animated.View style={[styles.dot, { backgroundColor: T.accent }, s1]} />
      <Animated.View style={[styles.dot, { backgroundColor: T.accent }, s2]} />
      <Animated.View style={[styles.dot, { backgroundColor: T.accent }, s3]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 6, alignItems: "center", paddingVertical: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
