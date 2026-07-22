import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";

import { AnatomyViewer } from "@/src/anatomy/AnatomyViewer";
import { DraggableSheet } from "@/src/anatomy/DraggableSheet";
import { RestTimer } from "@/src/anatomy/RestTimer";
import { InsightsView } from "@/src/anatomy/InsightsView";
import { EXERCISES, getExercise } from "@/src/anatomy/exercises";
import { getExerciseMeta } from "@/src/anatomy/gymGuide";
import { useWorkout, workoutStats, Workout } from "@/src/anatomy/workoutStore";
import { ExerciseAnimation } from "@/src/components/ExerciseAnimation";
import { T } from "@/src/anatomy/ui";
import { usePremium } from "@/src/premium/PremiumContext";
import { Paywall } from "@/src/premium/Paywall";

type Seg = "session" | "exercises" | "insights";
const CATS = ["All", "Push", "Pull", "Legs", "Core", "Upper", "Lower", "Mobility"];

function fmtClock(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function startOfWeekMonday(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = (x.getDay() + 6) % 7; // 0 = Monday
  x.setDate(x.getDate() - day);
  return x.getTime();
}

export default function WorkoutScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { height } = useWindowDimensions();
  const params = useLocalSearchParams<{ seg?: string; ex?: string }>();
  const w = useWorkout();
  const { isPremium } = usePremium();

  const [seg, setSeg] = useState<Seg>("session");
  const [cat, setCat] = useState("All");
  const [restVisible, setRestVisible] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (["exercises", "session", "history", "insights"].includes(String(params.seg))) setSeg(params.seg as Seg);
  }, [params.seg]);
  useEffect(() => {
    if (params.ex) w.addExercise(String(params.ex));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.ex]);

  // live duration tick
  useEffect(() => {
    if (!w.startedAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [w.startedAt]);

  const list = useMemo(() => {
    return EXERCISES.filter((e) => {
      if (cat === "All") return true;
      if (cat === "Upper") return e.category === "Push" || e.category === "Pull";
      if (cat === "Lower") return e.category === "Legs";
      if (cat === "Mobility") return e.category === "Mobility";
      return e.category === cat;
    });
  }, [cat]);

  const catHighlight = useMemo(() => {
    const p = new Set<string>();
    const s = new Set<string>();
    list.forEach((e) => {
      e.primary.forEach((m) => p.add(m));
      e.secondary.forEach((m) => s.add(m));
    });
    return { primary: [...p], secondary: [...s].filter((m) => !p.has(m)) };
  }, [list]);

  const stats = w.session ? workoutStats(w.session) : { sets: 0, completed: 0, reps: 0, volume: 0 };
  const durationSec = w.startedAt ? Math.round((now - w.startedAt) / 1000) : 0;

  const onToggleDone = (exId: string, setId: string, willBeDone: boolean) => {
    w.toggleDone(exId, setId);
    if (willBeDone) setRestVisible(true);
  };

  const finish = () => {
    const res = w.finish();
    if (res) {
      router.push({ pathname: "/summary", params: { id: res.workout.id, prs: encodeURIComponent(JSON.stringify(res.newPRs)) } });
    }
  };

  // ---- History: This Week + monthly calendar (derived from existing w.history) ----
  const nowD = new Date();
  const calYear = nowD.getFullYear();
  const calMonth = nowD.getMonth();
  const calLabel = nowD.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const calMonthShort = nowD.toLocaleDateString(undefined, { month: "short" });
  const weekStart = startOfWeekMonday(nowD);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const thisWeek = useMemo(() => w.history.filter((wk) => wk.date >= weekStart), [w.history, weekStart]);

  const workoutDays = useMemo(() => {
    const set = new Set<number>();
    w.history.forEach((wk) => {
      const d = new Date(wk.date);
      if (d.getFullYear() === calYear && d.getMonth() === calMonth) set.add(d.getDate());
    });
    return set;
  }, [w.history, calYear, calMonth]);

  const calCells = useMemo(() => {
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const firstWeekday = (new Date(calYear, calMonth, 1).getDay() + 6) % 7; // Mon-based
    return [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  }, [calYear, calMonth]);

  const selectedDayWorkouts = useMemo(() => {
    if (selectedDay == null) return [];
    return w.history.filter((wk) => {
      const d = new Date(wk.date);
      return d.getFullYear() === calYear && d.getMonth() === calMonth && d.getDate() === selectedDay;
    });
  }, [selectedDay, w.history, calYear, calMonth]);

  const renderHistCard = (wk: Workout) => {
    const st = workoutStats(wk.exercises);
    return (
      <TouchableOpacity
        key={wk.id}
        style={styles.histCard}
        onPress={() => router.push({ pathname: "/summary", params: { id: wk.id } })}
        testID={`hist-${wk.id}`}
      >
        <View style={styles.histTop}>
          <Text style={styles.histDate}>{fmtDate(wk.date)}</Text>
          <Text style={styles.histDur}>{fmtClock(wk.durationSec)}</Text>
        </View>
        <Text style={styles.histEx} numberOfLines={1}>
          {wk.exercises.map((e) => getExercise(e.exerciseId)?.name).filter(Boolean).join(" · ")}
        </Text>
        <View style={styles.histStats}>
          <Text style={styles.histStat}>{wk.exercises.length} exercises</Text>
          <Text style={styles.histStat}>{st.completed} sets</Text>
          <Text style={styles.histStat}>{st.volume} kg</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.root}>
      {seg === "exercises" && <AnatomyViewer mode="workout" primary={catHighlight.primary} secondary={catHighlight.secondary} />}

      {/* segmented header */}
      <View style={[styles.segWrap, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <View style={styles.seg}>
          {(["session", "exercises", "insights"] as Seg[]).map((s) => (
            <TouchableOpacity key={s} style={[styles.segBtn, seg === s && styles.segActive]} onPress={() => setSeg(s)} testID={`seg-${s}`}>
              <Text style={[styles.segText, seg === s && styles.segTextActive]}>
                {s === "session" ? "Session" : s === "exercises" ? "Muscle Groups" : "Insights"}
              </Text>
              {s === "insights" && !isPremium && <Ionicons name="lock-closed" size={11} color={T.textFaint} style={{ marginLeft: 4 }} />}
              {s === "session" && w.session && w.session.length > 0 && <View style={styles.dot} />}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* EXERCISES */}
      {seg === "exercises" && (
        <DraggableSheet peekHeight={230} maxHeight={Math.min(height * 0.82, height - insets.top - 60)} initial="collapsed">
          <View style={{ flex: 1, paddingHorizontal: 16 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 10 }}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {CATS.map((c) => (
                  <TouchableOpacity key={c} style={[styles.cat, cat === c && styles.catActive]} onPress={() => setCat(c)} testID={`cat-${c}`}>
                    <Text style={[styles.catText, cat === c && { color: T.bg }]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
              {list.map((e) => {
                const meta = getExerciseMeta(e.id);
                return (
                  <TouchableOpacity key={e.id} style={styles.exItem} onPress={() => router.push(`/exercise/${e.id}`)} testID={`ex-${e.id}`}>
                    <ExerciseAnimation
                      exerciseId={e.id}
                      variant="thumb"
                      size={42}
                      fallback={
                        <View style={[styles.exIcon, { backgroundColor: T.accent + "1A" }]}>
                          <Ionicons name={meta.icon as any} size={20} color={T.accent} />
                        </View>
                      }
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.exItemName}>{e.name}</Text>
                      <Text style={styles.exItemMeta}>
                        {meta.difficulty} · {e.equipment} · {e.category}
                      </Text>
                    </View>
                    {w.session ? (
                      w.hasExercise(e.id) ? (
                        <View style={styles.addedPill}>
                          <Ionicons name="checkmark" size={15} color="#3DDC97" />
                          <Text style={styles.addedText}>Added</Text>
                        </View>
                      ) : (
                        <TouchableOpacity style={styles.addPill} onPress={() => w.addExercise(e.id)} testID={`add-ex-${e.id}`}>
                          <Ionicons name="add" size={16} color={T.bg} />
                          <Text style={styles.addPillText}>Add</Text>
                        </TouchableOpacity>
                      )
                    ) : (
                      <Ionicons name="chevron-forward" size={18} color={T.textFaint} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </DraggableSheet>
      )}

      {/* SESSION */}
      {seg === "session" && (
        <View style={[styles.full, { paddingTop: insets.top + 56 }]}>
          {!w.session || w.session.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="barbell-outline" size={40} color={T.textFaint} />
              <Text style={styles.emptyText}>No active workout</Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => setSeg("exercises")} testID="browse-ex">
                <Text style={styles.primaryBtnText}>Browse Exercises</Text>
              </TouchableOpacity>
              {!w.session && (
                <TouchableOpacity style={styles.ghostBtn} onPress={() => w.startWorkout()} testID="start-empty">
                  <Text style={styles.ghostText}>Start empty workout</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <>
              <View style={styles.statsBar}>
                <SBStat label="Time" value={fmtClock(durationSec)} />
                <SBStat label="Exercises" value={`${w.session.length}`} />
                <SBStat label="Sets" value={`${stats.completed}/${stats.sets}`} />
                <SBStat label="Volume" value={`${stats.volume}kg`} />
              </View>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
                {w.session.map((se) => {
                  const ex = getExercise(se.exerciseId);
                  return (
                    <View key={se.exerciseId} style={styles.exCard}>
                      <View style={styles.exCardHead}>
                        <Text style={styles.exCardName}>{ex?.name}</Text>
                        <TouchableOpacity onPress={() => w.removeExercise(se.exerciseId)} testID={`rm-${se.exerciseId}`}>
                          <Ionicons name="trash-outline" size={18} color={T.textFaint} />
                        </TouchableOpacity>
                      </View>
                      {/* Form demo with play/pause + replay controls (paused poster by default) */}
                      <ExerciseAnimation exerciseId={se.exerciseId} variant="workout" />
                      <View style={styles.setHeadRow}>
                        <Text style={[styles.setHead, { width: 30 }]}>SET</Text>
                        <Text style={[styles.setHead, { flex: 1 }]}>KG</Text>
                        <Text style={[styles.setHead, { flex: 1 }]}>REPS</Text>
                        <Text style={[styles.setHead, { width: 80, textAlign: "center" }]}>DONE</Text>
                      </View>
                      {se.sets.map((s, idx) => (
                        <View key={s.id} style={[styles.setRow, s.done && styles.setRowDone]}>
                          <Text style={[styles.setIdx, { width: 30 }]}>{idx + 1}</Text>
                          <TextInput
                            style={styles.setInput}
                            keyboardType="numeric"
                            value={s.weight ? String(s.weight) : ""}
                            placeholder="0"
                            placeholderTextColor={T.textFaint}
                            onChangeText={(t) => w.updateSet(se.exerciseId, s.id, { weight: Number(t) || 0 })}
                            testID={`w-${se.exerciseId}-${idx}`}
                          />
                          <TextInput
                            style={styles.setInput}
                            keyboardType="numeric"
                            value={s.reps ? String(s.reps) : ""}
                            placeholder="0"
                            placeholderTextColor={T.textFaint}
                            onChangeText={(t) => w.updateSet(se.exerciseId, s.id, { reps: Number(t) || 0 })}
                            testID={`r-${se.exerciseId}-${idx}`}
                          />
                          <View style={styles.setActions}>
                            <TouchableOpacity onPress={() => w.duplicateSet(se.exerciseId, s.id)} testID={`dup-${se.exerciseId}-${idx}`}>
                              <Ionicons name="copy-outline" size={18} color={T.textDim} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => w.deleteSet(se.exerciseId, s.id)}>
                              <Ionicons name="remove-circle-outline" size={18} color={T.textDim} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => onToggleDone(se.exerciseId, s.id, !s.done)} testID={`done-${se.exerciseId}-${idx}`}>
                              <Ionicons name={s.done ? "checkmark-circle" : "ellipse-outline"} size={24} color={s.done ? "#3DDC97" : T.textFaint} />
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))}
                      <TouchableOpacity style={styles.addSet} onPress={() => w.addSet(se.exerciseId)} testID={`addset-${se.exerciseId}`}>
                        <Ionicons name="add" size={16} color={T.accent} />
                        <Text style={styles.addSetText}>Add Set</Text>
                      </TouchableOpacity>
                      <TextInput
                        style={styles.notes}
                        placeholder="Notes…"
                        placeholderTextColor={T.textFaint}
                        value={se.notes}
                        onChangeText={(t) => w.setNotes(se.exerciseId, t)}
                      />
                    </View>
                  );
                })}
                <TouchableOpacity style={styles.addExBtn} onPress={() => setSeg("exercises")} testID="add-exercise">
                  <Ionicons name="add-circle-outline" size={18} color={T.accent} />
                  <Text style={styles.addExText}>Add Exercise</Text>
                </TouchableOpacity>
              </ScrollView>
              <View style={[styles.finishBar, { paddingBottom: insets.bottom + 8 }]}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => w.cancel()} testID="cancel-workout">
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.finishBtn} onPress={finish} testID="finish-workout">
                  <Ionicons name="flag" size={16} color={T.bg} />
                  <Text style={styles.finishText}>Finish Workout</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      )}

      {/* INSIGHTS */}
      {seg === "insights" && (isPremium ? <InsightsView /> : <Paywall title="Unlock Insights" headerOffset={40} />)}

      <RestTimer visible={restVisible} initial={w.restPref} onClose={() => setRestVisible(false)} onPrefChange={w.setRestPref} />
    </View>
  );
}

function SBStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.sbStat}>
      <Text style={styles.sbValue}>{value}</Text>
      <Text style={styles.sbLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  full: { ...StyleSheet.absoluteFillObject, backgroundColor: T.bg },
  segWrap: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: 16, zIndex: 10 },
  seg: { flexDirection: "row", backgroundColor: "rgba(12,17,26,0.92)", borderRadius: 12, padding: 4, gap: 4, borderWidth: 1, borderColor: T.border },
  segBtn: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 5 },
  segActive: { backgroundColor: T.accent },
  segText: { color: T.textDim, fontSize: 13, fontWeight: "700" },
  segTextActive: { color: T.bg },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#3DDC97" },

  cat: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: T.surfaceHi, borderWidth: 1, borderColor: T.border },
  catActive: { backgroundColor: T.accent, borderColor: T.accent },
  catText: { color: T.text, fontSize: 13, fontWeight: "700" },
  exItem: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: T.bg2, borderWidth: 1, borderColor: T.border, borderRadius: 14, padding: 12, marginBottom: 8 },
  exIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  exItemName: { color: T.text, fontSize: 15, fontWeight: "700" },
  exItemMeta: { color: T.textFaint, fontSize: 12, marginTop: 2 },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 24 },
  emptyText: { color: T.text, fontSize: 17, fontWeight: "700" },
  emptySub: { color: T.textDim, fontSize: 14, textAlign: "center" },
  primaryBtn: { backgroundColor: T.accent, paddingHorizontal: 24, paddingVertical: 13, borderRadius: 12, marginTop: 8 },
  primaryBtnText: { color: T.bg, fontSize: 15, fontWeight: "800" },
  ghostBtn: { paddingVertical: 10 },
  ghostText: { color: T.textDim, fontSize: 14, fontWeight: "600" },

  statsBar: { flexDirection: "row", marginHorizontal: 16, backgroundColor: T.surface, borderRadius: 14, borderWidth: 1, borderColor: T.border, paddingVertical: 12 },
  sbStat: { flex: 1, alignItems: "center" },
  sbValue: { color: T.accent, fontSize: 17, fontWeight: "800" },
  sbLabel: { color: T.textFaint, fontSize: 11, marginTop: 2 },

  exCard: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 16, padding: 14, marginBottom: 12 },
  exCardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  exCardName: { color: T.text, fontSize: 16, fontWeight: "800" },
  setHeadRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  setHead: { color: T.textFaint, fontSize: 11, fontWeight: "700" },
  setRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 5 },
  setRowDone: { opacity: 0.85 },
  setIdx: { color: T.text, fontSize: 14, fontWeight: "700" },
  setInput: { flex: 1, backgroundColor: T.surfaceHi, borderRadius: 8, paddingVertical: 8, textAlign: "center", color: T.text, fontSize: 15, fontWeight: "600" },
  setActions: { width: 80, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  addSet: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, marginTop: 6, borderRadius: 10, backgroundColor: T.surfaceHi },
  addSetText: { color: T.accent, fontSize: 13, fontWeight: "700" },
  notes: { backgroundColor: T.bg2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, color: T.text, fontSize: 14, marginTop: 8, borderWidth: 1, borderColor: T.border },
  addExBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: T.borderHi, borderStyle: "dashed" },
  addExText: { color: T.accent, fontSize: 14, fontWeight: "700" },
  finishBar: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 10, backgroundColor: T.bg2, borderTopWidth: 1, borderTopColor: T.border },
  cancelBtn: { paddingHorizontal: 20, paddingVertical: 14, borderRadius: 12, backgroundColor: T.surfaceHi, alignItems: "center", justifyContent: "center" },
  cancelText: { color: T.textDim, fontSize: 14, fontWeight: "700" },
  finishBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: T.accent, borderRadius: 12, paddingVertical: 14 },
  finishText: { color: T.bg, fontSize: 15, fontWeight: "800" },

  histCard: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 16, padding: 16, marginBottom: 12 },
  histTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  histDate: { color: T.text, fontSize: 16, fontWeight: "800" },
  histDur: { color: T.accent, fontSize: 14, fontWeight: "700" },
  histEx: { color: T.textDim, fontSize: 13, marginBottom: 8 },
  histStats: { flexDirection: "row", gap: 14 },
  histStat: { color: T.textFaint, fontSize: 12, fontWeight: "600" },

  addPill: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: T.accent, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  addPillText: { color: T.bg, fontSize: 13, fontWeight: "800" },
  addedPill: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: T.border },
  addedText: { color: "#3DDC97", fontSize: 12, fontWeight: "700" },

  histSectionTitle: { color: T.text, fontSize: 15, fontWeight: "800", marginBottom: 10 },
  histSectionEmpty: { color: T.textFaint, fontSize: 13, marginBottom: 4 },
  calCard: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 16, padding: 12 },
  calWeekRow: { flexDirection: "row", marginBottom: 6 },
  calWeekday: { width: `${100 / 7}%`, textAlign: "center", color: T.textFaint, fontSize: 11, fontWeight: "700" },
  calGrid: { flexDirection: "row", flexWrap: "wrap" },
  calCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center", paddingVertical: 3 },
  calDay: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  calDayMarked: { backgroundColor: T.accent },
  calDayToday: { borderWidth: 1, borderColor: T.borderHi },
  calDaySel: { backgroundColor: "#3DDC97", borderWidth: 2, borderColor: T.text },
  calDayText: { color: T.textDim, fontSize: 13, fontWeight: "600" },
});
