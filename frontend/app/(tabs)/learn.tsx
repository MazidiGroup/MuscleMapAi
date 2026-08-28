import React, { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { LESSONS } from "@/src/anatomy/lessons";
import { legacyPalette, LegacyPalette } from "@/src/anatomy/ui";
import { PremiumGate } from "@/src/premium/PremiumGate";
import { LiquidTouchableOpacity as TouchableOpacity } from "@/src/ui/LiquidTouchableOpacity";
import { useTheme } from "@/src/theme/ThemeContext";

export default function LearnScreen() {
  return (
    <PremiumGate surface="library.learn">
      <LearnContent />
    </PremiumGate>
  );
}

function LearnContent() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { mode } = useTheme();
  const T = useMemo(() => legacyPalette(mode), [mode]);
  const styles = useMemo(() => makeStyles(T), [T]);

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 18, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <Text style={styles.h1}>Learn</Text>
        <Text style={styles.sub}>Guided 3D anatomy lessons with quizzes</Text>

        {LESSONS.map((l, i) => (
          <TouchableOpacity
            key={l.id}
            style={styles.card}
            onPress={() => router.push(`/lesson/${l.id}`)}
            testID={`lesson-${l.id}`}
          >
            <View style={styles.iconWrap}>
              <Ionicons name={l.icon as any} size={24} color={T.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.lessonNum}>
                <Text style={styles.lessonNumText}>Lesson {i + 1}</Text>
              </View>
              <Text style={styles.cardTitle}>{l.title}</Text>
              <Text style={styles.cardSub}>{l.subtitle}</Text>
            </View>
            <View style={styles.metaCol}>
              <Ionicons name="help-circle-outline" size={16} color={T.textFaint} />
              <Text style={styles.metaText}>{l.quiz.length} Q</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={T.textFaint} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const makeStyles = (T: LegacyPalette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  h1: { color: T.text, fontSize: 24, fontWeight: "800" },
  sub: { color: T.textDim, fontSize: 13, marginTop: 2, marginBottom: 18 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: T.surface,
    
    
    borderRadius: 22,
    padding: 16,
    marginBottom: 12,
  },
  iconWrap: { width: 50, height: 50, borderRadius: 22, backgroundColor: T.surfaceHi, alignItems: "center", justifyContent: "center" },
  lessonNum: { alignSelf: "flex-start", backgroundColor: "rgba(52,199,255,0.14)", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginBottom: 4 },
  lessonNumText: { color: T.accent, fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  cardTitle: { color: T.text, fontSize: 15, fontWeight: "800" },
  cardSub: { color: T.textDim, fontSize: 13, marginTop: 1 },
  metaCol: { alignItems: "center", gap: 2 },
  metaText: { color: T.textFaint, fontSize: 11, fontWeight: "600" },
});
