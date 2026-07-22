import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AnatomyViewer } from "@/src/anatomy/AnatomyViewer";
import { getExercise } from "@/src/anatomy/exercises";
import { getExerciseMeta } from "@/src/anatomy/gymGuide";
import { getMuscleInfo } from "@/src/anatomy/muscleData";
import { prettyName } from "@/src/anatomy/groups";
import { useWorkout } from "@/src/anatomy/workoutStore";
import { ExerciseAnimation } from "@/src/components/ExerciseAnimation";
import { T } from "@/src/anatomy/ui";

const label = (n: string) => getMuscleInfo(n)?.label || prettyName(n);

export default function ExerciseDetail() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const ex = getExercise(String(id));
  const meta = ex ? getExerciseMeta(ex.id) : null;
  const { addExercise } = useWorkout();

  if (!ex || !meta) {
    return (
      <View style={[styles.root, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ color: T.text }}>Exercise not found.</Text>
      </View>
    );
  }

  const start = () => {
    addExercise(ex.id);
    router.replace({ pathname: "/(tabs)/workout", params: { seg: "session" } });
  };

  return (
    <View style={styles.root}>
      <View style={{ height: "40%" }}>
        <AnatomyViewer mode="workout" primary={ex.primary} secondary={ex.secondary} />
      </View>
      <TouchableOpacity style={[styles.back, { top: insets.top + 8 }]} onPress={() => router.back()} testID="exercise-back">
        <Ionicons name="chevron-back" size={24} color={T.text} />
      </TouchableOpacity>

      <View style={styles.panel}>
        <View style={styles.handle} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}>
          <Text style={styles.title}>{ex.name}</Text>
          <View style={styles.metaRow}>
            <Pill icon="speedometer-outline" text={meta.difficulty} />
            <Pill icon="construct-outline" text={ex.equipment} />
            <Pill icon="albums-outline" text={ex.category} />
          </View>

          {/* Animated demonstration (RepDB pack) — autoplays, loops, pauses off-screen */}
          <ExerciseAnimation exerciseId={ex.id} variant="hero" />

          <Text style={styles.section}>Instructions</Text>
          <Text style={styles.body}>{ex.cue}</Text>

          <Text style={styles.section}>Primary Muscles</Text>
          <View style={styles.chips}>
            {ex.primary.map((m) => (
              <View key={m} style={[styles.chip, { borderColor: T.primary + "66", backgroundColor: T.primary + "1A" }]}>
                <Text style={[styles.chipText, { color: T.primary }]}>{label(m)}</Text>
              </View>
            ))}
          </View>
          {ex.secondary.length > 0 && (
            <>
              <Text style={styles.section}>Secondary Muscles</Text>
              <View style={styles.chips}>
                {ex.secondary.map((m) => (
                  <View key={m} style={[styles.chip, { borderColor: T.secondary + "66", backgroundColor: T.secondary + "1A" }]}>
                    <Text style={[styles.chipText, { color: T.secondary }]}>{label(m)}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </ScrollView>

        <TouchableOpacity style={[styles.startBtn, { bottom: insets.bottom + 14 }]} onPress={start} testID="start-workout-btn">
          <Ionicons name="add" size={20} color={T.bg} />
          <Text style={styles.startText}>Add to Session</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Pill({ icon, text }: { icon: any; text: string }) {
  return (
    <View style={styles.pill}>
      <Ionicons name={icon} size={14} color={T.accent} />
      <Text style={styles.pillText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  back: { position: "absolute", left: 14, width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(18,24,34,0.82)", borderWidth: 1, borderColor: T.border, alignItems: "center", justifyContent: "center" },
  panel: { flex: 1, backgroundColor: T.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: T.border, marginTop: -24, paddingHorizontal: 20, paddingTop: 10 },
  handle: { alignSelf: "center", width: 42, height: 5, borderRadius: 3, backgroundColor: "rgba(120,160,220,0.25)", marginBottom: 12 },
  title: { color: T.text, fontSize: 24, fontWeight: "800", marginBottom: 12 },
  metaRow: { flexDirection: "row", gap: 8, marginBottom: 8, flexWrap: "wrap" },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: T.surfaceHi, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  pillText: { color: T.text, fontSize: 13, fontWeight: "600" },
  section: { color: T.textDim, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 16, marginBottom: 8 },
  body: { color: T.text, fontSize: 15, lineHeight: 22 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  chipText: { fontSize: 13, fontWeight: "700" },
  startBtn: { position: "absolute", left: 20, right: 20, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: T.accent, borderRadius: 14, paddingVertical: 15 },
  startText: { color: T.bg, fontSize: 16, fontWeight: "800" },
});
