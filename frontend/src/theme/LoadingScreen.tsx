// Branded loading screen — matches the Muscle Map loading design for both
// Night and Day mode. Shown during session restore / store hydration.
//
// Pulsing logo + gradient wordmark + three staggered pulsing dots.

import React, { useEffect, useRef } from "react";
import { View, Text, Image, StyleSheet, Animated, Easing } from "react-native";

import { useTheme } from "./ThemeContext";

function Dot({ delay, color }: { delay: number; color: string }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [delay, v]);
  const opacity = v.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] });
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.25] });
  return <Animated.View style={[styles.dot, { backgroundColor: color, opacity, transform: [{ scale }] }]} />;
}

export function LoadingScreen() {
  const { T } = useTheme();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.78] });

  return (
    <View style={[styles.root, { backgroundColor: T.bgRadialFrom }]}>
      <View style={{ flex: 1 }} />
      <Animated.Image
        source={require("../../assets/images/adaptive-icon.png")}
        style={[styles.logo, { transform: [{ scale }], opacity }]}
        resizeMode="contain"
      />
      <Text style={[styles.title, { color: T.text }]}>Muscle Map</Text>
      <Text style={[styles.subtitle, { color: T.textMuted }]}>Your plan. Built around your muscles.</Text>
      <View style={styles.dotsWrap}>
        <View style={styles.dots}>
          <Dot delay={0} color={T.accent} />
          <Dot delay={200} color={T.accent} />
          <Dot delay={400} color={T.accent} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center" },
  logo: { width: 132, height: 132 },
  title: { fontSize: 26, fontWeight: "700", letterSpacing: -0.5, marginTop: 26 },
  subtitle: { fontSize: 13, marginTop: 8 },
  dotsWrap: { flex: 1, justifyContent: "flex-end", paddingBottom: 72 },
  dots: { flexDirection: "row", gap: 9 },
  dot: { width: 8, height: 8, borderRadius: 999 },
});
