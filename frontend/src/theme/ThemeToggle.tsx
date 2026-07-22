// Floating Light/Dark toggle button, reusable on every screen.
//
// Reads the shared ThemeContext so it stays in sync app-wide. Callers pass a
// `style` (usually absolute positioning) to place it in a screen corner.

import React from "react";
import { TouchableOpacity, StyleSheet, StyleProp, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "./ThemeContext";

export function ThemeToggle({ style }: { style?: StyleProp<ViewStyle> }) {
  const { T, mode, toggleTheme } = useTheme();
  return (
    <TouchableOpacity
      style={[styles.btn, { backgroundColor: T.card, borderColor: T.border }, style]}
      onPress={toggleTheme}
      testID="theme-toggle"
      accessibilityRole="button"
      accessibilityLabel={mode === "night" ? "Switch to light mode" : "Switch to dark mode"}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Ionicons name={mode === "night" ? "sunny" : "moon"} size={16} color={T.text2} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
