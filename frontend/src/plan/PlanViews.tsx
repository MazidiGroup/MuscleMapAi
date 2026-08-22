// Weekly plan + Workout day + Swap sheet.
//
// - Weekly view: header (logo + "Adjust plan" + theme toggle), summary chips,
//   7 day cards Mon-Sun with poster stack + target muscles line.
// - Day view: exercise cards with poster, muscle caps, badges, and tap-to-tick.
// - Swap sheet: bottom-sheet listing up to 6 alternatives; "Use" replaces.

import React, { useMemo, useState } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Modal, Pressable, Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { useTheme } from "@/src/theme/ThemeContext";
import { useSemanticTokens } from "@/src/theme/semantic";
import { R } from "@/src/theme/tokens";
import { ActionButton, InfoBanner, InterruptedSessionCard, RetryPanel } from "@/src/ui/state";
import { A11yControl } from "@/src/ui/A11yControl";
import { usePlanStore, todayISO } from "./planStore";
import { AdjustPlanSheet } from "./AdjustPlanSheet";
import { daysSummary } from "./onboarding";
import { entryFor, alternativesFor, MUSCLE_LABEL, GOAL_LABEL, REGION_LABEL } from "./planAdapter";
import type { PlanDay, PlanExerciseEntry } from "./exercises";
import { posterUrl } from "@/src/anatomy/media";
import { useWorkout } from "@/src/anatomy/workoutStore";
import { isCountableSet } from "@/src/anatomy/setRules";
import { usePremium } from "@/src/premium/PremiumContext";
import { LiquidSheen } from "@/src/ui/GlassSurface";
import { ThemeSwitcher } from "@/src/ui/ThemeSwitcher";
import { PremiumDiscoveryCard, PremiumValueMoment } from "@/src/premium/PremiumDiscovery";

export function WeeklyPlan({ onOpenDay, onEditAnswers }: { onOpenDay: (i: number) => void; onEditAnswers: () => void }) {
  const { T } = useTheme();
  const t = useSemanticTokens();
  const router = useRouter();
  const plan = usePlanStore(s => s.plan);
  const w = useWorkout();
  const { resolution } = usePremium();
  const [adjusting, setAdjusting] = useState(false);
  if (!plan) return null;
  const { answers, splitLabel, days } = plan;

  const hasActiveWorkout = w.session !== null;
  const activeSets = (w.session || []).reduce((a, e) => a + e.sets.length, 0);
  const activeDone = (w.session || []).reduce((a, e) => a + e.sets.filter(isCountableSet).length, 0);
  const todayIdx = (new Date().getDay() + 6) % 7;
  const todayDay = days[todayIdx];

  // A session started under a previous plan must not be advertised as part of
  // this week. The seed changes whenever the plan is regenerated, so a mismatch
  // is proof the session outlived the plan it came from. A session saved before
  // v1.2.0 carries no seed and is left alone rather than guessed at.
  const staleSession =
    hasActiveWorkout && w.sessionPlanSeed !== null && w.sessionPlanSeed !== plan.seed;

  const openSession = () => router.push({ pathname: "/(tabs)/workout", params: { seg: "session" } });
  const previewPremium = () => router.push("/(tabs)/coach");

  return (
    <ScrollView style={{ flex: 1, backgroundColor: T.bg }} contentContainerStyle={styles.wpScroll}>
      <View style={styles.wpHeader}>
        <Text style={[styles.wpTitle, { color: T.text }]}>Your weekly plan</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity
            style={[styles.adjustBtn, { backgroundColor: T.accent }]}
            onPress={() => setAdjusting(true)}
            accessibilityRole="button"
            accessibilityLabel="Adjust plan"
            testID="wp-adjust"
          >
            <LiquidSheen tone="accent" />
            <Ionicons name="options-outline" size={14} color={T.ctaText} />
            <Text style={[styles.adjustText, { color: T.ctaText }]}>Adjust plan</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ThemeSwitcher compact style={{ marginTop: 8 }} />

      <View style={styles.chipsRow}>
        <Chip label={GOAL_LABEL[answers.goal]} />
        <Chip label={daysSummary(answers.days)} />
        <Chip label={splitLabel} />
        {answers.focus.map(f => (
          <Chip key={f} label={`Focus: ${REGION_LABEL[f]}`} tone="focus" />
        ))}
        {answers.posture && <Chip label="Posture work" tone="posture" />}
      </View>

      {/* Resuming an active session and starting a new workout are separate actions. */}
      <View style={{ marginTop: 20 }}>
        {hasActiveWorkout ? (
          <InterruptedSessionCard
            title={staleSession ? "Workout from your previous plan" : "Workout in progress"}
            body={
              staleSession
                ? "You rebuilt your plan while this workout was open. It is still here and every set you logged is saved — finishing it will record it to your History."
                : "Pick up exactly where you left off — every set you logged is saved on this device."
            }
            facts={[
              ["Exercises", String((w.session || []).length)],
              ["Sets logged", `${activeDone} of ${activeSets}`],
            ]}
            resume={{
              label: staleSession ? "Resume anyway" : "Resume workout",
              onPress: openSession,
              testID: "wp-resume-session",
            }}
            // Discarding is only offered for a session the current plan no longer
            // knows about, and it is the user's explicit choice — never automatic.
            discard={
              staleSession
                ? { label: "Discard it and start fresh", onPress: w.cancel, testID: "wp-discard-stale" }
                : undefined
            }
            testID={staleSession ? "wp-stale-session" : "wp-active-session"}
          />
        ) : todayDay && !todayDay.rest ? (
          <ActionButton
            label={`Start today's workout · ${todayDay.typeName}`}
            onPress={() => onOpenDay(todayIdx)}
            testID="wp-start-today"
          />
        ) : (
          <InfoBanner
            title="Today is a rest day"
            message="Tap any training day below to start that workout instead."
            testID="wp-rest-today"
          />
        )}
      </View>

      {/* Discovery only appears once entitlement is actually resolved: a
          subscriber must never see a Premium pitch while RevenueCat loads. */}
      {!resolution.access && resolution.state === "ready" ? (
        <View style={{ marginTop: 14 }}>
          <PremiumDiscoveryCard
            contextTitle={todayDay && !todayDay.rest ? todayDay.typeName : "your weekly plan"}
            onPress={previewPremium}
            testID="wp-premium-preview"
          />
        </View>
      ) : null}

      <View style={{ gap: 10, marginTop: 20 }}>
        {days.map((day, i) => (
          <DayCard key={i} day={day} onPress={() => !day.rest && onOpenDay(i)} />
        ))}
      </View>

      <View style={styles.wpFooter}>
        <TouchableOpacity
          style={[styles.footBtn, { borderColor: T.border, backgroundColor: T.card, minHeight: t.target.min }]}
          onPress={onEditAnswers}
          testID="wp-edit"
        >
          <LiquidSheen tone="neutral" />
          <Ionicons name="create-outline" size={14} color={T.text2} />
          <Text style={[styles.footBtnText, { color: T.text2 }]}>Change my answers</Text>
        </TouchableOpacity>
      </View>

      <AdjustPlanSheet visible={adjusting} hasActiveWorkout={hasActiveWorkout} onDismiss={() => setAdjusting(false)} />
      <PremiumValueMoment
        enabled={!resolution.access && resolution.state === "ready"}
        planName={todayDay && !todayDay.rest ? todayDay.typeName : splitLabel}
        onPreview={previewPremium}
      />
    </ScrollView>
  );
}

function Chip({ label, tone }: { label: string; tone?: "focus" | "posture" }) {
  const { T } = useTheme();
  const bg =
    tone === "focus" ? T.focusRedBg :
    tone === "posture" ? T.accent + "22" : T.cardAlt;
  const color =
    tone === "focus" ? T.focusRed :
    tone === "posture" ? T.accentText : T.text2;
  const border =
    tone === "focus" ? T.focusRed + "55" :
    tone === "posture" ? T.accent + "55" : T.border;
  return (
    <View style={[styles.chip, { backgroundColor: bg, borderColor: border }]}>
      <LiquidSheen tone={tone === "focus" ? "danger" : "subtle"} />
      <Text style={[styles.chipText, { color }]}>{label}</Text>
    </View>
  );
}

/**
 * Resolves a planned day's exercises against the stored swaps, so the weekly
 * schedule, the day view and the session all show the exercise the user actually
 * chose. Anything unswapped passes through untouched.
 */
export function resolveDayExercises(
  exercises: PlanExerciseEntry[] | undefined,
  swaps: Record<string, string>,
  answers: any,
): PlanExerciseEntry[] {
  return (exercises || []).map((e) => {
    const to = swaps[e.id];
    if (!to || to === e.id) return e;
    try {
      return { ...entryFor(to, answers), badge: e.badge };
    } catch {
      return e; // an id we can no longer resolve must never blank the plan
    }
  });
}

function DayCard({ day, onPress }: { day: PlanDay; onPress: () => void }) {
  const { T } = useTheme();
  const completions = usePlanStore(s => s.completions);
  const swaps = usePlanStore(s => s.swaps);
  const answers = usePlanStore(s => s.answers);
  const w = useWorkout();
  if (day.rest) {
    return (
      <View style={[styles.restCard, { borderColor: T.borderDashed, backgroundColor: T.cardAlt }]}>
        <LiquidSheen tone="subtle" />
        <Text style={[styles.restCaps, { color: T.textCaps }]}>{day.dow.slice(0, 3).toUpperCase()}</Text>
        <Text style={[styles.restText, { color: T.textMuted }]}>Rest &amp; recover</Text>
      </View>
    );
  }
  const dateKey = todayISO();
  // The weekly card shows the exercises the user actually chose, swaps included.
  const exs = resolveDayExercises(day.exercises, swaps, answers);
  const doneCount = exs.filter((ex) => {
    const se = w.session?.find((s) => s.exerciseId === ex.id);
    const live = !!se && se.sets.length > 0 && se.sets.every(isCountableSet);
    return live || !!completions[`${dateKey}:${ex.id}`];
  }).length;
  const allDone = exs.length > 0 && doneCount === exs.length;
  // The muscle summary is derived from THIS day's exercises and lists every group
  // they represent, so days with different exercises read differently.
  const muscles = Array.from(new Set(exs.map((ex) => ex.muscle).filter(Boolean))).map(
    (m) => MUSCLE_LABEL[m as keyof typeof MUSCLE_LABEL] || String(m),
  );
  // The card is the control that starts this day's workout, so it is a real
  // button and its name carries the day, the session, its length and its muscles
  // (the name replaces the card's text for a screen reader).
  const label =
    `${day.dow}, ${day.typeName}, about ${day.minutes} minutes` +
    (muscles.length ? `, ${muscles.join(", ")}` : "") +
    (doneCount > 0 ? `, ${doneCount} of ${exs.length} done` : "");
  return (
    <A11yControl
      label={label}
      onPress={onPress}
      style={[styles.dayCard, { backgroundColor: T.card, borderColor: allDone ? T.accent : T.border }]}
      testID={`day-card-${day.dow}`}
    >
      <LiquidSheen tone="neutral" />
      <View style={styles.dayCardTop}>
        <Text style={[styles.dowCaps, { color: T.textCaps }]}>{day.dow.slice(0, 3).toUpperCase()}</Text>
        {doneCount > 0 ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Ionicons name={allDone ? "checkmark-circle" : "ellipse-outline"} size={13} color={allDone ? T.accent : T.textMuted} />
            <Text style={[styles.dayMin, { color: allDone ? T.accent : T.textMuted }]}>{doneCount}/{exs.length} done</Text>
          </View>
        ) : (
          <Text style={[styles.dayMin, { color: T.textMuted }]}>~{day.minutes} min</Text>
        )}
      </View>
      <Text style={[styles.dayTitle, { color: T.text }]}>{day.typeName}</Text>
      <View style={styles.posterStack}>
        {day.exercises!.slice(0, 3).map((ex, idx) => (
          <View
            key={ex.id}
            style={[
              styles.posterThumb,
              {
                backgroundColor: T.posterBg,
                borderColor: T.border,
                marginLeft: idx === 0 ? 0 : -8,
                zIndex: 3 - idx,
              },
            ]}
          >
            <Image source={{ uri: posterUrl(ex.id) }} style={styles.posterImg} />
          </View>
        ))}
      </View>
      <Text style={[styles.dayMuscles, { color: T.text2 }]} numberOfLines={2}>
        {muscles.join(" · ")}
      </Text>
    </A11yControl>
  );
}

// ---- Workout Day view ----------------------------------------------------
export function WorkoutDay({ dayIndex, onBack }: { dayIndex: number; onBack: () => void }) {
  const { T } = useTheme();
  const router = useRouter();
  const w = useWorkout();
  const plan = usePlanStore(s => s.plan);
  const completions = usePlanStore(s => s.completions);
  const [swapId, setSwapId] = useState<string | null>(null);
  const [startFailed, setStartFailed] = useState(false);
  const swaps = usePlanStore(s => s.swaps);
  const setSwap = usePlanStore(s => s.setSwap);
  const answers = usePlanStore(s => s.answers);
  if (!plan) return null;
  const day = plan.days[dayIndex];
  if (day.rest) return null;
  const dateKey = todayISO();

  const planned = day.exercises || [];
  const items = resolveDayExercises(planned, swaps, answers);
  const hasActiveWorkout = w.session !== null;

  // Starting a new workout and resuming the active one are distinct actions:
  // resuming never rewrites the session the user is already logging.
  const startWorkout = () => {
    setStartFailed(false);
    try {
      // The planned set count travels with the exercise into the session.
      for (const it of items) w.addExerciseFromPlan(it.id, dateKey, it.sets, day.typeName);
    } catch {
      // Nothing is half-started, and we never retry behind the user's back: the
      // retry below only runs when they ask for it.
      setStartFailed(true);
      return;
    }
    router.push({ pathname: "/(tabs)/workout", params: { seg: "session" } });
  };
  const resumeWorkout = () => router.push({ pathname: "/(tabs)/workout", params: { seg: "session" } });

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <View style={styles.dayHeader}>
        <TouchableOpacity
          style={[styles.headerBtn, { backgroundColor: T.card, borderColor: T.border }]}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back to my weekly plan"
          testID="day-back"
        >
          <LiquidSheen tone="neutral" />
          <Ionicons name="chevron-back" size={18} color={T.text2} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={[styles.dayHeaderTitle, { color: T.text }]}>
            {day.dow} · {day.typeName}
          </Text>
          <Text style={[styles.dayHeaderMeta, { color: T.textMuted }]}>
            {items.length} exercises
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.startAllBtn, { backgroundColor: T.accent }]}
          onPress={hasActiveWorkout ? resumeWorkout : startWorkout}
          accessibilityRole="button"
          accessibilityLabel={hasActiveWorkout ? "Resume active workout" : "Start this workout"}
          testID={hasActiveWorkout ? "resume-session" : "start-session"}
        >
          <LiquidSheen tone="accent" />
          <Text style={{ color: T.ctaText, fontWeight: "800", fontSize: 12 }}>
            {hasActiveWorkout ? "Resume" : "Start"}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {startFailed && (
          <View style={{ marginBottom: 16 }}>
            <RetryPanel
              title="We couldn't start this workout"
              body="Nothing was logged and your plan has not changed."
              preserved={["Your plan", "Completed workouts", "Your History"]}
              retry={{ label: "Try again", onPress: startWorkout, testID: "start-retry" }}
              secondary={{ label: "Back to my weekly plan", onPress: onBack, testID: "start-back" }}
              testID="start-failed"
            />
          </View>
        )}
        {items.map((ex, exIdx) => {
          // Swaps are keyed by the PLANNED id, which is what survives regeneration.
          const plannedId = planned[exIdx]?.id ?? ex.id;
          // Swapped when the resolved exercise is no longer the planned one.
          const swappedFrom = swaps[plannedId] && swaps[plannedId] !== plannedId ? planned[exIdx] : null;
          const sessionEx = w.session?.find((s) => s.exerciseId === ex.id);
          const sessionDone = !!sessionEx && sessionEx.sets.length > 0 && sessionEx.sets.every(isCountableSet);
          const done = sessionDone || !!completions[`${dateKey}:${ex.id}`];
          const inSession = !!sessionEx;
          return (
            <View key={ex.id} style={[styles.exCard, { backgroundColor: T.card, borderColor: T.border }]}>
              <LiquidSheen tone="neutral" />
              <View style={[styles.exPoster, { backgroundColor: T.posterBg, borderColor: T.border }]}>
                <Image source={{ uri: posterUrl(ex.id) }} style={{ width: "100%", height: "100%" }} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={[styles.exMuscleCap, { color: T.textCaps }]}>
                    {MUSCLE_LABEL[ex.muscle].toUpperCase()}
                  </Text>
                  {ex.badge && (
                    <View style={[
                      styles.exBadge,
                      { backgroundColor: ex.badge === "FOCUS" ? T.focusRedBg : T.accent + "22" },
                    ]}>
                      <Text style={{
                        fontSize: 9.5, fontWeight: "800",
                        color: ex.badge === "FOCUS" ? T.focusRed : T.accentText,
                      }}>{ex.badge}</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.exName, { color: T.text }]}>{ex.name}</Text>
                <Text style={[styles.exMeta, { color: T.textMuted }]}>
                  {ex.sets} sets · {ex.repsOrTime}
                </Text>
                {/* Says what was replaced and undoes it in one tap. Clearing the
                    swap restores the planned exercise; nothing logged is touched. */}
                {swappedFrom && (
                  <TouchableOpacity
                    style={[styles.swappedRow, { borderColor: T.border, backgroundColor: T.cardAlt }]}
                    onPress={() => setSwap(plannedId, plannedId)}
                    accessibilityRole="button"
                    accessibilityLabel={`Swapped from ${swappedFrom.name}. Restore ${swappedFrom.name}.`}
                    testID={`restore-${plannedId}`}
                  >
                    <Ionicons name="swap-horizontal" size={11} color={T.textCaps} />
                    <Text style={[styles.swappedText, { color: T.text2 }]} numberOfLines={1}>
                      Swapped from {swappedFrom.name}
                    </Text>
                    <Text style={[styles.swappedUndo, { color: T.accentText }]}>Restore</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={{ gap: 8, alignItems: "center" }}>
                {/* Read-only tick — becomes solid once every set is completed in Session. */}
                <View style={[
                  styles.tickBtn,
                  { borderColor: done ? T.accent : T.border, backgroundColor: done ? T.accent : "transparent" },
                ]}>
                  <Ionicons name={done ? "checkmark" : "ellipse-outline"} size={18} color={done ? T.ctaText : T.textMuted} />
                </View>
                <TouchableOpacity
                  style={[
                    styles.addBtn,
                    { borderColor: inSession ? T.accent : T.border, backgroundColor: inSession ? T.accent + "22" : "transparent" },
                  ]}
                  onPress={() => {
                    if (!inSession) w.addExerciseFromPlan(ex.id, dateKey, ex.sets, day.typeName);
                  }}
                  testID={`add-${ex.id}`}
                >
                  <LiquidSheen tone={inSession ? "accent" : "neutral"} />
                  <Ionicons name={inSession ? "checkmark-circle" : "add"} size={16} color={inSession ? T.accent : T.text2} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.swapBtn, { borderColor: T.border }]}
                  onPress={() => setSwapId(plannedId)}
                  testID={`swap-${ex.id}`}
                >
                  <LiquidSheen tone="neutral" />
                  <Ionicons name="swap-horizontal" size={16} color={T.text2} />
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <SwapSheet
        visible={swapId !== null}
        currentId={swapId}
        excludeIds={items.map(i => i.id)}
        onDismiss={() => setSwapId(null)}
        onPick={(newEntry) => {
          // Stored against the planned id, so swapping again just updates the mapping
          // and swapping back to the original removes it.
          if (swapId) setSwap(swapId, newEntry.id);
          setSwapId(null);
        }}
      />
    </View>
  );
}

function SwapSheet({ visible, currentId, excludeIds, onDismiss, onPick }: {
  visible: boolean;
  currentId: string | null;
  excludeIds: string[];
  onDismiss: () => void;
  onPick: (e: PlanExerciseEntry) => void;
}) {
  const { T } = useTheme();
  const answers = usePlanStore(s => s.answers);
  const alts = useMemo(() => {
    if (!currentId || !answers.goal) return [];
    return alternativesFor(currentId, answers as any, excludeIds).slice(0, 6);
  }, [currentId, excludeIds, answers]);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.sheetBackdrop} onPress={onDismiss} />
      <View style={[styles.sheet, { backgroundColor: T.card, borderColor: T.border }]}>
        <LiquidSheen tone="neutral" />
        <Text style={[styles.sheetTitle, { color: T.text }]}>Swap this exercise</Text>
        <ScrollView style={{ maxHeight: 400 }}>
          {alts.length === 0 && (
            <Text style={{ color: T.textMuted, paddingVertical: 20 }}>No alternatives available.</Text>
          )}
          {alts.map(a => {
            const entry = entryFor(a.id, answers as any);
            return (
              <View key={a.id} style={[styles.altRow, { borderBottomColor: T.border }]}>
                <View style={[styles.altPoster, { backgroundColor: T.posterBg, borderColor: T.border }]}>
                  <Image source={{ uri: posterUrl(a.id) }} style={{ width: "100%", height: "100%" }} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={{ color: T.textCaps, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 }}>
                    {MUSCLE_LABEL[a.muscle].toUpperCase()}
                  </Text>
                  <Text style={{ color: T.text, fontWeight: "700", fontSize: 14 }}>{entry.name}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.usePill, { backgroundColor: T.accent }]}
                  onPress={() => onPick(entry)}
                  testID={`use-${a.id}`}
                >
                  <LiquidSheen tone="accent" />
                  <Text style={{ color: T.ctaText, fontWeight: "800", fontSize: 13 }}>Use</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ---- Styles --------------------------------------------------------------
const styles = StyleSheet.create({
  wpScroll: { padding: 20, paddingTop: 56, paddingBottom: 40 },
  wpHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingBottom: 8,
  },
  wpTitle: { fontSize: 26, fontWeight: "700" },
  dayHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 8,
  },
  headerBtn: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 1,
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  adjustBtn: {
    flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44,
    paddingHorizontal: 14, borderRadius: R.pill, overflow: "hidden", borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
  },
  adjustText: { fontSize: 12.5, fontWeight: "800" },

  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: R.pill, borderWidth: 1, overflow: "hidden" },
  chipText: { fontSize: 11, fontWeight: "700" },

  dayCard: { borderRadius: R.xl, borderWidth: 1, padding: 14, overflow: "hidden" },
  dayCardTop: { flexDirection: "row", justifyContent: "space-between" },
  dowCaps: { fontSize: 11, fontWeight: "800", letterSpacing: 1.4 },
  dayMin: { fontSize: 11 },
  dayTitle: { fontSize: 17.5, fontWeight: "700", marginTop: 4 },
  posterStack: { flexDirection: "row", marginTop: 10 },
  posterThumb: {
    width: 36, height: 36, borderRadius: 11, borderWidth: 1, overflow: "hidden",
  },
  posterImg: { width: "100%", height: "100%" },
  dayMuscles: { fontSize: 12, marginTop: 8 },

  restCard: {
    borderRadius: R.xl, borderWidth: 1, borderStyle: "dashed", padding: 14,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center", overflow: "hidden",
  },
  restCaps: { fontSize: 11, fontWeight: "800", letterSpacing: 1.4 },
  restText: { fontSize: 13, fontStyle: "italic" },

  wpFooter: { flexDirection: "row", justifyContent: "center", marginTop: 20 },
  footBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: R.pill, borderWidth: 1, overflow: "hidden",
  },
  footBtnText: { fontSize: 12, fontWeight: "700" },

  dayHeaderTitle: { fontSize: 17, fontWeight: "700" },
  dayHeaderMeta: { fontSize: 12, marginTop: 2 },

  exCard: {
    flexDirection: "row", padding: 12, borderRadius: R.lg, borderWidth: 1, marginBottom: 10, alignItems: "center", overflow: "hidden",
  },
  exPoster: { width: 86, height: 60, borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  exMuscleCap: { fontSize: 10.5, fontWeight: "800", letterSpacing: 1.2 },
  exBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: R.pill },
  exName: { fontSize: 14.5, fontWeight: "600", marginTop: 4 },
  exMeta: { fontSize: 12, marginTop: 4 },
  swappedRow: {
    flexDirection: "row", alignItems: "center", gap: 5, marginTop: 7,
    paddingHorizontal: 8, minHeight: 30, borderRadius: R.pill, borderWidth: 1, alignSelf: "flex-start",
  },
  swappedText: { fontSize: 10.5, fontWeight: "600", flexShrink: 1 },
  swappedUndo: { fontSize: 10.5, fontWeight: "800", textDecorationLine: "underline" },
  tickBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  addBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  swapBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  startAllBtn: { paddingHorizontal: 18, minHeight: 44, justifyContent: "center", borderRadius: R.pill, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.28)" },

  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 20, overflow: "hidden",
  },
  sheetTitle: { fontSize: 17, fontWeight: "700", marginBottom: 14 },
  altRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1 },
  altPoster: { width: 54, height: 40, borderRadius: 8, borderWidth: 1, overflow: "hidden" },
  usePill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: R.pill, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.28)" },
});
