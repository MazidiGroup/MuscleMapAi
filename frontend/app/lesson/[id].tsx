import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Modal, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AnatomyViewer } from "@/src/anatomy/AnatomyViewer";
import { Quiz } from "@/src/anatomy/Quiz";
import { getLesson } from "@/src/anatomy/lessons";
import { legacyPalette, LegacyPalette } from "@/src/anatomy/ui";
import { LiquidTouchableOpacity as TouchableOpacity } from "@/src/ui/LiquidTouchableOpacity";
import { LiquidSheen } from "@/src/ui/GlassSurface";
import { useTheme } from "@/src/theme/ThemeContext";

export default function LessonDetail() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { mode } = useTheme();
  const T = useMemo(() => legacyPalette(mode), [mode]);
  const styles = useMemo(() => makeStyles(T), [T]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const lesson = getLesson(String(id));
  const [quizOpen, setQuizOpen] = useState(false);

  if (!lesson) {
    return (
      <View style={[styles.root, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ color: T.text }}>Lesson not found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.viewer}>
        <AnatomyViewer mode="workout" primary={lesson.focus} isolate={lesson.container} />
      </View>

      <TouchableOpacity style={[styles.back, { top: insets.top + 8 }]} onPress={() => router.back()} testID="lesson-back">
        <Ionicons name="chevron-back" size={24} color={T.text} />
      </TouchableOpacity>

      <View style={styles.panel}>
        <LiquidSheen tone="neutral" />
        <View style={styles.handle} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}>
          <Text style={styles.title}>{lesson.title}</Text>
          <Text style={styles.subtitle}>{lesson.subtitle}</Text>
          <Text style={styles.intro}>{lesson.intro}</Text>

          {lesson.points.map((p) => (
            <View key={p.heading} style={styles.point}>
              <View style={styles.bullet}>
                <Ionicons name="ellipse" size={8} color={T.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.pointHead}>{p.heading}</Text>
                <Text style={styles.pointBody}>{p.body}</Text>
              </View>
            </View>
          ))}

          {/* Citations — Guideline 1.4.1: sources for anatomy lessons */}
          <TouchableOpacity
            style={styles.srcRow}
            onPress={() => router.push("/references")}
            testID="lesson-view-sources"
          >
            <Ionicons name="library-outline" size={14} color={T.textFaint} />
            <Text style={styles.srcText}>
              Lesson content is based on Gray&apos;s Anatomy, TeachMeAnatomy, Kenhub and NIH/NCBI anatomy references.
            </Text>
            <Text style={styles.srcCta}>View sources</Text>
          </TouchableOpacity>
        </ScrollView>

        <TouchableOpacity style={[styles.quizBtn, { bottom: insets.bottom + 14 }]} onPress={() => setQuizOpen(true)} testID="start-quiz-btn">
          <Ionicons name="school-outline" size={18} color={T.bg} />
          <Text style={styles.quizBtnText}>Take the Quiz ({lesson.quiz.length} questions)</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={quizOpen} transparent animationType="slide" onRequestClose={() => setQuizOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setQuizOpen(false)} />
        <View style={styles.quizWrap}>
          <Quiz questions={lesson.quiz} onClose={() => setQuizOpen(false)} />
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (T: LegacyPalette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  viewer: { height: "42%" },
  back: {
    position: "absolute",
    left: 14,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(18,24,34,0.82)",
    borderWidth: 1,
    borderColor: T.border,
    alignItems: "center",
    justifyContent: "center",
  },
  panel: {
    flex: 1,
    backgroundColor: T.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: T.border,
    marginTop: -24,
    paddingHorizontal: 20,
    paddingTop: 10,
    overflow: "hidden",
  },
  handle: { alignSelf: "center", width: 42, height: 5, borderRadius: 3, backgroundColor: "rgba(120,160,220,0.25)", marginBottom: 12 },
  title: { color: T.text, fontSize: 24, fontWeight: "800" },
  subtitle: { color: T.accent, fontSize: 14, fontWeight: "600", marginTop: 2, marginBottom: 12 },
  intro: { color: T.textDim, fontSize: 15, lineHeight: 22, marginBottom: 18 },
  point: { flexDirection: "row", gap: 12, marginBottom: 16 },
  bullet: { width: 20, alignItems: "center", paddingTop: 6 },
  pointHead: { color: T.text, fontSize: 16, fontWeight: "700", marginBottom: 3 },
  pointBody: { color: T.textDim, fontSize: 14, lineHeight: 21 },
  quizBtn: {
    position: "absolute",
    left: 20,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: T.accent,
    borderRadius: 14,
    paddingVertical: 15,
  },
  quizBtnText: { color: T.bg, fontSize: 15, fontWeight: "800" },
  srcRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
    marginBottom: 88,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: T.bg2,
    borderWidth: 1,
    borderColor: T.border,
  },
  srcText: { flex: 1, color: T.textFaint, fontSize: 11, lineHeight: 15 },
  srcCta: { color: T.accent, fontSize: 11, fontWeight: "800" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)" },
  quizWrap: { position: "absolute", left: 0, right: 0, bottom: 0 },
});
