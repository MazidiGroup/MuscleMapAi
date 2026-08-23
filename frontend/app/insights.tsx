// Insights — its own screen.
//
// Insights used to be a segment inside the Workout tab, which put four unrelated
// destinations behind one segmented control. The Workout tab now holds only the
// live session, and Insights is reached from Today, where progress belongs.

import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { legacyPalette, LegacyPalette } from "@/src/anatomy/ui";
import { LiquidTouchableOpacity as TouchableOpacity } from "@/src/ui/LiquidTouchableOpacity";
import { useTheme } from "@/src/theme/ThemeContext";
import { InsightsView } from "@/src/anatomy/InsightsView";

export default function InsightsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { mode } = useTheme();
  const T = useMemo(() => legacyPalette(mode), [mode]);
  const styles = useMemo(() => makeStyles(T), [T]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.back} onPress={() => router.back()} testID="insights-back">
          <Ionicons name="chevron-back" size={24} color={T.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Insights</Text>
        <View style={styles.back} />
      </View>
      <InsightsView />
    </View>
  );
}

const makeStyles = (T: LegacyPalette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: T.bg },
    header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingBottom: 6 },
    back: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", overflow: "hidden" },
    headerTitle: { flex: 1, textAlign: "center", color: T.text, fontSize: 17, fontWeight: "800" },
  });
