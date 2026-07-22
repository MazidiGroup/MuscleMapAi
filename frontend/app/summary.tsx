import React, { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AnatomyViewer } from "@/src/anatomy/AnatomyViewer";
import { getExercise } from "@/src/anatomy/exercises";
import { useWorkout, getWorkoutById, workoutStats, muscleActivation } from "@/src/anatomy/workoutStore";
import { legacyPalette, LegacyPalette } from "@/src/anatomy/ui";
import { useTheme } from "@/src/theme/ThemeContext";
import { ThemeToggle } from "@/src/theme/ThemeToggle";

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

export default function SummaryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { mode } = useTheme();
  const T = useMemo(() => legacyPalette(mode), [mode]);
  const styles = useMemo(() => makeStyles(T), [T]);
  const { id, prs } = useLocalSearchParams<{ id: string; prs?: string }>();
  const { history } = useWorkout();
  const workout = getWorkoutById(history, String(id));

  let newPRs: string[] = [];
  try {
    if (prs) newPRs = JSON.parse(decodeURIComponent(prs));
  } catch {}

  if (!workout) {
    return (
      <View style={[styles.root, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ color: T.text }}>Workout not found.</Text>
        <TouchableOpacity onPress={() => router.replace("/(tabs)/workout")} style={{ marginTop: 16 }}>
          <Text style={{ color: T.accent }}>Back to Workout</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const stats = workoutStats(workout.exercises);
  const act = muscleActivation(workout.exercises);

  return (
    <View style={styles.root}>
      <ThemeToggle style={{ position: "absolute", top: insets.top + 8, right: 16, zIndex: 30 }} />
      <View style={{ height: "38%" }}>
        <AnatomyViewer mode="workout" primary={act.primary} secondary={act.secondary} />
      </View>

      <View style={styles.panel}>
        <View style={styles.handle} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}>
          <View style={styles.badge}>
            <Ionicons name="checkmark-circle" size={18} color="#3DDC97" />
            <Text style={styles.badgeText}>Workout Complete</Text>
          </View>

          <View style={styles.statGrid}>
            <Stat label="Duration" value={fmt(workout.durationSec)} icon="time" styles={styles} T={T} />
            <Stat label="Exercises" value={`${workout.exercises.length}`} icon="list" styles={styles} T={T} />
            <Stat label="Sets" value={`${stats.completed}`} icon="layers" styles={styles} T={T} />
            <Stat label="Reps" value={`${stats.reps}`} icon="repeat" styles={styles} T={T} />
            <Stat label="Volume" value={`${stats.volume} kg`} icon="barbell" styles={styles} T={T} />
            <Stat label="Muscles" value={`${act.list.length}`} icon="body" styles={styles} T={T} />
          </View>

          {newPRs.length > 0 && (
            <View style={styles.prCard}>
              <View style={styles.prHead}>
                <Ionicons name="trophy" size={18} color={T.secondary} />
                <Text style={styles.prTitle}>Personal Records!</Text>
              </View>
              {newPRs.map((p, i) => (
                <Text key={i} style={styles.prItem}>
                  🏆 {p}
                </Text>
              ))}
            </View>
          )}

          <Text style={styles.section}>Muscle Activation</Text>
          {act.list.map((m) => (
            <View key={m.name} style={styles.actRow}>
              <View style={styles.actTop}>
                <Text style={styles.actName} numberOfLines={1}>
                  {m.label}
                </Text>
                <Text style={[styles.actPct, { color: m.role === "primary" ? T.primary : T.secondary }]}>{m.pct}%</Text>
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${m.pct}%`, backgroundColor: m.role === "primary" ? T.primary : T.secondary }]} />
              </View>
            </View>
          ))}

          <Text style={styles.section}>Exercises</Text>
          {workout.exercises.map((e) => {
            const ex = getExercise(e.exerciseId);
            const done = e.sets.filter((s) => s.done).length;
            return (
              <View key={e.exerciseId} style={styles.exRow}>
                <Ionicons name="checkmark-done" size={16} color={T.accent} />
                <Text style={styles.exName}>{ex?.name || e.exerciseId}</Text>
                <Text style={styles.exSets}>{done} sets</Text>
              </View>
            );
          })}
        </ScrollView>

        <TouchableOpacity style={[styles.doneBtn, { bottom: insets.bottom + 14 }]} onPress={() => router.replace("/(tabs)/workout")} testID="summary-done">
          <Text style={styles.doneText}>Done</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Stat({ label, value, icon, styles, T }: { label: string; value: string; icon: any; styles: any; T: LegacyPalette }) {
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={16} color={T.accent} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const makeStyles = (T: LegacyPalette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  panel: { flex: 1, backgroundColor: T.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: T.border, marginTop: -24, paddingHorizontal: 18, paddingTop: 10 },
  handle: { alignSelf: "center", width: 42, height: 5, borderRadius: 999, backgroundColor: T.borderHi, marginBottom: 12 },
  badge: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "center", marginBottom: 14 },
  badgeText: { color: T.text, fontSize: 18, fontWeight: "800" },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stat: { width: "31.5%", backgroundColor: T.bg2, borderRadius: 12, paddingVertical: 12, alignItems: "center", gap: 3, borderWidth: 1, borderColor: T.border },
  statValue: { color: T.text, fontSize: 15, fontWeight: "800" },
  statLabel: { color: T.textFaint, fontSize: 11 },
  prCard: { backgroundColor: "rgba(255,176,32,0.12)", borderWidth: 1, borderColor: T.secondary + "55", borderRadius: 16, padding: 14, marginTop: 14 },
  prHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  prTitle: { color: T.secondary, fontSize: 15, fontWeight: "800" },
  prItem: { color: T.text, fontSize: 14, marginTop: 2 },
  section: { color: T.textDim, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 20, marginBottom: 10 },
  actRow: { marginBottom: 10, gap: 5 },
  actTop: { flexDirection: "row", justifyContent: "space-between" },
  actName: { color: T.text, fontSize: 14, fontWeight: "600", flex: 1, marginRight: 8 },
  actPct: { fontSize: 13, fontWeight: "800" },
  track: { height: 8, borderRadius: 999, backgroundColor: T.surfaceHi, overflow: "hidden" },
  fill: { height: 8, borderRadius: 999 },
  exRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: T.bg2, borderWidth: 1, borderColor: T.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8 },
  exName: { color: T.text, fontSize: 15, fontWeight: "600", flex: 1 },
  exSets: { color: T.textDim, fontSize: 13 },
  doneBtn: { position: "absolute", left: 18, right: 18, backgroundColor: T.accent, borderRadius: 12, paddingVertical: 15, alignItems: "center" },
  doneText: { color: T.bg, fontSize: 16, fontWeight: "800" },
});
