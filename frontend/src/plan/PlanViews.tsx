// Weekly plan + Workout day + Swap sheet.
//
// - Weekly view: header (logo + "Adjust plan" + theme toggle), summary chips,
//   7 day cards Mon-Sun with poster stack + target muscles line.
// - Day view: exercise cards with poster, muscle caps, badges, and tap-to-tick.
// - Swap sheet: bottom-sheet listing up to 6 alternatives; "Use" replaces.

import React, { useMemo, useState } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Modal, Pressable, Image, TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle as SvgCircle } from "react-native-svg";
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
import { EXERCISES } from "./exercises";
import { posterUrl } from "@/src/anatomy/media";
import { useWorkout } from "@/src/anatomy/workoutStore";
import { isCountableSet } from "@/src/anatomy/setRules";
import { startOfWeek, weekSummary } from "@/src/history/metrics";
import { usePremium } from "@/src/premium/PremiumContext";
import { LiquidSheen } from "@/src/ui/GlassSurface";
import { PremiumDiscoveryCard, PremiumValueMoment } from "@/src/premium/PremiumDiscovery";

export function WeeklyPlan({ onOpenDay, onEditAnswers }: { onOpenDay: (i: number) => void; onEditAnswers: () => void }) {
  const { T } = useTheme();
  const t = useSemanticTokens();
  const router = useRouter();
  const plan = usePlanStore(s => s.plan);
  const w = useWorkout();
  const { resolution } = usePremium();
  const [adjusting, setAdjusting] = useState(false);
  const [showWeek, setShowWeek] = useState(false);
  const swaps = usePlanStore(s => s.swaps);
  if (!plan) return null;
  const { answers, splitLabel, days } = plan;

  const hasActiveWorkout = w.session !== null;
  const activeSets = (w.session || []).reduce((a, e) => a + e.sets.length, 0);
  const activeDone = (w.session || []).reduce((a, e) => a + e.sets.filter(isCountableSet).length, 0);
  const todayIdx = (new Date().getDay() + 6) % 7;
  const todayDay = days[todayIdx];
  const todayLabel = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }).toUpperCase();

  // This week's totals come from completed History only, so an open session
  // never inflates them and a rebuilt plan never resets them.
  const week = weekSummary(w.history);
  const weekStart = startOfWeek(Date.now());
  const weekWorkouts = w.history.filter((x) => x.date >= weekStart);
  const weekSets = weekWorkouts.reduce(
    (a, x) => a + x.exercises.reduce((b, e) => b + e.sets.filter(isCountableSet).length, 0),
    0,
  );
  const weekVolume = Math.round(
    weekWorkouts.reduce(
      (a, x) => a + x.exercises.reduce((b, e) => b + e.sets.filter(isCountableSet).reduce((c, st) => c + st.weight * st.reps, 0), 0),
      0,
    ),
  );

  // A session started under a previous plan must not be advertised as part of
  // this week. The seed changes whenever the plan is regenerated, so a mismatch
  // is proof the session outlived the plan it came from. A session saved before
  // v1.2.0 carries no seed and is left alone rather than guessed at.
  const staleSession =
    hasActiveWorkout && w.sessionPlanSeed !== null && w.sessionPlanSeed !== plan.seed;

  // Every muscle today's exercises train, swaps included — the same derivation
  // the day card uses, so the two can never disagree.
  const todayMuscles = Array.from(
    new Set(
      resolveDayExercises(todayDay?.rest ? [] : todayDay?.exercises, swaps, answers)
        .map((ex) => ex.muscle)
        .filter(Boolean),
    ),
  ).map((m) => MUSCLE_LABEL[m as keyof typeof MUSCLE_LABEL] || String(m));

  // The next training day, wrapping past Sunday so Saturday still has a "next".
  const nextDay = (() => {
    for (let step = 1; step <= 7; step += 1) {
      const index = (todayIdx + step) % 7;
      if (!days[index].rest) return { index, day: days[index] };
    }
    return null;
  })();

  const openSession = () => router.push({ pathname: "/(tabs)/workout", params: { seg: "session" } });
  const previewPremium = () => router.push("/(tabs)/coach");

  // "Start today's workout" goes straight into the session with every
  // exercise loaded — no intermediate day screen and no second tap. The day
  // view, with its swap and retry controls, stays reachable from the week
  // list below; it is also where a failed start lands, because that screen
  // already carries the explicit retry.
  const startToday = () => {
    if (!todayDay || todayDay.rest) return;
    const items = resolveDayExercises(todayDay.exercises, swaps, answers);
    const dateKey = todayISO();
    try {
      for (const it of items) w.addExerciseFromPlan(it.id, dateKey, it.sets, todayDay.typeName, it.repsOrTime, it.restSeconds);
    } catch {
      onOpenDay(todayIdx);
      return;
    }
    router.push("/(tabs)/workout");
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: T.bg }} contentContainerStyle={styles.wpScroll}>
      <View style={styles.wpHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.wpEyebrow, { color: T.textFaint }]}>{todayLabel}</Text>
          <Text style={[styles.wpTitle, { color: T.text }]}>Today</Text>
        </View>
        <TouchableOpacity
          style={[styles.adjustBtn, { backgroundColor: T.cardAlt, }]}
          onPress={() => setAdjusting(true)}
          accessibilityRole="button"
          accessibilityLabel="Adjust plan"
          testID="wp-adjust"
        >
          <LiquidSheen tone="neutral" />
          <Ionicons name="options-outline" size={14} color={T.text2} />
          <Text style={[styles.adjustText, { color: T.text2 }]}>Adjust plan</Text>
        </TouchableOpacity>
      </View>

      {/* The week as a strip: where today sits among the days around it, and
          the one control that moves between them. */}
      <DateStrip todayIdx={todayIdx} days={days} onOpenDay={onOpenDay} />

      {/* One card carries the whole answer to "what am I doing today": what it
          is, how long, what it trains, the plan it came from, the action, and
          where the week stands. */}
      <View style={[styles.heroCard, { backgroundColor: T.card }]} testID="today-hero">
        <LiquidSheen tone="neutral" />
        {todayDay && !todayDay.rest ? (
          <>
            <View style={styles.heroEyebrowRow}>
              <Text style={[styles.heroEyebrow, { color: T.accentText }]}>TODAY</Text>
              <Text style={[styles.heroDot, { color: T.textFaint }]}>•</Text>
              <Text style={[styles.heroEyebrow, { color: T.textFaint }]}>~{todayDay.minutes} MIN</Text>
            </View>
            <Text style={[styles.heroTitle, { color: T.text }]}>{todayDay.typeName}</Text>
            <Text style={[styles.heroMuscles, { color: T.text2 }]}>{todayMuscles.join("  ·  ")}</Text>
            <Text style={[styles.heroMeta, { color: T.textMuted }]}>
              {GOAL_LABEL[answers.goal]}  ·  {daysSummary(answers.days)}
            </Text>
          </>
        ) : (
          <>
            <View style={styles.heroEyebrowRow}>
              <Text style={[styles.heroEyebrow, { color: T.accentText }]}>TODAY</Text>
            </View>
            <Text style={[styles.heroTitle, { color: T.text }]}>Rest &amp; recover</Text>
            <Text style={[styles.heroMuscles, { color: T.text2 }]}>
              Tap a day above to train it instead.
            </Text>
          </>
        )}

        {/* Resuming an active session and starting a new workout stay separate
            actions: resume never rewrites what is already being logged. */}
        <View style={{ marginTop: 14 }}>
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
              discard={
                staleSession
                  ? { label: "Discard it and start fresh", onPress: w.cancel, testID: "wp-discard-stale" }
                  : undefined
              }
              testID={staleSession ? "wp-stale-session" : "wp-active-session"}
            />
          ) : todayDay && !todayDay.rest ? (
            <ActionButton label="Start workout" onPress={startToday} testID="wp-start-today" />
          ) : null}
        </View>

        <View style={[styles.heroRule, { backgroundColor: T.border }]} />

        <View style={styles.heroStats}>
          <View style={styles.heroStatCell}>
            <ProgressRing
              done={week.count}
              total={Math.max(answers.days.length, week.count)}
              T={T}
            />
          </View>
          <View style={[styles.heroStatDivider, { backgroundColor: T.border }]} />
          <View style={styles.heroStatCell}>
            <Text style={[styles.heroStatValue, { color: T.text }]}>{weekSets}</Text>
            <Text style={[styles.heroStatLabel, { color: T.textMuted }]}>sets</Text>
          </View>
          <View style={[styles.heroStatDivider, { backgroundColor: T.border }]} />
          <View style={styles.heroStatCell}>
            <Text style={[styles.heroStatValue, { color: T.text }]}>{weekVolume}</Text>
            <Text style={[styles.heroStatLabel, { color: T.textMuted }]}>{w.unit} volume</Text>
          </View>
        </View>
      </View>

      {/* What is coming, so the week reads forward from here. */}
      {nextDay && (
        <A11yControl
          label={`Next, ${nextDay.day.dow}, ${nextDay.day.typeName}, about ${nextDay.day.minutes} minutes`}
          onPress={() => onOpenDay(nextDay.index)}
          style={styles.nextRow}
          testID="today-next"
        >
          <Text style={[styles.nextCaps, { color: T.accentText }]}>NEXT</Text>
          <Text style={[styles.nextDow, { color: T.text }]}>{nextDay.day.dow.slice(0, 3)}</Text>
          <Text style={[styles.heroDot, { color: T.textFaint }]}>•</Text>
          <Text style={[styles.nextName, { color: T.text }]} numberOfLines={1}>
            {nextDay.day.typeName}
          </Text>
          <Text style={[styles.nextMin, { color: T.textMuted }]}>~{nextDay.day.minutes} min</Text>
          <Ionicons name="chevron-forward" size={15} color={T.textMuted} />
        </A11yControl>
      )}

      <A11yControl
        label={showWeek ? "Hide the weekly plan" : "View the weekly plan"}
        selected={showWeek}
        onPress={() => setShowWeek((v) => !v)}
        style={styles.weekToggle}
        testID="today-week-toggle"
      >
        <Text style={[styles.weekToggleText, { color: T.text2 }]}>
          {showWeek ? "Hide weekly plan" : "View weekly plan"}
        </Text>
        <Ionicons name={showWeek ? "chevron-up" : "chevron-forward"} size={14} color={T.text2} />
      </A11yControl>

      {showWeek && (
        <View style={{ gap: 10, marginTop: 4 }} testID="today-week-list">
          {days.map((day, i) => (
            <DayCard key={i} day={day} onPress={() => !day.rest && onOpenDay(i)} />
          ))}
        </View>
      )}

      {/* Discovery only appears once entitlement is actually resolved: a
          subscriber must never see a Premium pitch while RevenueCat loads. */}
      {!resolution.access && resolution.state === "ready" ? (
        <View style={{ marginTop: BLOCK_GAP }}>
          <PremiumDiscoveryCard
            contextTitle={todayDay && !todayDay.rest ? todayDay.typeName : "your weekly plan"}
            onPress={previewPremium}
            testID="wp-premium-preview"
          />
        </View>
      ) : null}

      <View style={[styles.progressCard, { backgroundColor: T.card }]}>
        <LiquidSheen tone="neutral" />
        <ProgressLink
          icon="calendar-outline"
          label="History"
          onPress={() => router.push("/history")}
          testID="today-history"
          T={T}
          styles={styles}
        />
        <View style={[styles.progressCardDivider, { backgroundColor: T.border }]} />
        <ProgressLink
          icon="stats-chart-outline"
          label="Insights"
          onPress={() => router.push("/insights")}
          testID="today-insights"
          T={T}
          styles={styles}
        />
      </View>

      <View style={styles.wpFooter}>
        <TouchableOpacity
          style={[styles.footBtn, { backgroundColor: T.card, minHeight: t.target.min }]}
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

/// The week as seven columns: initial over date, today filled. Tapping a
/// training day opens it — the strip is navigation, not decoration.
function DateStrip({
  todayIdx,
  days,
  onOpenDay,
}: {
  todayIdx: number;
  days: PlanDay[];
  onOpenDay: (i: number) => void;
}) {
  const { T } = useTheme();
  // Monday of the current week, so the numbers line up with the plan's own
  // Monday-first ordering rather than the locale's week start.
  const monday = new Date();
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - todayIdx);
  return (
    <View style={styles.strip} testID="today-strip">
      {days.map((day, i) => {
        const date = new Date(monday);
        date.setDate(monday.getDate() + i);
        const isToday = i === todayIdx;
        return (
          <A11yControl
            key={i}
            selected={isToday}
            label={`${day.dow} ${date.getDate()}${day.rest ? ", rest day" : `, ${day.typeName}`}`}
            onPress={() => !day.rest && onOpenDay(i)}
            style={styles.stripCell}
            testID={`strip-${i}`}
          >
            <View style={[styles.stripPill, isToday && { backgroundColor: T.accent }]}>
              <Text
                style={[
                  styles.stripDow,
                  { color: isToday ? T.ctaText : T.textMuted },
                ]}
              >
                {day.dow[0]}
              </Text>
            </View>
            <Text
              style={[
                styles.stripDate,
                { color: isToday ? T.accentText : T.textMuted },
                isToday && { fontWeight: "800" },
              ]}
            >
              {date.getDate()}
            </Text>
          </A11yControl>
        );
      })}
    </View>
  );
}

/// Workouts completed this week against the number planned. An arc rather than
/// a bar because it sits in a row of numbers and has to read as one glyph.
function ProgressRing({ done, total, T }: { done: number; total: number; T: any }) {
  const size = 52;
  const stroke = 4;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const fraction = total > 0 ? Math.min(1, done / total) : 0;
  return (
    <View
      style={{ alignItems: "center", justifyContent: "center" }}
      accessible
      accessibilityLabel={`${done} of ${total} planned workouts done this week`}
      testID="today-ring"
    >
      <Svg width={size} height={size}>
        <SvgCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={T.border}
          strokeWidth={stroke}
          fill="none"
        />
        <SvgCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={T.accent}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference * fraction} ${circumference}`}
          // Start the arc at twelve o'clock rather than three.
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={[styles.ringValue, { color: T.text }]}>
            {done}/{total}
          </Text>
          <Text style={[styles.ringLabel, { color: T.textMuted }]}>days</Text>
        </View>
      </View>
    </View>
  );
}

function SummaryStat({ value, label, T, styles }: { value: string; label: string; T: any; styles: any }) {
  return (
    <View style={styles.summaryStat}>
      <Text style={[styles.summaryValue, { color: T.text }]}>{value}</Text>
      <Text style={[styles.summaryLabel, { color: T.textMuted }]}>{label}</Text>
    </View>
  );
}

function ProgressLink({
  icon, label, onPress, testID, T, styles,
}: { icon: any; label: string; onPress: () => void; testID: string; T: any; styles: any }) {
  return (
    // No fill of its own: these now sit side by side inside one card, and a
    // second card colour on top of the first reads as a seam.
    <TouchableOpacity
      style={[styles.progressLink, { backgroundColor: "transparent" }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
    >
      <Ionicons name={icon} size={17} color={T.accent} />
      <Text style={[styles.progressLinkText, { color: T.text }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={15} color={T.textFaint} />
    </TouchableOpacity>
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
    tone === "posture" ? T.accent + "55" : "transparent";
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
      <View style={[styles.restCard, { backgroundColor: T.cardAlt }]}>
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
      style={[styles.dayCard, { backgroundColor: T.card, borderColor: allDone ? T.accent : "transparent" }]}
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
  // The screen owns which day it shows: the strip below switches days without
  // bouncing back through the weekly view.
  const [idx, setIdx] = useState(dayIndex);
  const [swapId, setSwapId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [startFailed, setStartFailed] = useState(false);
  const swaps = usePlanStore(s => s.swaps);
  const setSwap = usePlanStore(s => s.setSwap);
  const removeDayExercise = usePlanStore(s => s.removeDayExercise);
  const addDayExercise = usePlanStore(s => s.addDayExercise);
  const answers = usePlanStore(s => s.answers);
  if (!plan) return null;
  const day = plan.days[idx];
  const dateKey = todayISO();

  const planned = day.rest ? [] : day.exercises || [];
  const items = resolveDayExercises(planned, swaps, answers);
  const hasActiveWorkout = w.session !== null;

  // Starting a new workout and resuming the active one are distinct actions:
  // resuming never rewrites the session the user is already logging.
  const startWorkout = () => {
    setStartFailed(false);
    try {
      // The planned set count travels with the exercise into the session.
      for (const it of items) w.addExerciseFromPlan(it.id, dateKey, it.sets, day.typeName, it.repsOrTime, it.restSeconds);
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
      <View style={styles.dayHeadRow}>
        <TouchableOpacity
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back to my weekly plan"
          testID="day-back"
          style={styles.dayBackBtn}
        >
          <Ionicons name="chevron-back" size={22} color={T.text2} />
        </TouchableOpacity>
        <Text style={[styles.dayBigTitle, { color: T.text }]} numberOfLines={1}>
          {day.dow}
        </Text>
        <Text style={[styles.dayHeadMeta, { color: T.textMuted }]}>
          {day.rest ? "Rest day" : `${items.length} exercises · ${day.minutes} min`}
        </Text>
      </View>

      {/* Every day of the week is reachable from here; the letters follow the
          plan's Monday-first order. */}
      <View style={styles.dowStrip}>
        {plan.days.map((d, i) => (
          <A11yControl
            key={d.dow}
            selected={i === idx}
            label={`${d.dow}${d.rest ? ", rest day" : ""}`}
            onPress={() => {
              setIdx(i);
              setEditing(false);
            }}
            style={[styles.dowPill, i === idx && { backgroundColor: T.accent }]}
            testID={`dow-${i}`}
          >
            <Text style={[styles.dowPillText, { color: i === idx ? T.ctaText : T.textMuted }]}>{d.dow[0]}</Text>
          </A11yControl>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 130 }}>
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

        {day.rest ? (
          <View style={[styles.restDayCard, { backgroundColor: T.card }]}>
            <LiquidSheen tone="subtle" />
            <Text style={[styles.restText, { color: T.textMuted }]}>Rest &amp; recover</Text>
          </View>
        ) : (
          <View style={[styles.dayListCard, { backgroundColor: T.card }]}>
            <LiquidSheen tone="neutral" />
            {items.map((ex, exIdx) => {
              // Swaps are keyed by the PLANNED id, which is what survives regeneration.
              const plannedId = planned[exIdx]?.id ?? ex.id;
              const swappedFrom = swaps[plannedId] && swaps[plannedId] !== plannedId ? planned[exIdx] : null;
              const sessionEx = w.session?.find((s) => s.exerciseId === ex.id);
              const sessionDone = !!sessionEx && sessionEx.sets.length > 0 && sessionEx.sets.every(isCountableSet);
              const done = sessionDone || !!completions[`${dateKey}:${ex.id}`];
              return (
                <View key={plannedId}>
                  {exIdx > 0 && <View style={[styles.dayListSep, { backgroundColor: T.border }]} />}
                  <View
                    style={styles.dayExRow}
                    accessible
                    accessibilityLabel={`${ex.name}, ${MUSCLE_LABEL[ex.muscle]}, ${ex.sets} sets of ${ex.repsOrTime}${done ? ", completed" : ""}`}
                  >
                    <View
                      style={[
                        styles.dayTick,
                        done ? { backgroundColor: T.accent } : { borderWidth: 1.5, borderColor: T.border },
                      ]}
                    >
                      {done && <Ionicons name="checkmark" size={15} color={T.ctaText} />}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.dayExName,
                          { color: done ? T.textMuted : T.text },
                          done && { textDecorationLine: "line-through" as const },
                        ]}
                      >
                        {ex.name}
                      </Text>
                      <Text style={[styles.dayExMuscle, { color: T.accentText }]}>
                        {MUSCLE_LABEL[ex.muscle].toUpperCase()}
                      </Text>
                      {/* Says what was replaced and undoes it in one tap. Clearing the
                          swap restores the planned exercise; nothing logged is touched. */}
                      {swappedFrom && (
                        <TouchableOpacity
                          style={styles.swappedInline}
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
                    {editing ? (
                      <View style={{ flexDirection: "row", gap: 4 }}>
                        <A11yControl
                          label={`Swap ${ex.name} for an alternative`}
                          onPress={() => setSwapId(plannedId)}
                          style={styles.rowEditBtn}
                          testID={`swap-${ex.id}`}
                        >
                          <Ionicons name="swap-horizontal" size={17} color={T.text2} />
                        </A11yControl>
                        <A11yControl
                          label={`Remove ${ex.name} from ${day.dow}`}
                          onPress={() => removeDayExercise(idx, plannedId)}
                          style={styles.rowEditBtn}
                          testID={`remove-${ex.id}`}
                        >
                          <Ionicons name="trash-outline" size={17} color={T.focusRed} />
                        </A11yControl>
                      </View>
                    ) : (
                      <Text style={[styles.dayExDose, { color: done ? T.textMuted : T.text2 }]}>
                        {ex.sets}×{ex.repsOrTime}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
            {items.length === 0 && (
              <Text style={{ color: T.textMuted, padding: 16 }}>
                No exercises on this day yet — add one with the + button below.
              </Text>
            )}
          </View>
        )}
      </ScrollView>

      {!day.rest && (
        <View style={[styles.dayBottomBar, { backgroundColor: T.bg }]}>
          <TouchableOpacity
            style={[styles.dayCta, { backgroundColor: T.accent }]}
            onPress={hasActiveWorkout ? resumeWorkout : startWorkout}
            accessibilityRole="button"
            accessibilityLabel={hasActiveWorkout ? "Continue workout" : "Start workout"}
            testID={hasActiveWorkout ? "resume-session" : "start-session"}
          >
            <LiquidSheen tone="accent" />
            <Text style={[styles.dayCtaText, { color: T.ctaText }]}>
              {hasActiveWorkout ? "Continue workout" : "Start workout"}
            </Text>
          </TouchableOpacity>
          <A11yControl
            label={`Add an exercise to ${day.dow}`}
            onPress={() => setAdding(true)}
            style={[styles.dayRoundBtn, { backgroundColor: T.card }]}
            testID="day-add"
          >
            <LiquidSheen tone="neutral" />
            <Ionicons name="add" size={22} color={T.text} />
          </A11yControl>
          <A11yControl
            label={editing ? "Done editing this day" : "Edit this day: remove or swap exercises"}
            selected={editing}
            onPress={() => setEditing((e) => !e)}
            style={[styles.dayRoundBtn, { backgroundColor: editing ? T.accent : T.card }]}
            testID="day-edit"
          >
            {!editing && <LiquidSheen tone="neutral" />}
            <Ionicons name={editing ? "checkmark" : "trash-outline"} size={20} color={editing ? T.ctaText : T.text} />
          </A11yControl>
        </View>
      )}

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
      <AddExerciseSheet
        visible={adding}
        excludeIds={items.map(i => i.id)}
        onDismiss={() => setAdding(false)}
        onPick={(id) => {
          addDayExercise(idx, id);
          setAdding(false);
        }}
      />
    </View>
  );
}

function AddExerciseSheet({ visible, excludeIds, onDismiss, onPick }: {
  visible: boolean;
  excludeIds: string[];
  onDismiss: () => void;
  onPick: (id: string) => void;
}) {
  const { T } = useTheme();
  const answers = usePlanStore(s => s.answers);
  const [query, setQuery] = useState("");
  // Only exercises the user can actually perform: their equipment, plus
  // bodyweight, which needs none. The raw library rows carry COMPACT keys
  // (m, eq) — exercises.d.ts declares the normalised shape entryFor returns,
  // not what EXERCISES actually holds — so both spellings are read here.
  const candidates = useMemo(() => {
    const equip = new Set([...(answers.equip || []), "bw"]);
    const q = query.trim().toLowerCase();
    return EXERCISES.map((raw) => ({
      id: raw.id,
      name: raw.name,
      muscle: raw.muscle ?? (raw as unknown as { m: string }).m,
      equipment: raw.equipment ?? (raw as unknown as { eq: string }).eq,
    }))
      .filter(
        (e) =>
          !excludeIds.includes(e.id) &&
          (answers.equip?.length ? equip.has(e.equipment as never) : true) &&
          (!q || e.name.toLowerCase().includes(q)),
      )
      .slice(0, 30);
  }, [answers.equip, excludeIds, query]);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.sheetBackdrop} onPress={onDismiss} accessibilityLabel="Close" />
      <View style={[styles.sheet, { backgroundColor: T.card }]}>
        <LiquidSheen tone="neutral" />
        <Text style={[styles.sheetTitle, { color: T.text }]}>Add an exercise</Text>
        <TextInput
          style={[styles.addSearch, { backgroundColor: T.cardAlt, color: T.text }]}
          placeholder="Search exercises…"
          placeholderTextColor={T.textMuted}
          value={query}
          onChangeText={setQuery}
          accessibilityLabel="Search exercises to add"
          testID="add-search"
        />
        <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
          {candidates.length === 0 && (
            <Text style={{ color: T.textMuted, paddingVertical: 20 }}>Nothing matches that search.</Text>
          )}
          {candidates.map((e) => (
            <TouchableOpacity
              key={e.id}
              style={[styles.altRow, { borderBottomColor: T.border }]}
              onPress={() => onPick(e.id)}
              accessibilityRole="button"
              accessibilityLabel={`Add ${e.name}, ${MUSCLE_LABEL[e.muscle]}`}
              testID={`addpick-${e.id}`}
            >
              <View style={[styles.altPoster, { backgroundColor: T.posterBg }]}>
                <Image source={{ uri: posterUrl(e.id) }} style={{ width: "100%", height: "100%" }} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: T.textCaps, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 }}>
                  {MUSCLE_LABEL[e.muscle].toUpperCase()}
                </Text>
                <Text style={{ color: T.text, fontSize: 14.5, fontWeight: "600" }}>{e.name}</Text>
              </View>
              <Ionicons name="add-circle" size={22} color={T.accentText} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </Modal>
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
      <View style={[styles.sheet, { backgroundColor: T.card, }]}>
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
                <View style={[styles.altPoster, { backgroundColor: T.posterBg, }]}>
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
/** One vertical rhythm for Today: every block is BLOCK_GAP apart, and a new
 *  section heading gets SECTION_GAP so the page reads in groups. */
const BLOCK_GAP = 16;
const SECTION_GAP = 24;

const styles = StyleSheet.create({
  wpScroll: { padding: 20, paddingTop: 56, paddingBottom: 40 },
  strip: { flexDirection: "row", justifyContent: "space-between", marginTop: 14, marginBottom: 4 },
  stripCell: { flex: 1, alignItems: "center", gap: 4, paddingVertical: 2 },
  stripPill: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  stripDow: { fontSize: 13, fontWeight: "700" },
  stripDate: { fontSize: 13, fontWeight: "600" },

  heroCard: { borderRadius: 24, padding: 18, marginTop: 14, overflow: "hidden" },
  heroEyebrowRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  heroEyebrow: { fontSize: 11.5, fontWeight: "800", letterSpacing: 1.1 },
  heroDot: { fontSize: 11.5, fontWeight: "800" },
  heroTitle: { fontSize: 27, fontWeight: "800", marginTop: 8, letterSpacing: -0.4 },
  heroMuscles: { fontSize: 15, marginTop: 10 },
  heroMeta: { fontSize: 13.5, marginTop: 10 },
  heroRule: { height: StyleSheet.hairlineWidth, marginTop: 16 },
  heroStats: { flexDirection: "row", alignItems: "center", marginTop: 14 },
  heroStatCell: { flex: 1, alignItems: "center", gap: 2 },
  heroStatDivider: { width: StyleSheet.hairlineWidth, alignSelf: "stretch", marginVertical: 2 },
  heroStatValue: { fontSize: 24, fontWeight: "800" },
  heroStatLabel: { fontSize: 12 },
  ringValue: { fontSize: 13, fontWeight: "800" },
  ringLabel: { fontSize: 9.5, marginTop: -1 },

  nextRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 14, paddingHorizontal: 4, marginTop: 6 },
  nextCaps: { fontSize: 11, fontWeight: "800", letterSpacing: 1.1 },
  nextDow: { fontSize: 14.5, fontWeight: "700" },
  nextName: { fontSize: 14.5, fontWeight: "600", flex: 1 },
  nextMin: { fontSize: 13 },

  weekToggle: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, minHeight: 44 },
  weekToggleText: { fontSize: 14, fontStyle: "italic" },

  progressCard: { flexDirection: "row", alignItems: "center", borderRadius: 22, marginTop: 14, overflow: "hidden" },
  progressCardDivider: { width: StyleSheet.hairlineWidth, alignSelf: "stretch", marginVertical: 12 },

  wpEyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 0.9 },
  sectionHead: { fontSize: 11, fontWeight: "800", letterSpacing: 0.9, marginTop: SECTION_GAP, marginBottom: 12 },
  summaryRow: {
    flexDirection: "row", alignItems: "center", marginTop: BLOCK_GAP,
    borderRadius: 22, overflow: "hidden", paddingVertical: 14,
    borderWidth: StyleSheet.hairlineWidth, borderColor: "transparent",
  },
  summaryStat: { flex: 1, alignItems: "center", gap: 2 },
  summaryValue: { fontSize: 19, fontWeight: "800" },
  summaryLabel: { fontSize: 11, fontWeight: "600" },
  summaryDivider: { width: StyleSheet.hairlineWidth, height: 26 },
  progressRow: { flexDirection: "row", gap: 10, marginTop: BLOCK_GAP },
  progressLink: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 8,
    minHeight: 52, paddingHorizontal: 14, borderRadius: 22,
    overflow: "hidden",
  },
  progressLinkText: { flex: 1, fontSize: 14, fontWeight: "700" },
  wpHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingBottom: 8,
  },
  wpTitle: { fontSize: 24, fontWeight: "700" },
  dayHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 8,
  },
  headerBtn: {
    width: 44, height: 44, borderRadius: 22, 
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  adjustBtn: {
    flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44,
    paddingHorizontal: 14, borderRadius: R.pill, overflow: "hidden", borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
  },
  adjustText: { fontSize: 12.5, fontWeight: "800" },

  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: BLOCK_GAP },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: R.pill, borderWidth: 1, overflow: "hidden" },
  chipText: { fontSize: 11, fontWeight: "700" },
  dayCard: { borderRadius: R.xl, padding: 14, overflow: "hidden" },
  dayCardTop: { flexDirection: "row", justifyContent: "space-between" },
  dowCaps: { fontSize: 11, fontWeight: "800", letterSpacing: 1.4 },
  dayMin: { fontSize: 11 },
  dayTitle: { fontSize: 17.5, fontWeight: "700", marginTop: 4 },
  dayMuscles: { fontSize: 12, marginTop: 8 },

  restCard: {
    borderRadius: R.xl, padding: 14,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center", overflow: "hidden",
  },
  restCaps: { fontSize: 11, fontWeight: "800", letterSpacing: 1.4 },
  restText: { fontSize: 13, fontStyle: "italic" },

  wpFooter: { flexDirection: "row", justifyContent: "center", marginTop: 20 },
  footBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: R.pill, overflow: "hidden",
  },
  footBtnText: { fontSize: 12, fontWeight: "700" },

  dayHeaderTitle: { fontSize: 17, fontWeight: "700" },
  dayHeaderMeta: { fontSize: 12, marginTop: 2 },

  exCard: {
    flexDirection: "row", padding: 12, borderRadius: R.lg, marginBottom: 10, alignItems: "center", overflow: "hidden",
  },
  exMuscleCap: { fontSize: 10.5, fontWeight: "800", letterSpacing: 1.2 },
  exBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: R.pill },
  exName: { fontSize: 14.5, fontWeight: "600", marginTop: 4 },
  exMeta: { fontSize: 12, marginTop: 4 },
  swappedRow: {
    flexDirection: "row", alignItems: "center", gap: 5, marginTop: 7,
    paddingHorizontal: 8, minHeight: 30, borderRadius: R.pill, alignSelf: "flex-start",
  },
  swappedText: { fontSize: 10.5, fontWeight: "600", flexShrink: 1 },
  swappedUndo: { fontSize: 10.5, fontWeight: "800", textDecorationLine: "underline" },
  tickBtn: { width: 34, height: 34, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  addBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  swapBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  startAllBtn: { paddingHorizontal: 18, minHeight: 44, justifyContent: "center", borderRadius: R.pill, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.28)" },

  // ---- redesigned day view ----
  dayHeadRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 58, paddingBottom: 4 },
  dayBackBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  dayBigTitle: { fontSize: 24, fontWeight: "800", flexShrink: 1 },
  dayHeadMeta: { fontSize: 13, fontWeight: "600", marginLeft: "auto" },
  dowStrip: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10 },
  dowPill: { width: 42, height: 34, borderRadius: R.pill, alignItems: "center", justifyContent: "center" },
  dowPillText: { fontSize: 13, fontWeight: "800" },
  dayListCard: { borderRadius: 22, paddingHorizontal: 4, overflow: "hidden" },
  dayListSep: { height: StyleSheet.hairlineWidth, marginLeft: 62 },
  dayExRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 12, paddingVertical: 14 },
  dayTick: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  dayExName: { fontSize: 16.5, fontWeight: "700" },
  dayExMuscle: { fontSize: 10.5, fontWeight: "800", letterSpacing: 1.2, marginTop: 2 },
  dayExDose: { fontSize: 14.5, fontWeight: "600" },
  rowEditBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  swappedInline: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 5 },
  restDayCard: { borderRadius: 22, alignItems: "center", paddingVertical: 48, overflow: "hidden" },
  dayBottomBar: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 28 },
  dayCta: { flex: 1, minHeight: 52, borderRadius: R.pill, alignItems: "center", justifyContent: "center", overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.28)" },
  dayCtaText: { fontSize: 15.5, fontWeight: "800" },
  dayRoundBtn: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  addSearch: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 8 },

  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, overflow: "hidden",
  },
  sheetTitle: { fontSize: 17, fontWeight: "700", marginBottom: 14 },
  altRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1 },
  altPoster: { width: 54, height: 40, borderRadius: 8, overflow: "hidden" },
  usePill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: R.pill, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.28)" },
});
