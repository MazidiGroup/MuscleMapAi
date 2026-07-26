import React, { useMemo, useState } from "react";
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
import { legacyPalette, LegacyPalette } from "@/src/anatomy/ui";
import { getCatalogExercise } from "@/src/anatomy/exerciseCatalog";
import { useTheme } from "@/src/theme/ThemeContext";
import { ThemeToggle } from "@/src/theme/ThemeToggle";
import { AddToWorkoutSheet } from "@/src/library/AddToWorkoutSheet";
import { EmptyState, InfoBanner } from "@/src/ui/state";
import {
  MATCHES_BEST_COPY,
  SINGLE_SESSION_COPY,
  NO_RECORDS_COPY,
  absoluteDate,
  exercisePerformances,
  personalRecord,
  recordMark,
} from "@/src/history/metrics";

const label = (n: string) => getMuscleInfo(n)?.label || prettyName(n);

export default function ExerciseDetail() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { mode } = useTheme();
  const T = useMemo(() => legacyPalette(mode), [mode]);
  const styles = useMemo(() => makeStyles(T), [T]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const ex = getExercise(String(id));
  const meta = ex ? getExerciseMeta(ex.id) : null;
  const w = useWorkout();
  const [addOpen, setAddOpen] = useState(false);
  const catalogue = ex ? getCatalogExercise(ex.id) : undefined;

  // Exercise History and records are grouped by this exact id in the anatomy
  // ID space — never by display name, never merged with the plan ID space.
  const performances = useMemo(
    () => (ex ? exercisePerformances(w.history, ex.id, "anatomy") : []),
    [w.history, ex],
  );
  const record = useMemo(() => personalRecord(performances), [performances]);

  if (!ex || !meta) {
    return (
      <View style={[styles.root, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ color: T.text }}>Exercise not found.</Text>
      </View>
    );
  }


  return (
    <View style={styles.root}>
      <View style={{ height: "40%" }}>
        <AnatomyViewer mode="workout" primary={ex.primary} secondary={ex.secondary} />
      </View>
      <TouchableOpacity style={[styles.back, { top: insets.top + 8 }]} onPress={() => router.back()} testID="exercise-back">
        <Ionicons name="chevron-back" size={24} color={T.text} />
      </TouchableOpacity>
      <ThemeToggle style={{ position: "absolute", right: 14, top: insets.top + 8, zIndex: 20 }} />

      <View style={styles.panel}>
        <View style={styles.handle} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}>
          <Text style={styles.title}>{ex.name}</Text>
          <View style={styles.metaRow}>
            <Pill icon="construct-outline" text={ex.equipment} styles={styles} T={T} />
            <Pill icon="swap-horizontal-outline" text={catalogue?.movementPattern || ex.category} styles={styles} T={T} />
          </View>

          {/* Animated demonstration (RepDB pack) — autoplays, loops, pauses off-screen */}
          <ExerciseAnimation exerciseId={ex.id} exerciseName={ex.name} variant="hero" />

          <Text style={styles.section}>Instructions</Text>
          {ex.cue ? (
            <Text style={styles.body}>{ex.cue}</Text>
          ) : (
            <InfoBanner
              message="Step-by-step instructions aren’t available for this exercise yet. Everything else on this screen is accurate."
              testID="ex-no-instructions"
            />
          )}
          <Text style={[styles.body, { color: T.textDim, marginTop: 10 }]} testID="ex-discomfort-note">
            Move at a pace you can control. If something doesn’t feel right, stop the set.
          </Text>

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

          <Text style={styles.section}>Your history</Text>
          {performances.length === 0 ? (
            <EmptyState
              icon="time-outline"
              title="No completed sets yet"
              body="Complete a set of this exercise and it will appear here with your records."
              testID="ex-history-empty"
            />
          ) : (
            <View style={{ gap: 8 }} testID="ex-history">
              {record.maxWeight > 0 && record.achievedAt ? (
                <View style={styles.prCard} testID="ex-pr">
                  <Text style={styles.prLabel}>Heaviest completed set</Text>
                  <Text style={styles.prValue}>
                    {record.maxWeight} {w.unit}
                  </Text>
                  <Text style={styles.prMeta}>
                    {record.isFirst ? "First personal record · " : ""}
                    {absoluteDate(record.achievedAt)}
                  </Text>
                </View>
              ) : (
                <InfoBanner title={NO_RECORDS_COPY.title} message={NO_RECORDS_COPY.body} testID="ex-no-pr" />
              )}
              {performances.length === 1 && (
                <Text style={[styles.body, { color: T.textDim }]}>{SINGLE_SESSION_COPY}</Text>
              )}
              {performances.map((p) => {
                const mark = recordMark(p, record);
                return (
                  <View key={p.workoutId + p.date} style={styles.perfRow} testID={`ex-perf-${p.workoutId}`}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.perfDate}>{absoluteDate(p.date)}</Text>
                      <Text style={styles.perfMeta}>
                        {p.completedSets.length} completed {p.completedSets.length === 1 ? "set" : "sets"} ·{" "}
                        {p.maxWeight > 0 ? `${p.maxWeight} ${w.unit} top set` : "bodyweight"} · {p.reps} reps
                      </Text>
                    </View>
                    {mark === "record" && <Text style={styles.markPR}>Record</Text>}
                    {mark === "matches" && <Text style={styles.markMatch}>{MATCHES_BEST_COPY}</Text>}
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>

        <TouchableOpacity
          style={[styles.startBtn, { bottom: insets.bottom + 14 }]}
          onPress={() => setAddOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Add ${ex.name} to a workout`}
          testID="add-to-workout"
        >
          <Ionicons name="add" size={20} color={T.bg} />
          <Text style={styles.startText}>Add to workout</Text>
        </TouchableOpacity>

        <AddToWorkoutSheet
          visible={addOpen}
          exerciseId={ex.id}
          exerciseName={ex.name}
          onDismiss={() => setAddOpen(false)}
        />
      </View>
    </View>
  );
}

function Pill({ icon, text, styles, T }: { icon: any; text: string; styles: any; T: LegacyPalette }) {
  return (
    <View style={styles.pill}>
      <Ionicons name={icon} size={14} color={T.accent} />
      <Text style={styles.pillText}>{text}</Text>
    </View>
  );
}

const makeStyles = (T: LegacyPalette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  back: { position: "absolute", left: 14, width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(18,24,34,0.82)", borderWidth: 1, borderColor: T.border, alignItems: "center", justifyContent: "center" },
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
  prCard: { backgroundColor: T.surfaceHi, borderRadius: 14, borderWidth: 1, borderColor: T.border, padding: 14 },
  prLabel: { color: T.textDim, fontSize: 11.5, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  prValue: { color: T.text, fontSize: 26, fontWeight: "900", marginTop: 2 },
  prMeta: { color: T.textDim, fontSize: 12.5, fontWeight: "600", marginTop: 2 },
  perfRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: T.border },
  perfDate: { color: T.text, fontSize: 14.5, fontWeight: "700" },
  perfMeta: { color: T.textDim, fontSize: 12.5, marginTop: 2 },
  markPR: { color: T.accent, fontSize: 12, fontWeight: "800" },
  markMatch: { color: T.textDim, fontSize: 12, fontWeight: "700" },
});
