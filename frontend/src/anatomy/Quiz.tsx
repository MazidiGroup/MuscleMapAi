import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { QuizQuestion } from "./lessons";
import { legacyPalette, LegacyPalette } from "./ui";
import { LiquidTouchableOpacity as TouchableOpacity } from "@/src/ui/LiquidTouchableOpacity";
import { LiquidSheen } from "@/src/ui/GlassSurface";
import { useTheme } from "@/src/theme/ThemeContext";

export function Quiz({ questions, onClose }: { questions: QuizQuestion[]; onClose: () => void }) {
  const { mode } = useTheme();
  const T = useMemo(() => legacyPalette(mode), [mode]);
  const styles = useMemo(() => makeStyles(T), [T]);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);

  const q = questions[idx];

  const choose = (i: number) => {
    if (picked !== null) return;
    setPicked(i);
    if (i === q.answer) setScore((s) => s + 1);
  };

  const next = () => {
    if (idx + 1 >= questions.length) {
      setDone(true);
    } else {
      setIdx((i) => i + 1);
      setPicked(null);
    }
  };

  if (done) {
    const pct = Math.round((score / questions.length) * 100);
    return (
      <View style={styles.card} testID="quiz-result">
        <LiquidSheen tone="neutral" />
        <Ionicons name={pct >= 70 ? "trophy" : "ribbon-outline"} size={48} color={T.accent} />
        <Text style={styles.resultScore}>
          {score}/{questions.length}
        </Text>
        <Text style={styles.resultLabel}>{pct >= 70 ? "Great work!" : "Keep studying!"}</Text>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => {
            setIdx(0);
            setPicked(null);
            setScore(0);
            setDone(false);
          }}
        >
          <Text style={styles.primaryBtnText}>Retry Quiz</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.ghostBtn} onPress={onClose} testID="quiz-close">
          <Text style={styles.ghostBtnText}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <LiquidSheen tone="neutral" />
      <View style={styles.topRow}>
        <Text style={styles.progress}>
          Question {idx + 1} of {questions.length}
        </Text>
        <TouchableOpacity onPress={onClose} testID="quiz-close">
          <Ionicons name="close" size={22} color={T.textDim} />
        </TouchableOpacity>
      </View>
      <Text style={styles.question}>{q.q}</Text>
      <ScrollView style={{ maxHeight: 320 }}>
        {q.options.map((opt, i) => {
          const isAnswer = i === q.answer;
          const isPicked = i === picked;
          let bg = T.surfaceHi;
          let border = T.border;
          if (picked !== null) {
            if (isAnswer) {
              bg = "rgba(52,220,151,0.16)";
              border = "#3DDC97";
            } else if (isPicked) {
              bg = "rgba(255,68,56,0.16)";
              border = T.primary;
            }
          }
          return (
            <TouchableOpacity
              key={i}
              style={[styles.option, { backgroundColor: bg, borderColor: border }]}
              onPress={() => choose(i)}
              testID={`quiz-opt-${i}`}
            >
              <Text style={styles.optionText}>{opt}</Text>
              {picked !== null && isAnswer && <Ionicons name="checkmark-circle" size={20} color="#3DDC97" />}
              {picked !== null && isPicked && !isAnswer && <Ionicons name="close-circle" size={20} color={T.primary} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {picked !== null && (
        <View style={styles.explainBox}>
          <Text style={styles.explainText}>{q.explain}</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={next} testID="quiz-next">
            <Text style={styles.primaryBtnText}>{idx + 1 >= questions.length ? "See Results" : "Next"}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const makeStyles = (T: LegacyPalette) => StyleSheet.create({
  card: { backgroundColor: T.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderColor: T.border, padding: 20, alignItems: "stretch", overflow: "hidden" },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  progress: { color: T.accent, fontSize: 13, fontWeight: "700" },
  question: { color: T.text, fontSize: 18, fontWeight: "700", marginBottom: 14, lineHeight: 24 },
  option: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, marginBottom: 8 },
  optionText: { color: T.text, fontSize: 15, flex: 1 },
  explainBox: { marginTop: 6 },
  explainText: { color: T.textDim, fontSize: 14, lineHeight: 20, marginBottom: 12 },
  primaryBtn: { backgroundColor: T.accent, borderRadius: 12, paddingVertical: 13, alignItems: "center", marginTop: 6 },
  primaryBtnText: { color: T.bg, fontSize: 15, fontWeight: "800" },
  ghostBtn: { paddingVertical: 12, alignItems: "center", marginTop: 4 },
  ghostBtnText: { color: T.textDim, fontSize: 14, fontWeight: "600" },
  resultScore: { color: T.text, fontSize: 44, fontWeight: "900", marginTop: 10 },
  resultLabel: { color: T.textDim, fontSize: 16, marginBottom: 16 },
});
