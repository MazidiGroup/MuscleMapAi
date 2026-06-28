import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  TextInput,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { apiGet, apiPost } from "@/src/api";

export default function Workout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [workout, setWorkout] = useState<any>(null);
  const [exercises, setExercises] = useState<any[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [restSeconds, setRestSeconds] = useState(0);
  const [restActive, setRestActive] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startTime = useRef<number>(Date.now());
  const [completing, setCompleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [w, lib] = await Promise.all([apiGet(`/workouts/${id}`), apiGet<any[]>("/exercises")]);
      setWorkout(w);
      // Get prior best weight per exercise for suggestion
      const hist = await apiGet<{ workouts: any[] }>("/workouts/history");
      const suggested: Record<string, number> = {};
      for (const past of hist.workouts) {
        for (const pex of past.exercises || []) {
          if (pex.sets?.length) {
            const best = Math.max(...pex.sets.map((s: any) => s.weight || 0));
            if (!suggested[pex.exercise_id] || best > suggested[pex.exercise_id]) {
              suggested[pex.exercise_id] = best;
            }
          }
        }
      }
      const enriched = (w.exercises || []).map((ex: any) => {
        const full = lib.find((e: any) => e.id === ex.exercise_id);
        return {
          ...ex,
          name: full?.name || ex.exercise_id,
          muscles: full?.muscles || [],
          suggested_weight: suggested[ex.exercise_id] || 0,
          working_weight: suggested[ex.exercise_id] || 0,
          working_reps: 8,
        };
      });
      setExercises(enriched);
    } catch (e) {
      console.warn(e);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Elapsed timer
  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startTime.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  // Rest timer
  useEffect(() => {
    if (!restActive || restSeconds <= 0) return;
    const t = setInterval(() => {
      setRestSeconds((s) => {
        if (s <= 1) {
          setRestActive(false);
          if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [restActive, restSeconds]);

  const logSet = async (idx: number) => {
    const ex = exercises[idx];
    if (!ex) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const setNum = (ex.sets?.length || 0) + 1;
    try {
      const updated = await apiPost(`/workouts/log-set`, {
        workout_id: id,
        exercise_id: ex.exercise_id,
        set_data: {
          set_number: setNum,
          weight: parseFloat(ex.working_weight) || 0,
          reps: parseInt(ex.working_reps) || 0,
          completed: true,
        },
      });
      const next = [...exercises];
      next[idx] = { ...ex, sets: updated.exercises.find((e: any) => e.exercise_id === ex.exercise_id).sets };
      setExercises(next);
      // start rest timer
      setRestSeconds(90);
      setRestActive(true);
    } catch (e) {
      console.warn(e);
    }
  };

  const updateField = (idx: number, field: "working_weight" | "working_reps", val: string) => {
    const next = [...exercises];
    next[idx] = { ...next[idx], [field]: val };
    setExercises(next);
  };

  const completeWorkout = async () => {
    setCompleting(true);
    try {
      await apiPost("/workouts/complete", {
        workout_id: id,
        duration_seconds: elapsed,
        notes: "",
      });
      router.replace("/(tabs)");
    } catch (e) {
      console.warn(e);
    } finally {
      setCompleting(false);
    }
  };

  if (!workout) {
    return <View style={styles.loader}><ActivityIndicator color={COLORS.primary} /></View>;
  }

  const fmtTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  const completedSets = exercises.reduce((acc, e) => acc + (e.sets?.length || 0), 0);
  const totalSets = exercises.reduce((acc, e) => acc + (e.target_sets || 0), 0);
  const progressPct = totalSets > 0 ? (completedSets / totalSets) * 100 : 0;

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]} testID="workout-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="workout-close" hitSlop={12}>
          <Ionicons name="close" size={26} color={COLORS.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{workout.name}</Text>
          <Text style={styles.timer} testID="elapsed-timer">{fmtTime(elapsed)}</Text>
        </View>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
      </View>

      {restActive && (
        <View style={styles.restBar} testID="rest-timer">
          <Ionicons name="timer-outline" size={16} color={COLORS.primary} />
          <Text style={styles.restText}>Rest {fmtTime(restSeconds)}</Text>
          <Pressable onPress={() => { setRestActive(false); setRestSeconds(0); }} hitSlop={8}>
            <Text style={styles.restSkip}>Skip</Text>
          </Pressable>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {exercises.map((ex, idx) => {
          const done = (ex.sets?.length || 0) >= (ex.target_sets || 0);
          return (
            <View key={ex.exercise_id} style={[styles.exCard, idx === activeIdx && styles.exCardActive]} testID={`exercise-card-${idx}`}>
              <Pressable onPress={() => setActiveIdx(idx)} style={styles.exHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.exName}>{ex.name}</Text>
                  <Text style={styles.exMeta}>
                    {ex.target_sets} × {ex.target_reps}
                    {ex.suggested_weight > 0 && `  ·  Last: ${ex.suggested_weight}kg`}
                  </Text>
                </View>
                <Pressable
                  testID={`exercise-info-${idx}`}
                  onPress={() => router.push(`/exercise/${ex.exercise_id}`)}
                  hitSlop={8}
                >
                  <Ionicons name="information-circle-outline" size={22} color={COLORS.textSecondary} />
                </Pressable>
                {done && <Ionicons name="checkmark-circle" size={22} color={COLORS.success} style={{ marginLeft: 8 }} />}
              </Pressable>

              {idx === activeIdx && (
                <View style={styles.exBody}>
                  <View style={styles.inputRow}>
                    <View style={styles.inputBlock}>
                      <Text style={styles.inputLabel}>Weight (kg)</Text>
                      <View style={styles.inputControls}>
                        <Pressable
                          testID={`weight-down-${idx}`}
                          onPress={() => updateField(idx, "working_weight", String(Math.max(0, parseFloat(ex.working_weight) - 2.5)))}
                          style={styles.stepBtn}
                        >
                          <Ionicons name="remove" size={18} color={COLORS.text} />
                        </Pressable>
                        <TextInput
                          testID={`weight-input-${idx}`}
                          value={String(ex.working_weight)}
                          keyboardType="numeric"
                          onChangeText={(v) => updateField(idx, "working_weight", v)}
                          style={styles.numInput}
                        />
                        <Pressable
                          testID={`weight-up-${idx}`}
                          onPress={() => updateField(idx, "working_weight", String((parseFloat(ex.working_weight) || 0) + 2.5))}
                          style={styles.stepBtn}
                        >
                          <Ionicons name="add" size={18} color={COLORS.text} />
                        </Pressable>
                      </View>
                    </View>

                    <View style={styles.inputBlock}>
                      <Text style={styles.inputLabel}>Reps</Text>
                      <View style={styles.inputControls}>
                        <Pressable
                          testID={`reps-down-${idx}`}
                          onPress={() => updateField(idx, "working_reps", String(Math.max(1, (parseInt(ex.working_reps) || 1) - 1)))}
                          style={styles.stepBtn}
                        >
                          <Ionicons name="remove" size={18} color={COLORS.text} />
                        </Pressable>
                        <TextInput
                          testID={`reps-input-${idx}`}
                          value={String(ex.working_reps)}
                          keyboardType="numeric"
                          onChangeText={(v) => updateField(idx, "working_reps", v)}
                          style={styles.numInput}
                        />
                        <Pressable
                          testID={`reps-up-${idx}`}
                          onPress={() => updateField(idx, "working_reps", String((parseInt(ex.working_reps) || 0) + 1))}
                          style={styles.stepBtn}
                        >
                          <Ionicons name="add" size={18} color={COLORS.text} />
                        </Pressable>
                      </View>
                    </View>
                  </View>

                  <View style={styles.setHistory}>
                    {Array.from({ length: ex.target_sets }).map((_, sIdx) => {
                      const s = ex.sets?.[sIdx];
                      const completed = !!s;
                      return (
                        <View
                          key={sIdx}
                          style={[styles.setPill, completed && styles.setPillDone]}
                          testID={`set-pill-${idx}-${sIdx}`}
                        >
                          <Text style={[styles.setPillText, completed && styles.setPillTextDone]}>
                            {completed ? `${s.weight}×${s.reps}` : `Set ${sIdx + 1}`}
                          </Text>
                        </View>
                      );
                    })}
                  </View>

                  <Pressable
                    testID={`log-set-button-${idx}`}
                    onPress={() => logSet(idx)}
                    disabled={done}
                    style={[styles.logBtn, done && styles.logBtnDisabled]}
                  >
                    <Ionicons name="add-circle" size={20} color="#fff" />
                    <Text style={styles.logBtnText}>{done ? "Sets complete" : "Log set"}</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        })}

        <Pressable
          testID="complete-workout-button"
          onPress={completeWorkout}
          disabled={completing}
          style={styles.finishBtn}
        >
          {completing ? <ActivityIndicator color="#fff" /> : (
            <>
              <Ionicons name="checkmark-done" size={20} color="#fff" />
              <Text style={styles.finishText}>Finish workout</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  loader: { flex: 1, backgroundColor: COLORS.bg, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: SPACING.xl, paddingVertical: 10 },
  headerCenter: { alignItems: "center", flex: 1 },
  headerTitle: { color: COLORS.text, fontSize: 16, fontWeight: "600" },
  timer: { color: COLORS.primary, fontSize: 13, fontVariant: ["tabular-nums"], marginTop: 2, fontWeight: "600" },
  progressBar: { height: 3, backgroundColor: COLORS.surfaceElevated, marginHorizontal: SPACING.xl, borderRadius: 999, overflow: "hidden" },
  progressFill: { height: 3, backgroundColor: COLORS.primary },
  restBar: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: SPACING.xl, paddingVertical: 10, backgroundColor: "rgba(10,132,255,0.10)", marginTop: 10, marginHorizontal: SPACING.xl, borderRadius: RADIUS.lg },
  restText: { color: COLORS.text, fontSize: 14, fontWeight: "600", flex: 1 },
  restSkip: { color: COLORS.primary, fontSize: 13, fontWeight: "600" },
  scroll: { padding: SPACING.xl, paddingBottom: SPACING["4xl"], gap: 10 },
  exCard: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.xl, padding: 16, marginBottom: 6 },
  exCardActive: { borderColor: COLORS.primary },
  exHeader: { flexDirection: "row", alignItems: "center" },
  exName: { color: COLORS.text, fontSize: 16, fontWeight: "600" },
  exMeta: { color: COLORS.textSecondary, fontSize: 12, marginTop: 3 },
  exBody: { marginTop: 16, gap: 14 },
  inputRow: { flexDirection: "row", gap: 12 },
  inputBlock: { flex: 1 },
  inputLabel: { color: COLORS.textSecondary, fontSize: 11, fontWeight: "600", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 },
  inputControls: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: COLORS.surfaceElevated, borderRadius: RADIUS.lg, padding: 6 },
  stepBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.surfaceHigh, alignItems: "center", justifyContent: "center" },
  numInput: { flex: 1, color: COLORS.text, fontSize: 20, fontWeight: "700", textAlign: "center", paddingVertical: 4 },
  setHistory: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  setPill: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: COLORS.surfaceElevated, borderWidth: 1, borderColor: COLORS.border, minWidth: 70, alignItems: "center" },
  setPillDone: { backgroundColor: "rgba(10,132,255,0.15)", borderColor: COLORS.primary },
  setPillText: { color: COLORS.textSecondary, fontSize: 12, fontWeight: "600" },
  setPillTextDone: { color: COLORS.primary },
  logBtn: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: RADIUS.full },
  logBtnDisabled: { backgroundColor: COLORS.surfaceHigh },
  logBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  finishBtn: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.success, paddingVertical: 16, borderRadius: RADIUS.full, marginTop: 20 },
  finishText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
