// The copper chevron from assets/images/logo-mark.svg, drawn inline so it can
// sit inside a captured view (the finish share card), plus the wordmark.

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Defs, G, LinearGradient, Path, Stop } from "react-native-svg";

import { useTheme } from "@/src/theme/ThemeContext";

export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="brandFg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#f5c08c" />
          <Stop offset="1" stopColor="#d0783a" />
        </LinearGradient>
      </Defs>
      <G transform="translate(50 50) scale(.82) translate(-50 -50)" fill="none" stroke="url(#brandFg)" strokeLinecap="round" strokeLinejoin="round">
        <Path d="M40 45 L50 33 L60 45" strokeWidth={4.5} opacity={0.5} />
        <Path d="M31 59 L50 41 L69 59" strokeWidth={6} opacity={0.78} />
        <Path d="M22 73 L50 49 L78 73" strokeWidth={7.5} />
        <Path d="M13 87 L50 57 L87 87" strokeWidth={9} opacity={0.92} />
      </G>
    </Svg>
  );
}

export function BrandMark({ size = 22 }: { size?: number }) {
  const { T } = useTheme();
  return (
    <View style={styles.row} accessible accessibilityLabel="Muscle Map AI">
      <LogoMark size={size} />
      <Text style={[styles.word, { color: T.text, fontSize: Math.round(size * 0.62) }]}>Muscle Map AI</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  word: { fontWeight: "800", letterSpacing: 0.2 },
});
