import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useIsFocused } from "@react-navigation/native";

import { AnatomyViewer } from "@/src/anatomy/AnatomyViewer";
import { DraggableSheet } from "@/src/anatomy/DraggableSheet";
import { RestTimer } from "@/src/anatomy/RestTimer";
import { InsightsView } from "@/src/anatomy/InsightsView";
import { HistoryView } from "@/src/history/HistoryView";
import { EXERCISES, getExercise } from "@/src/anatomy/exercises";
import { getExerciseMeta } from "@/src/anatomy/gymGuide";
import { useWorkout, workoutStats, type SessionExercise } from "@/src/anatomy/workoutStore";
import { ExerciseAnimation } from "@/src/components/ExerciseAnimation";
import { legacyPalette, LegacyPalette } from "@/src/anatomy/ui";
import { formatSetLoad, isBodyweightEquipment, loadColumnLabel, loadPlaceholder } from "@/src/anatomy/bodyweight";
import { canMarkDone, ZERO_REP_HINT } from "@/src/anatomy/setRules";
import { OVERLOAD_NOTE, PR_LABEL, prForSet, recordsFrom, suggestNext } from "@/src/anatomy/progression";
import { exercisePerformances } from "@/src/history/metrics";
import { usePlanStore } from "@/src/plan/planStore";
import type { Workout } from "@/src/anatomy/workoutScope";
import type { WeightUnit } from "@/src/units/unitPreference";
import type { Goal } from "@/src/plan/exercises";
import { useTheme } from "@/src/theme/ThemeContext";
import { EmptyState, ErrorBanner } from "@/src/ui/state";
import { A11yControl } from "@/src/ui/A11yControl";
import { LiquidSheen } from "@/src/ui/GlassSurface";

type Seg = "session" | "history" | "insights" | "exercises";
const CATS = ["All", "Push", "Pull", "Legs", "Core", "Upper", "Lower", "Mobility"];

export default function WorkoutScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { height } = useWindowDimensions();
  const params = useLocalSearchParams<{ seg?: string; ex?: string }>();
  const w = useWorkout();
  // Progression targets follow the rep range the plan was built around.
  const goal = usePlanStore((s) => s.answers.goal);
  const { mode } = useTheme();
  const isFocused = useIsFocused();
  const T = useMemo(() => legacyPalette(mode), [mode]);
  const styles = useMemo(() => makeStyles(T), [T]);

  const [seg, setSeg] = useState<Seg>("session");
  const [cat, setCat] = useState("All");
  const [restVisible, setRestVisible] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  // The segmented header floats above the content, so its REAL height (it wraps to
  // two lines on narrow screens) is what pushes a scrolling segment clear of it.
  const [headerH, setHeaderH] = useState(0);

  useEffect(() => {
    if (["exercises", "session", "history", "insights"].includes(String(params.seg))) setSeg(params.seg as Seg);
  }, [params.seg]);
  // Tapping a segment keeps the URL honest, so the segment a user is looking at is
  // the segment a reload or a shared link reopens.
  const selectSeg = (next: Seg) => {
    setSeg(next);
    router.setParams({ seg: next });
  };
  useEffect(() => {
    if (params.ex) w.addExercise(String(params.ex));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.ex]);

  // The rest timer belongs to a live session on the Session segment. Finishing or
  // cancelling the workout, moving to another segment, or leaving the tab closes it
  // — otherwise the modal stays mounted over whatever the user opens next and
  // swallows their taps.
  useEffect(() => {
    if (!w.session || seg !== "session" || !isFocused) setRestVisible(false);
  }, [w.session, seg, isFocused]);

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

  const onToggleDone = (exId: string, setId: string, willBeDone: boolean) => {
    w.toggleDone(exId, setId);
    if (willBeDone) setRestVisible(true);
  };

  // Finishing is a verified local transaction: History and PRs must both be
  // written before the session is released. A failure keeps every logged set.
  const finish = async () => {
    if (finishing) return;
    setFinishError(null);
    setFinishing(true);
    const res = await w.finish();
    setFinishing(false);
    if (res.ok) {
      router.push({ pathname: "/summary", params: { id: res.workout.id, prs: encodeURIComponent(JSON.stringify(res.newPRs)) } });
      return;
    }
    if (res.reason === "empty_session") return;
    setFinishError("We couldn't save this workout to your device. Every set you logged is still here — try again.");
  };

  return (
    <View style={styles.root}>
      {seg === "exercises" && <AnatomyViewer mode="workout" primary={catHighlight.primary} secondary={catHighlight.secondary} />}

      {/* segmented header */}
      <View
        style={[
          styles.segWrap,
          {
            paddingTop: insets.top + 8,
            // The scrolling segments pass their content UNDER this floating header,
            // so it needs an opaque backing or rows bleed through above it. Muscle
            // Groups keeps it transparent: the 3D scene is meant to show through.
            paddingBottom: 8,
            backgroundColor: seg === "exercises" ? "transparent" : T.bg,
            pointerEvents: "box-none",
          },
        ]}
        onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={[styles.seg, { flex: 1 }]}>
            {(["session", "history", "insights", "exercises"] as Seg[]).map((s) => (
              <TouchableOpacity key={s} style={[styles.segBtn, seg === s && styles.segActive]} onPress={() => selectSeg(s)} testID={`seg-${s}`}>
                <LiquidSheen tone={seg === s ? "accent" : "subtle"} />
                <Text style={[styles.segText, seg === s && styles.segTextActive]}>
                  {s === "session" ? "Session" : s === "history" ? "History" : s === "insights" ? "Insights" : "Muscle Groups"}
                </Text>
                {s === "session" && w.session && w.session.length > 0 && <View style={styles.dot} />}
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={styles.unitBtn}
            onPress={() => w.setUnit(w.unit === "kg" ? "lb" : "kg")}
            accessibilityRole="button"
            accessibilityLabel={`Weight unit, ${w.unit}. Tap to switch.`}
            testID="unit-toggle"
          >
            <LiquidSheen tone="neutral" />
            <Text style={styles.unitText}>{w.unit.toUpperCase()}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* EXERCISES */}
      {/* Muscle Groups, History and Insights are FREE surfaces (Direction B entitlement map). */}
      {seg === "exercises" && (
        <DraggableSheet peekHeight={230} maxHeight={Math.min(height * 0.82, height - insets.top - 60)} initial="collapsed">
          <View style={{ flex: 1, paddingHorizontal: 16 }}>
            {/* This model is colour-coded by the role each muscle plays in the
                selected category — a different scale from the Insights recovery
                map, so it states its own key rather than borrowing that one. */}
            <View style={styles.mgLegend} testID="muscle-groups-legend">
              <View style={styles.mgLegendItem} accessible accessibilityLabel="Red: prime mover for the selected category">
                <View style={[styles.mgDot, { backgroundColor: "#FF4438" }]} />
                <Text style={styles.mgLegendText}>Prime mover</Text>
              </View>
              <View style={styles.mgLegendItem} accessible accessibilityLabel="Amber: assisting muscle">
                <View style={[styles.mgDot, { backgroundColor: "#FFB020" }]} />
                <Text style={styles.mgLegendText}>Assists</Text>
              </View>
              <View style={styles.mgLegendItem} accessible accessibilityLabel="Grey: not targeted by this category">
                <View style={[styles.mgDot, { backgroundColor: "#3A3D45" }]} />
                <Text style={styles.mgLegendText}>Not targeted</Text>
              </View>
            </View>
            {/* The row is given an explicit height: as a horizontal scroller inside a
                flex column it otherwise collapses on the cross axis, which left the
                chips rendering as empty pills with their labels clipped away. The
                height also brings each chip up to the 44pt minimum target. */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ flexGrow: 0, flexShrink: 0, height: 44, marginBottom: 10 }}
              contentContainerStyle={{ flexDirection: "row", alignItems: "center", gap: 8, paddingRight: 4 }}
            >
              {CATS.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.cat, cat === c && styles.catActive]}
                  onPress={() => setCat(c)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: cat === c }}
                  accessibilityLabel={`${c} exercises`}
                  testID={`cat-${c}`}
                >
                  <LiquidSheen tone={cat === c ? "accent" : "neutral"} />
                  <Text numberOfLines={1} style={[styles.catText, cat === c && { color: T.bg }]}>
                    {c}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
              {list.map((e) => {
                const meta = getExerciseMeta(e.id);
                return (
                  <TouchableOpacity key={e.id} style={styles.exItem} onPress={() => router.push(`/exercise/${e.id}`)} testID={`ex-${e.id}`}>
                    <LiquidSheen tone="subtle" />
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
                          <LiquidSheen tone="accent" />
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
              <EmptyState
                icon="barbell-outline"
                title="No workout in progress"
                body="Start an empty workout, or open a day in your plan to load its exercises."
                note="Everything you log is saved on this device as you go."
                primary={{ label: "Start empty workout", onPress: () => w.startWorkout(), testID: "start-empty" }}
                secondary={{ label: "Browse exercises", onPress: () => selectSeg("exercises"), testID: "browse-ex" }}
                testID="session-empty"
              />
            </View>
          ) : (
            <>
              <View style={styles.statsBar}>
                <LiquidSheen tone="neutral" />
                <SBStat label="Exercises" value={`${w.session.length}`} styles={styles} />
                <SBStat label="Sets" value={`${stats.completed}/${stats.sets}`} styles={styles} />
                <SBStat label="Volume" value={`${stats.volume} ${w.unit}`} styles={styles} />
              </View>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
                {w.session.map((se, i) => (
                  <SessionCard
                    key={se.exerciseId}
                    se={se}
                    prev={i > 0 ? w.session![i - 1] : null}
                    history={w.history}
                    unit={w.unit}
                    goal={goal}
                    styles={styles}
                    T={T}
                    w={w}
                    onToggleDone={onToggleDone}
                  />
                ))}
                <A11yControl
                  label="Add exercise"
                  onPress={() => selectSeg("exercises")}
                  style={styles.addExBtn}
                  testID="add-exercise"
                >
                  <LiquidSheen tone="neutral" />
                  <Ionicons name="add-circle-outline" size={18} color={T.accent} />
                  <Text style={styles.addExText}>Add Exercise</Text>
                </A11yControl>
              </ScrollView>
              {finishError && (
                <View style={[styles.finishErrorWrap, { bottom: insets.bottom + 76 }]}>
                  <ErrorBanner title="Workout not saved" message={finishError} testID="finish-error" />
                </View>
              )}
              <View style={[styles.finishBar, { paddingBottom: insets.bottom + 8 }]}>
                <A11yControl
                  label="Cancel workout"
                  onPress={() => w.cancel()}
                  style={styles.cancelBtn}
                  testID="cancel-workout"
                >
                  <LiquidSheen tone="neutral" />
                  <Text style={styles.cancelText}>Cancel</Text>
                </A11yControl>
                <A11yControl
                  label={finishing ? "Finish workout, saving" : "Finish workout"}
                  onPress={finish}
                  disabled={finishing}
                  busy={finishing}
                  style={styles.finishBtn}
                  testID="finish-workout"
                >
                  <LiquidSheen tone="accent" />
                  <Ionicons name="flag" size={16} color={T.bg} />
                  <Text style={styles.finishText}>{finishing ? "Saving…" : "Finish Workout"}</Text>
                </A11yControl>
              </View>
            </>
          )}
        </View>
      )}

      {/* INSIGHTS */}
      {seg === "history" && (
        <HistoryView
          scrollPadding={insets.bottom + 96}
          topPadding={(headerH || insets.top + 64) + 12}
        />
      )}

      {seg === "insights" && <InsightsView />}

      <RestTimer visible={restVisible} initial={w.restPref} onClose={() => setRestVisible(false)} onPrefChange={w.setRestPref} />
    </View>
  );
}

/**
 * One exercise in the live session.
 *
 * Extracted from the render loop so it can derive its own history-backed values
 * (the next-target prompt and the records a set has to beat) with memoised hooks
 * instead of recomputing the whole history for every exercise on every keystroke.
 */
function SessionCard({
  se,
  prev,
  history,
  unit,
  goal,
  styles,
  T,
  w,
  onToggleDone,
}: {
  se: SessionExercise;
  prev: SessionExercise | null;
  history: Workout[];
  unit: WeightUnit;
  goal: Goal | undefined;
  styles: any;
  T: LegacyPalette;
  w: ReturnType<typeof useWorkout>;
  onToggleDone: (exId: string, setId: string, willBeDone: boolean) => void;
}) {
  const ex = getExercise(se.exerciseId);
  const bodyweight = isBodyweightEquipment(ex?.equipment);

  // Completed working sets for THIS exercise, from finished workouts only.
  const perfs = useMemo(
    () => exercisePerformances(history, se.exerciseId, se.idSpace ?? "anatomy"),
    [history, se.exerciseId, se.idSpace],
  );
  const suggestion = useMemo(
    () => suggestNext({ performances: perfs, unit, goal, bodyweight }),
    [perfs, unit, goal, bodyweight],
  );
  const records = useMemo(() => recordsFrom(perfs), [perfs]);
  // Which completed sets beat the stored bests, resolved once per render.
  const setPRs = useMemo(
    () => se.sets.map((s) => (s.done && !s.warmup ? prForSet(s, records) : null)),
    [se.sets, records],
  );
  const firstPR = setPRs.find((p) => p !== null) ?? null;

  const inSuperset = !!se.supersetId;
  const linkedAbove = inSuperset && !!prev && prev.supersetId === se.supersetId;

  return (
    <View style={[styles.exCard, inSuperset && styles.exCardSuper]}>
      <LiquidSheen tone={inSuperset ? "accent" : "neutral"} />
      {linkedAbove && (
        <View style={styles.superTag}>
          <Ionicons name="link" size={11} color={T.secondary} />
          <Text style={styles.superTagText}>SUPERSET — alternate with the exercise above</Text>
        </View>
      )}
      <View style={styles.exCardHead}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
          <Text style={styles.exCardName}>{ex?.name}</Text>
          {bodyweight && (
            <View style={styles.bwBadge}>
              <Text style={styles.bwBadgeText}>BW</Text>
            </View>
          )}
        </View>
        {/* Pairing is only meaningful when there is an exercise above to pair with. */}
        {prev && (
          <A11yControl
            role="checkbox"
            checked={linkedAbove}
            label={linkedAbove ? `Unlink ${ex?.name} from the superset above` : `Superset ${ex?.name} with the exercise above`}
            onPress={() => w.toggleSuperset(se.exerciseId)}
            style={styles.headBtn}
            testID={`superset-${se.exerciseId}`}
          >
            <LiquidSheen tone={linkedAbove ? "accent" : "neutral"} />
            <Ionicons name={linkedAbove ? "link" : "link-outline"} size={18} color={linkedAbove ? T.secondary : T.textFaint} />
          </A11yControl>
        )}
        <A11yControl
          label={`Remove ${ex?.name} from this workout`}
          onPress={() => w.removeExercise(se.exerciseId)}
          style={styles.headBtn}
          testID={`rm-${se.exerciseId}`}
        >
          <LiquidSheen tone="danger" />
          <Ionicons name="trash-outline" size={18} color={T.textFaint} />
        </A11yControl>
      </View>

      {/* Form demo with play/pause + replay controls (paused poster by default) */}
      <ExerciseAnimation exerciseId={se.exerciseId} exerciseName={ex?.name} variant="workout" />

      {/* Next target, derived from this exercise's own completed sets. Offered
          only once there is a performance to build on — never invented. */}
      {suggestion && (
        <View style={styles.suggestCard} testID={`suggest-${se.exerciseId}`}>
          <Ionicons name="trending-up" size={15} color={T.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.suggestHeadline}>{suggestion.headline}</Text>
            <Text style={styles.suggestBasis}>{suggestion.basis}</Text>
          </View>
          {/* Fills the empty rows only — never overwrites something already logged. */}
          <TouchableOpacity
            style={styles.suggestApply}
            onPress={() => {
              for (const s of se.sets) {
                if (s.done || s.reps > 0 || s.weight > 0) continue;
                w.updateSet(se.exerciseId, s.id, {
                  weight: suggestion.targetWeight,
                  reps: suggestion.targetReps,
                });
              }
            }}
            accessibilityRole="button"
            accessibilityLabel={`Fill empty sets with ${suggestion.headline}`}
            testID={`suggest-apply-${se.exerciseId}`}
          >
            <LiquidSheen tone="accent" />
            <Text style={styles.suggestApplyText}>Use</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.setHeadRow}>
        <Text style={[styles.setHead, { width: 44, textAlign: "center" }]}>SET</Text>
        <Text style={[styles.setHead, { flex: 1 }]}>{loadColumnLabel(unit, bodyweight)}</Text>
        <Text style={[styles.setHead, { flex: 1 }]}>REPS</Text>
        <Text style={[styles.setHead, { width: 132, textAlign: "center" }]}>DONE</Text>
      </View>

      {se.sets.map((s, idx) => {
        const ready = canMarkDone(s);
        const pr = setPRs[idx];
        return (
          <View key={s.id} style={[styles.setRow, s.done && styles.setRowDone]}>
            {/* The set number doubles as the warm-up toggle: a warm-up is logged
                with the session but stays out of volume and records. */}
            <A11yControl
              role="checkbox"
              checked={!!s.warmup}
              label={
                s.warmup
                  ? `Set ${idx + 1} is a warm-up. Tap to make it a working set.`
                  : `Set ${idx + 1} is a working set. Tap to mark it a warm-up.`
              }
              onPress={() => w.toggleWarmup(se.exerciseId, s.id)}
              style={styles.setIdxBtn}
              testID={`warmup-${se.exerciseId}-${idx}`}
            >
              {s.warmup ? (
                <View style={styles.warmPill}>
                  <Text style={styles.warmPillText}>W</Text>
                </View>
              ) : (
                <Text style={styles.setIdx}>{idx + 1}</Text>
              )}
            </A11yControl>
            <TextInput
              style={styles.setInput}
              keyboardType="numeric"
              value={s.weight ? String(s.weight) : ""}
              placeholder={loadPlaceholder(bodyweight)}
              placeholderTextColor={T.textFaint}
              onChangeText={(t) => w.updateSet(se.exerciseId, s.id, { weight: Number(t) || 0 })}
              accessibilityLabel={`Set ${idx + 1} load, ${formatSetLoad(s.weight, unit, bodyweight)}`}
              testID={`w-${se.exerciseId}-${idx}`}
            />
            <TextInput
              style={styles.setInput}
              keyboardType="numeric"
              value={s.reps ? String(s.reps) : ""}
              placeholder="0"
              placeholderTextColor={T.textFaint}
              onChangeText={(t) => w.updateSet(se.exerciseId, s.id, { reps: Number(t) || 0 })}
              accessibilityLabel={`Set ${idx + 1} reps, ${s.reps || 0}`}
              testID={`r-${se.exerciseId}-${idx}`}
            />
            <View style={styles.setActions}>
              {pr ? (
                <View style={styles.prFlag} testID={`pr-${se.exerciseId}-${idx}`}>
                  <Ionicons name="trophy" size={13} color={T.secondary} />
                </View>
              ) : (
                <A11yControl
                  label={`Duplicate set ${idx + 1}`}
                  onPress={() => w.duplicateSet(se.exerciseId, s.id)}
                  style={styles.setActionBtn}
                  testID={`dup-${se.exerciseId}-${idx}`}
                >
                  <LiquidSheen tone="neutral" />
                  <Ionicons name="copy-outline" size={18} color={T.textDim} />
                </A11yControl>
              )}
              <A11yControl
                label={`Delete set ${idx + 1}`}
                onPress={() => w.deleteSet(se.exerciseId, s.id)}
                style={styles.setActionBtn}
                testID={`del-${se.exerciseId}-${idx}`}
              >
                <LiquidSheen tone="neutral" />
                <Ionicons name="remove-circle-outline" size={18} color={T.textDim} />
              </A11yControl>
              {/* A set with no reps records no work, so it cannot be ticked. */}
              <A11yControl
                role="checkbox"
                checked={s.done}
                disabled={!s.done && !ready}
                label={s.done ? `Set ${idx + 1} complete` : ready ? `Mark set ${idx + 1} complete` : ZERO_REP_HINT}
                onPress={() => onToggleDone(se.exerciseId, s.id, !s.done)}
                style={styles.setActionBtn}
                testID={`done-${se.exerciseId}-${idx}`}
              >
                <LiquidSheen tone={s.done ? "accent" : "neutral"} />
                <Ionicons
                  name={s.done ? "checkmark-circle" : "ellipse-outline"}
                  size={24}
                  color={s.done ? "#3DDC97" : ready ? T.textFaint : T.border}
                />
              </A11yControl>
            </View>
          </View>
        );
      })}

      {/* Named once per card rather than on every row, so the log stays readable. */}
      {firstPR && (
        <View style={styles.prNote} testID={`pr-note-${se.exerciseId}`}>
          <Ionicons name="trophy" size={13} color={T.secondary} />
          <Text style={styles.prNoteText}>{PR_LABEL[firstPR]} — a new best on this exercise.</Text>
        </View>
      )}

      <TouchableOpacity
        style={styles.addSet}
        onPress={() => w.addSet(se.exerciseId)}
        accessibilityRole="button"
        accessibilityLabel={`Add a set to ${ex?.name}`}
        testID={`addset-${se.exerciseId}`}
      >
        <LiquidSheen tone="neutral" />
        <Ionicons name="add" size={16} color={T.accent} />
        <Text style={styles.addSetText}>Add Set</Text>
      </TouchableOpacity>
      <TextInput
        style={styles.notes}
        placeholder="Notes…"
        placeholderTextColor={T.textFaint}
        value={se.notes}
        onChangeText={(t) => w.setNotes(se.exerciseId, t)}
        accessibilityLabel={`Notes for ${ex?.name}`}
        testID={`notes-${se.exerciseId}`}
      />
      {suggestion && <Text style={styles.overloadNote}>{OVERLOAD_NOTE}</Text>}
    </View>
  );
}

function SBStat({ label, value, styles }: { label: string; value: string; styles: any }) {
  return (
    <View style={styles.sbStat}>
      <Text style={styles.sbValue}>{value}</Text>
      <Text style={styles.sbLabel}>{label}</Text>
    </View>
  );
}

const makeStyles = (T: LegacyPalette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  full: { ...StyleSheet.absoluteFillObject, backgroundColor: T.bg },
  segWrap: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: 16, zIndex: 10 },
  seg: { flexDirection: "row", backgroundColor: "transparent", padding: 0, gap: 3 },
  segBtn: { flex: 1, minHeight: 44, paddingHorizontal: 4, borderRadius: 11, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 5, overflow: "hidden", borderWidth: 1, borderColor: T.border },
  segActive: { backgroundColor: T.accent + "14", borderBottomWidth: 2, borderBottomColor: T.accent },
  segText: { color: T.textDim, fontSize: 13, fontWeight: "700" },
  segTextActive: { color: T.accent },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#3DDC97" },

  cat: {
    paddingHorizontal: 16, height: 40, minWidth: 56, borderRadius: 999,
    alignItems: "center", justifyContent: "center",
    backgroundColor: T.surfaceHi, borderWidth: 1, borderColor: T.border, overflow: "hidden",
  },
  catActive: { backgroundColor: T.accent, borderColor: T.accent },
  mgLegend: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginBottom: 10 },
  mgLegendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  mgDot: { width: 10, height: 10, borderRadius: 5 },
  mgLegendText: { color: T.textDim, fontSize: 11.5, fontWeight: "600" },
  catText: { color: T.text, fontSize: 13, fontWeight: "700" },
  exItem: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: T.bg2, borderWidth: 1, borderColor: T.border, borderRadius: 14, padding: 12, marginBottom: 8, overflow: "hidden" },
  exIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  exItemName: { color: T.text, fontSize: 15, fontWeight: "700" },
  exItemMeta: { color: T.textFaint, fontSize: 12, marginTop: 2 },

  empty: { flex: 1, justifyContent: "center", padding: 16 },
  unitBtn: {
    minWidth: 44, height: 44, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1,
    borderColor: T.border, backgroundColor: T.surface, alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  unitText: { color: T.text, fontSize: 13, fontWeight: "800" },
  bwBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: T.accent + "22" },
  bwBadgeText: { color: T.accent, fontSize: 10.5, fontWeight: "800" },
  finishErrorWrap: { position: "absolute", left: 16, right: 16 },
  emptyText: { color: T.text, fontSize: 17, fontWeight: "700" },
  emptySub: { color: T.textDim, fontSize: 14, textAlign: "center" },
  primaryBtn: { backgroundColor: T.accent, paddingHorizontal: 24, paddingVertical: 13, borderRadius: 12, marginTop: 8 },
  primaryBtnText: { color: T.bg, fontSize: 15, fontWeight: "800" },
  ghostBtn: { paddingVertical: 10 },
  ghostText: { color: T.textDim, fontSize: 14, fontWeight: "600" },

  statsBar: { flexDirection: "row", marginHorizontal: 16, backgroundColor: T.surface, borderRadius: 14, borderWidth: 1, borderColor: T.border, paddingVertical: 12, overflow: "hidden" },
  sbStat: { flex: 1, alignItems: "center" },
  sbValue: { color: T.accent, fontSize: 17, fontWeight: "800" },
  sbLabel: { color: T.textFaint, fontSize: 11, marginTop: 2 },

  exCard: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 16, padding: 14, marginBottom: 12, overflow: "hidden" },
  exCardSuper: { borderColor: T.secondary + "66" },
  exCardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  exCardName: { color: T.text, fontSize: 16, fontWeight: "800" },
  headBtn: {
    width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center",
    overflow: "hidden", borderWidth: 1, borderColor: T.border, backgroundColor: T.surfaceHi,
  },
  superTag: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 8 },
  superTagText: { color: T.secondary, fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },

  suggestCard: {
    flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10,
    backgroundColor: T.accent + "14", borderWidth: 1, borderColor: T.accent + "44",
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
  },
  suggestHeadline: { color: T.text, fontSize: 14, fontWeight: "800" },
  suggestBasis: { color: T.textDim, fontSize: 11.5, marginTop: 2 },
  suggestApply: {
    paddingHorizontal: 14, minHeight: 36, borderRadius: 999, overflow: "hidden",
    alignItems: "center", justifyContent: "center", backgroundColor: T.accent,
  },
  suggestApplyText: { color: T.bg, fontSize: 12.5, fontWeight: "800" },
  overloadNote: { color: T.textFaint, fontSize: 10.5, lineHeight: 15, marginTop: 8 },

  prFlag: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  prNote: {
    flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8,
    backgroundColor: "rgba(255,176,32,0.12)", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7,
  },
  prNoteText: { color: T.secondary, fontSize: 11.5, fontWeight: "700", flex: 1 },

  setHeadRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  setHead: { color: T.textFaint, fontSize: 11, fontWeight: "700" },
  setRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 5 },
  setRowDone: { opacity: 0.85 },
  setIdxBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  setIdx: { color: T.text, fontSize: 14, fontWeight: "700" },
  warmPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: T.secondary + "26" },
  warmPillText: { color: T.secondary, fontSize: 11, fontWeight: "800" },
  setInput: { flex: 1, minWidth: 0, backgroundColor: T.surfaceHi, borderRadius: 10, paddingVertical: 8, textAlign: "center", color: T.text, fontSize: 15, fontWeight: "600", borderWidth: 1, borderColor: T.border },
  // Each control keeps its 18-24px glyph but owns a full 44x44 target.
  setActions: { width: 132, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  setActionBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", overflow: "hidden", borderWidth: 1, borderColor: T.border, backgroundColor: T.surfaceHi },
  removeBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", overflow: "hidden", borderWidth: 1, borderColor: T.border, backgroundColor: T.surfaceHi },
  addSet: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, marginTop: 6, borderRadius: 10, backgroundColor: T.surfaceHi, overflow: "hidden", borderWidth: 1, borderColor: T.border },
  addSetText: { color: T.accent, fontSize: 13, fontWeight: "700" },
  notes: { backgroundColor: T.bg2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, color: T.text, fontSize: 14, marginTop: 8, borderWidth: 1, borderColor: T.border },
  addExBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: T.borderHi, borderStyle: "dashed", overflow: "hidden", backgroundColor: T.surfaceHi },
  addExText: { color: T.accent, fontSize: 14, fontWeight: "700" },
  finishBar: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 10, backgroundColor: T.bg2, borderTopWidth: 1, borderTopColor: T.border },
  cancelBtn: { paddingHorizontal: 20, paddingVertical: 14, borderRadius: 12, backgroundColor: T.surfaceHi, alignItems: "center", justifyContent: "center", overflow: "hidden", borderWidth: 1, borderColor: T.border },
  cancelText: { color: T.textDim, fontSize: 14, fontWeight: "700" },
  finishBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: T.accent, borderRadius: 12, paddingVertical: 14, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.28)" },
  finishText: { color: T.bg, fontSize: 15, fontWeight: "800" },

  histCard: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 16, padding: 16, marginBottom: 12 },
  histTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  histDate: { color: T.text, fontSize: 16, fontWeight: "800" },
  histDur: { color: T.accent, fontSize: 14, fontWeight: "700" },
  histEx: { color: T.textDim, fontSize: 13, marginBottom: 8 },
  histStats: { flexDirection: "row", gap: 14 },
  histStat: { color: T.textFaint, fontSize: 12, fontWeight: "600" },

  addPill: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: T.accent, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.28)" },
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
