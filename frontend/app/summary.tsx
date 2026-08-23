import React, { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AnatomyViewer } from "@/src/anatomy/AnatomyViewer";
import { formatSetLoad, isBodyweightEquipment } from "@/src/anatomy/bodyweight";
import { displayWeight } from "@/src/units/weight";
import { getExercise } from "@/src/anatomy/exercises";
import { useWorkout, getWorkoutById, muscleActivation } from "@/src/anatomy/workoutStore";
import {
  NOT_COMPLETED_COPY,
  exerciseStatus,
  incompleteCopy,
  setProgressLabel,
  workoutTitle,
  workoutTotals,
} from "@/src/history/metrics";
import { isCountableSet } from "@/src/anatomy/setRules";
import { legacyPalette, LegacyPalette } from "@/src/anatomy/ui";
import { useTheme } from "@/src/theme/ThemeContext";
import { CARD_RADIUS } from "@/src/theme/tokens";
import { LiquidTouchableOpacity as TouchableOpacity } from "@/src/ui/LiquidTouchableOpacity";

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
  const { history, unit } = useWorkout();
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

  const stats = workoutTotals(workout.exercises);
  const act = muscleActivation(workout.exercises);

  return (
    <View style={styles.root}>
      <View style={{ height: "38%" }}>
        <AnatomyViewer mode="workout" primary={act.primary} secondary={act.secondary} />
      </View>

      <View style={styles.panel}>
        <View style={styles.handle} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}>
          <View style={styles.badge}>
            <Ionicons name="checkmark-circle" size={18} color="#3DDC97" />
            <Text style={styles.badgeText}>{workoutTitle(workout)}</Text>
          </View>

          <View style={styles.statGrid}>
            <Stat label="Duration" value={fmt(workout.durationSec)} icon="time" styles={styles} T={T} />
            <Stat label="Exercises" value={`${workout.exercises.length}`} icon="list" styles={styles} T={T} />
            <Stat
              label="Sets completed"
              value={setProgressLabel(stats.completedSets, stats.totalSets)}
              icon="layers"
              styles={styles}
              T={T}
            />
            <Stat label="Reps" value={`${stats.reps}`} icon="repeat" styles={styles} T={T} />
            <Stat label="Volume" value={`${stats.volume} ${unit}`} icon="barbell" styles={styles} T={T} />
            <Stat label="Muscles" value={`${act.list.length}`} icon="body" styles={styles} T={T} />
          </View>

          {newPRs.length > 0 && (
            <View style={styles.prCard}>
              <View style={styles.prHead}>
                <Ionicons name="trophy" size={18} color={T.pr} />
                <Text style={styles.prTitle}>Personal Records!</Text>
              </View>
              {newPRs.map((p, i) => (
                <Text key={i} style={styles.prItem}>
                  🏆 {p}
                </Text>
              ))}
            </View>
          )}

          <Text style={styles.section}>Exercises</Text>
          {workout.exercises.map((e) => {
            const ex = getExercise(e.exerciseId);
            const bodyweight = isBodyweightEquipment(ex?.equipment);
            const status = exerciseStatus(e);
            const done = e.sets.filter(isCountableSet).length;
            const icon = status === "Completed" ? "checkmark-done" : status === "Incomplete" ? "remove-circle-outline" : "ellipse-outline";
            const tint = status === "Completed" ? T.accent : status === "Incomplete" ? "#FFB020" : T.textDim;
            return (
              <View
                key={`${e.exerciseId}-${e.idSpace ?? "anatomy"}`}
                style={styles.exBlock}
                accessibilityLabel={`${ex?.name || e.exerciseId}, ${status}, ${setProgressLabel(done, e.sets.length)} sets`}
                testID={`sum-ex-${e.exerciseId}`}
              >
                <View style={styles.exRow}>
                  <Ionicons name={icon as any} size={16} color={tint} />
                  <Text style={styles.exName}>{ex?.name || e.exerciseId}</Text>
                  <Text style={[styles.exStatus, { color: tint }]}>{status}</Text>
                </View>
                <Text style={styles.exSets}>{setProgressLabel(done, e.sets.length)} sets</Text>
                {status === "Not completed" && <Text style={styles.exNote}>{NOT_COMPLETED_COPY}</Text>}
                {status === "Incomplete" && <Text style={styles.exNote}>{incompleteCopy(e.sets.length - done)}</Text>}
                {e.sets.length > 0 && (
                  <View style={{ gap: 2, marginTop: 6 }}>
                    {e.sets.map((set, i) => (
                      <Text key={set.id} style={[styles.setLine, !isCountableSet(set) && { color: T.textDim }]}>
                        {`Set ${i + 1}: ${
                          // "BW" belongs to bodyweight exercises only. A loaded exercise with
                          // no weight entered has no weight — it is not bodyweight.
                          bodyweight
                            ? formatSetLoad(displayWeight(set.weight, workout?.unit, unit, unit), unit, true)
                            : set.weight > 0
                              ? `${displayWeight(set.weight, workout?.unit, unit, unit)} ${unit}`
                              : "—"
                        } × ${set.reps}`}
                        {set.warmup ? " · warm-up" : ""}
                        {isCountableSet(set) ? "" : " · not completed"}
                      </Text>
                    ))}
                  </View>
                )}
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
  panel: { flex: 1, backgroundColor: T.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, marginTop: -24, paddingHorizontal: 18, paddingTop: 10 },
  handle: { alignSelf: "center", width: 42, height: 5, borderRadius: 999, backgroundColor: T.borderHi, marginBottom: 12 },
  badge: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "center", marginBottom: 14 },
  badgeText: { color: T.text, fontSize: 18, fontWeight: "800" },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stat: { width: "31.5%", backgroundColor: T.bg2, borderRadius: 22, paddingVertical: 12, alignItems: "center", gap: 3, },
  statValue: { color: T.text, fontSize: 15, fontWeight: "800" },
  statLabel: { color: T.textFaint, fontSize: 11 },
  prCard: { backgroundColor: T.pr + "1F", borderWidth: 1, borderColor: T.pr + "55", borderRadius: CARD_RADIUS, padding: 14, marginTop: 14 },
  prHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  prTitle: { color: T.pr, fontSize: 15, fontWeight: "800" },
  prItem: { color: T.text, fontSize: 14, marginTop: 2 },
  section: { color: T.textDim, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 20, marginBottom: 10 },
  exRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: T.bg2, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8 },
  exName: { color: T.text, fontSize: 15, fontWeight: "600", flex: 1 },
  exSets: { color: T.textDim, fontSize: 13 },
  doneBtn: { position: "absolute", left: 18, right: 18, backgroundColor: T.accent, borderRadius: 22, paddingVertical: 15, alignItems: "center" },
  exBlock: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: T.border },
  exStatus: { fontSize: 12, fontWeight: "800" },
  exNote: { color: T.textDim, fontSize: 12.5, lineHeight: 18, marginTop: 4 },
  setLine: { color: T.text, fontSize: 13, fontWeight: "600" },
  doneText: { color: T.bg, fontSize: 16, fontWeight: "800" },
});
