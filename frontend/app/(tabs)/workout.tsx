import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useIsFocused } from "@react-navigation/native";

import { RestTimer } from "@/src/anatomy/RestTimer";
import { ExerciseStack } from "@/src/anatomy/ExerciseStack";
import { useReducedMotion } from "@/src/components/useReducedMotion";
import { getExercise } from "@/src/anatomy/exercises";
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
import { R } from "@/src/theme/tokens";
import { ErrorBanner } from "@/src/ui/state";
import { A11yControl } from "@/src/ui/A11yControl";
import { LiquidSheen } from "@/src/ui/GlassSurface";

export default function WorkoutScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ seg?: string; ex?: string }>();
  const w = useWorkout();
  // Progression targets follow the rep range the plan was built around.
  const goal = usePlanStore((s) => s.answers.goal);
  const { mode } = useTheme();
  const isFocused = useIsFocused();
  const T = useMemo(() => legacyPalette(mode), [mode]);
  const styles = useMemo(() => makeStyles(T), [T]);

  const [restVisible, setRestVisible] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  // The exercise in hand. Removing an exercise can leave the index past the
  // end, so it is clamped whenever the session shrinks.
  const [current, setCurrent] = useState(0);
  const sessionLength = w.session?.length ?? 0;
  useEffect(() => {
    if (sessionLength > 0 && current > sessionLength - 1) setCurrent(sessionLength - 1);
  }, [sessionLength, current]);
  const front = w.session && sessionLength > 0 ? w.session[Math.min(current, sessionLength - 1)] : null;
  const frontEx = front ? getExercise(front.exerciseId) : null;
  const reduceMotion = useReducedMotion();
  // An empty Workout tab has nothing to offer, so it hands back to Today rather
  // than presenting a dead end. `replace` keeps it out of the back stack: a
  // finished workout must not bounce the user back into an empty session.
  // Nothing is decided until the store has hydrated — before that the session
  // is null whether or not one is saved, and a cold start on this tab would
  // otherwise bounce a user away from the workout they were in the middle of.
  useEffect(() => {
    if (!w.hydrated) return;
    if (isFocused && (!w.session || w.session.length === 0) && !finishing) {
      router.replace("/(tabs)/plan");
    }
  }, [w.hydrated, isFocused, w.session, finishing, router]);
  useEffect(() => {
    if (params.ex) w.addExercise(String(params.ex));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.ex]);

  // The rest timer belongs to a live session on the Session segment. Finishing or
  // cancelling the workout, moving to another segment, or leaving the tab closes it
  // — otherwise the modal stays mounted over whatever the user opens next and
  // swallows their taps.
  useEffect(() => {
    if (!w.session || !isFocused) setRestVisible(false);
  }, [w.session, isFocused]);

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
      {/* One destination, one header. The Workout tab is the live session and
          nothing else — Muscle Groups, History and Insights each moved to where
          they belong, so this tab no longer hides four screens behind a
          segmented control. */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.headerTitle}>Workout</Text>
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

      {/* An empty Workout tab is a dead end, so it never renders one: the
          redirect above returns to Today, which owns starting a workout. This
          branch only covers the frame between that decision and the navigation
          landing. */}
      {!w.session || w.session.length === 0 ? null : (
        <View style={styles.full}>
          <>
              <View style={styles.statsBar}>
                <LiquidSheen tone="neutral" />
                <SBStat label="Exercises" value={`${w.session.length}`} styles={styles} />
                <SBStat label="Sets" value={`${stats.completed}/${stats.sets}`} styles={styles} />
                <SBStat label="Volume" value={`${stats.volume} ${w.unit}`} styles={styles} />
              </View>
              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 96 }}
              >
                {/* One exercise at a time. The stack shows the exercise in hand
                    with its neighbours peeking out behind it; a horizontal swipe
                    or the arrows below move through the session, and the demo
                    card underneath always follows the exercise in front. */}
                <ExerciseStack
                  items={w.session}
                  keyOf={(se) => se.exerciseId}
                  index={current}
                  onIndexChange={setCurrent}
                  reduceMotion={reduceMotion}
                  testID="exercise-stack"
                  renderCard={(se) => (
                    <SessionCard
                      se={se}
                      history={w.history}
                      unit={w.unit}
                      goal={goal}
                      styles={styles}
                      T={T}
                      w={w}
                      onToggleDone={onToggleDone}
                    />
                  )}
                />
                <View style={styles.stackNav}>
                  <A11yControl
                    label="Previous exercise"
                    onPress={() => setCurrent((c) => Math.max(0, c - 1))}
                    disabled={current === 0}
                    style={styles.stackNavBtn}
                    testID="stack-prev"
                  >
                    <LiquidSheen tone="neutral" />
                    <Ionicons name="chevron-back" size={20} color={current === 0 ? T.textFaint : T.text} />
                  </A11yControl>
                  <Text style={styles.stackCount} accessibilityLiveRegion="polite">
                    {Math.min(current, sessionLength - 1) + 1} of {sessionLength}
                  </Text>
                  <A11yControl
                    label="Next exercise"
                    onPress={() => setCurrent((c) => Math.min(sessionLength - 1, c + 1))}
                    disabled={current >= sessionLength - 1}
                    style={styles.stackNavBtn}
                    testID="stack-next"
                  >
                    <LiquidSheen tone="neutral" />
                    <Ionicons name="chevron-forward" size={20} color={current >= sessionLength - 1 ? T.textFaint : T.text} />
                  </A11yControl>
                </View>

                {/* How the exercise in front is done. The form demo lives here,
                    once, instead of on every card. */}
                {front && (
                  <View style={styles.demoCard} testID="demo-card">
                    <LiquidSheen tone="subtle" />
                    <Text style={styles.demoTitle}>HOW TO DO IT</Text>
                    <Text style={styles.demoName}>{frontEx?.name}</Text>
                    <ExerciseAnimation exerciseId={front.exerciseId} exerciseName={frontEx?.name} variant="workout" />
                  </View>
                )}
                <A11yControl
                  label="Add exercise"
                  onPress={() => router.push({ pathname: "/(tabs)/library", params: { seg: "exercises" } })}
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
        </View>
      )}

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
  history,
  unit,
  goal,
  styles,
  T,
  w,
  onToggleDone,
}: {
  se: SessionExercise;
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
    () => exercisePerformances(history, se.exerciseId, se.idSpace ?? "anatomy", unit),
    [history, se.exerciseId, se.idSpace, unit],
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

  return (
    <View style={styles.exCard}>
      <LiquidSheen tone="neutral" />
      <View style={styles.exCardHead}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
          <Text style={styles.exCardName} numberOfLines={2}>{ex?.name}</Text>
          {bodyweight && (
            <View style={styles.bwBadge}>
              <Text style={styles.bwBadgeText}>BW</Text>
            </View>
          )}
        </View>
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

      {/* Next target, derived from this exercise's own completed sets. The row
          is ALWAYS rendered: when it only appeared for exercises with history,
          cards in the stack were different heights and the deck looked ragged.
          With no history it states that plainly instead of inventing a target —
          same shape, no claim. */}
      <View
        style={[styles.suggestCard, !suggestion && styles.suggestCardEmpty]}
        testID={suggestion ? `suggest-${se.exerciseId}` : `suggest-empty-${se.exerciseId}`}
      >
        <Ionicons name="trending-up" size={15} color={suggestion ? T.accent : T.textFaint} />
        {suggestion ? (
          <View style={{ flex: 1 }}>
            <Text style={styles.suggestHeadline}>{suggestion.headline}</Text>
            <Text style={styles.suggestBasis}>{suggestion.basis}</Text>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <Text style={[styles.suggestHeadline, { color: T.textDim }]}>No target yet</Text>
            <Text style={styles.suggestBasis}>Complete a set and your next one appears here.</Text>
          </View>
        )}
        {suggestion && (
          <>
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
          </>
        )}
      </View>

      <View style={styles.setHeadRow}>
        <Text style={[styles.setHead, { width: 44, textAlign: "center" }]}>SET</Text>
        <Text style={[styles.setHead, { flex: 1 }]}>{loadColumnLabel(unit, bodyweight)}</Text>
        <Text style={[styles.setHead, { flex: 1 }]}>REPS</Text>
        <Text style={[styles.setHead, { width: 88, textAlign: "center" }]}>DONE</Text>
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
                  <Ionicons name="trophy" size={13} color={T.pr} />
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
          <Ionicons name="trophy" size={13} color={T.pr} />
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
      <Text style={styles.overloadNote}>{OVERLOAD_NOTE}</Text>
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
  // The session is now a normal flex child under the header rather than an
  // absolutely positioned overlay competing with a floating segmented control.
  full: { flex: 1, backgroundColor: T.bg },
  header: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingBottom: 10 },
  headerTitle: { flex: 1, color: T.text, fontSize: 22, fontWeight: "800" },
  unitBtn: {
    minWidth: 44, height: 44, paddingHorizontal: 10, borderRadius: 22, 
    backgroundColor: T.surface, alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  unitText: { color: T.text, fontSize: 13, fontWeight: "800" },
  bwBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: T.accent + "22" },
  bwBadgeText: { color: T.accent, fontSize: 10.5, fontWeight: "800" },
  finishErrorWrap: { position: "absolute", left: 16, right: 16 },
  statsBar: { flexDirection: "row", marginHorizontal: 16, marginBottom: 14, backgroundColor: T.surfaceSolid, borderRadius: 22, paddingVertical: 12, overflow: "hidden" },
  sbStat: { flex: 1, alignItems: "center" },
  sbValue: { color: T.accent, fontSize: 17, fontWeight: "800" },
  sbLabel: { color: T.textFaint, fontSize: 11, marginTop: 2 },

  // 12 all round, so the thumbnail's left gap matches its top and bottom gaps.
  // Opaque, not translucent: stack cards sit ON one another, so any alpha
  // shows the card behind through the one in front.
  exCard: { backgroundColor: T.surfaceSolid, borderRadius: 22, padding: 12, overflow: "hidden" },
  stackNav: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 14, marginTop: 14, marginBottom: 14 },
  stackNavBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", overflow: "hidden", backgroundColor: T.surfaceHi },
  stackCount: { color: T.textDim, fontSize: 12.5, fontWeight: "700", minWidth: 56, textAlign: "center" },
  demoCard: { backgroundColor: T.surfaceSolid, borderRadius: 22, padding: 12, marginBottom: 14, overflow: "hidden" },
  demoTitle: { color: T.textFaint, fontSize: 11, fontWeight: "800", letterSpacing: 0.9 },
  demoName: { color: T.text, fontSize: 15, fontWeight: "800", marginTop: 2, marginBottom: 12 },
  exCardHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  exCardName: { color: T.text, fontSize: 16, fontWeight: "800" },
  headBtn: {
    width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center",
    overflow: "hidden", backgroundColor: T.surfaceHi,
  },
  suggestCard: {
    // Needs a bottom gap of its own: without one its rounded edge sat directly
    // on the SET / KG / REPS / DONE header row.
    flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10, marginBottom: 12,
    backgroundColor: T.accent + "14", borderWidth: 1, borderColor: T.accent + "44",
    borderRadius: 22, paddingHorizontal: 12, paddingVertical: 10,
  },
  suggestHeadline: { color: T.text, fontSize: 14, fontWeight: "800" },
  suggestBasis: { color: T.textDim, fontSize: 11.5, marginTop: 2 },
  suggestApply: {
    paddingHorizontal: 14, minHeight: 36, borderRadius: 999, overflow: "hidden",
    alignItems: "center", justifyContent: "center", backgroundColor: T.accent,
  },
  suggestApplyText: { color: T.bg, fontSize: 12.5, fontWeight: "800" },
  suggestCardEmpty: { backgroundColor: T.surfaceHi, borderColor: T.border },
  overloadNote: { color: T.textFaint, fontSize: 10.5, lineHeight: 15, marginTop: 8 },

  prFlag: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  prNote: {
    flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8,
    backgroundColor: T.pr + "1F", borderRadius: R.sm, paddingHorizontal: 10, paddingVertical: 7,
  },
  prNoteText: { color: T.pr, fontSize: 11.5, fontWeight: "700", flex: 1 },

  setHeadRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  setHead: { color: T.textFaint, fontSize: 11, fontWeight: "700" },
  setRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 3 },
  setRowDone: { opacity: 0.85 },
  setIdxBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  setIdx: { color: T.text, fontSize: 14, fontWeight: "700" },
  warmPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: R.pill, backgroundColor: T.surfaceHi, },
  warmPillText: { color: T.textDim, fontSize: 11, fontWeight: "800" },
  setInput: { flex: 1, minWidth: 0, backgroundColor: T.surfaceHi, borderRadius: 22, paddingVertical: 8, textAlign: "center", color: T.text, fontSize: 15, fontWeight: "600", },
  // Each control keeps its 18-24px glyph but owns a full 44x44 target.
  setActions: { width: 88, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  setActionBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", overflow: "hidden", backgroundColor: T.surfaceHi },
  addSet: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, marginTop: 6, borderRadius: 22, backgroundColor: T.surfaceHi, overflow: "hidden", },
  addSetText: { color: T.accent, fontSize: 13, fontWeight: "700" },
  notes: { backgroundColor: T.bg2, borderRadius: 22, paddingHorizontal: 12, paddingVertical: 8, color: T.text, fontSize: 14, marginTop: 8, },
  addExBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 22, overflow: "hidden", backgroundColor: T.surfaceHi },
  addExText: { color: T.accent, fontSize: 14, fontWeight: "700" },
  finishBar: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 12, backgroundColor: T.bg },
  cancelBtn: { paddingHorizontal: 20, paddingVertical: 14, borderRadius: 22, backgroundColor: T.surfaceHi, alignItems: "center", justifyContent: "center", overflow: "hidden", },
  cancelText: { color: T.textDim, fontSize: 14, fontWeight: "700" },
  finishBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: T.accent, borderRadius: 22, paddingVertical: 14, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.28)" },
  finishText: { color: T.bg, fontSize: 15, fontWeight: "800" },
});
