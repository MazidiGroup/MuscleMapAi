// History — its own screen.
//
// History used to be a segment inside the Workout tab, which put four unrelated
// destinations behind one segmented control. The Workout tab now holds only the
// live session, and History is reached from Today, where progress belongs.

import React, { useMemo } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { legacyPalette, LegacyPalette } from "@/src/anatomy/ui";
import { useTheme } from "@/src/theme/ThemeContext";
import { HistoryView } from "@/src/history/HistoryView";

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { mode } = useTheme();
  const T = useMemo(() => legacyPalette(mode), [mode]);
  const styles = useMemo(() => makeStyles(T), [T]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" testID="history-back">
          <Ionicons name="chevron-back" size={24} color={T.text} />
        </Pressable>
        <Text style={styles.headerTitle}>History</Text>
        <View style={styles.back} />
      </View>
      <HistoryView scrollPadding={32} topPadding={4} />
    </View>
  );
}

const makeStyles = (T: LegacyPalette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: T.bg },
    header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingBottom: 6 },
    back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
    headerTitle: { flex: 1, textAlign: "center", color: T.text, fontSize: 17, fontWeight: "800" },
  });
