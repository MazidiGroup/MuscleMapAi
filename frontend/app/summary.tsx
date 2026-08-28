// Post-workout summary.
//
// The 3D model used to open this screen. It has been removed: Explore and
// Insights both render the body, and repeating it here pushed the one thing
// this screen exists to answer — what was actually logged — below the fold.
// The ring answers it first, and everything under it is the detail behind it.
//
// Nothing here is editable. A finished record is the account of what was
// entered, so the screen reviews it rather than rewriting it.

import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Share, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle } from "react-native-svg";
import { useLocalSearchParams, useRouter } from "expo-router";

import { formatSetLoad, isBodyweightEquipment } from "@/src/anatomy/bodyweight";
import { displayWeight } from "@/src/units/weight";
import { getExercise } from "@/src/anatomy/exercises";
import { useWorkout, getWorkoutById } from "@/src/anatomy/workoutStore";
import {
  NOT_COMPLETED_COPY,
  exerciseStatus,
  incompleteCopy,
  routineName,
  sessionDateLabel,
  setProgressLabel,
  workoutTotals,
} from "@/src/history/metrics";
import { isCountableSet } from "@/src/anatomy/setRules";
import { legacyPalette, LegacyPalette } from "@/src/anatomy/ui";
import { useTheme } from "@/src/theme/ThemeContext";
import { LiquidTouchableOpacity as TouchableOpacity } from "@/src/ui/LiquidTouchableOpacity";

const RING = 116;
const RING_STROKE = 9;
const RING_R = (RING - RING_STROKE) / 2;
const RING_C = 2 * Math.PI * RING_R;

/** "3:07", or "1:04:20" once the session passes an hour. */
function clock(sec: number) {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`
    : `${m}:${String(r).padStart(2, "0")}`;
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
  const [expanded, setExpanded] = useState(false);

  let newPRs: string[] = [];
  try {
    if (prs) newPRs = JSON.parse(decodeURIComponent(prs));
  } catch {}

  const leave = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/workout"));

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
  const notCompleted = workout.exercises.filter((e) => exerciseStatus(e) === "Not completed").length;
  const setsOutstanding = stats.totalSets - stats.completedSets;
  const pct = stats.totalSets === 0 ? 0 : Math.round((stats.completedSets / stats.totalSets) * 100);
  const markerAngle = ((pct / 100) * 360 - 90) * (Math.PI / 180);
  const marker = {
    x: RING / 2 + RING_R * Math.cos(markerAngle),
    y: RING / 2 + RING_R * Math.sin(markerAngle),
  };

  const headline =
    stats.completedSets === 0
      ? "No sets were completed"
      : setsOutstanding === 0
        ? "Every planned set was logged"
        : `${setProgressLabel(stats.completedSets, stats.totalSets)} sets logged`;
  const subline =
    stats.completedSets === 0
      ? "This session won’t affect your progress or records."
      : setsOutstanding === 0
        ? "All of it counts towards your totals and records."
        : "Only completed sets count towards your totals and records.";

  const share = () =>
    Share.share({
      message: [
        `${routineName(workout)} — ${sessionDateLabel(workout.date)}`,
        `${setProgressLabel(stats.completedSets, stats.totalSets)} sets · ${stats.volume} ${unit} · ${clock(workout.durationSec)}`,
      ].join("\n"),
    }).catch(() => {});

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <View style={styles.badge}>
          <Ionicons name="checkmark-circle" size={18} color={T.accent} />
          <Text style={styles.badgeText}>Workout ended</Text>
        </View>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={share}
          accessibilityRole="button"
          accessibilityLabel="Share this workout summary"
          testID="summary-share"
        >
          <Ionicons name="share-outline" size={22} color={T.text} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={leave}
          accessibilityRole="button"
          accessibilityLabel="Close"
          testID="summary-close"
        >
          <Ionicons name="close" size={24} color={T.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + 108, gap: 16 }}
      >
        <View>
          <Text style={styles.title} accessibilityRole="header">
            {routineName(workout)}
          </Text>
          <Text style={styles.subtitle}>{sessionDateLabel(workout.date)}</Text>
        </View>

        {/* What was logged, before any of the detail behind it. */}
        <View style={styles.heroCard} testID="summary-hero">
          <View
            accessible
            accessibilityLabel={`${pct} per cent of planned sets logged`}
            accessibilityRole="progressbar"
          >
            <Svg width={RING} height={RING}>
              <Circle
                cx={RING / 2}
                cy={RING / 2}
                r={RING_R}
                stroke={T.borderHi}
                strokeWidth={RING_STROKE}
                fill="none"
              />
              <Circle
                cx={RING / 2}
                cy={RING / 2}
                r={RING_R}
                stroke={T.accent}
                strokeWidth={RING_STROKE}
                strokeLinecap="round"
                fill="none"
                strokeDasharray={`${RING_C}`}
                strokeDashoffset={RING_C * (1 - pct / 100)}
                transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
              />
              {/* A marker so the position on the ring reads even at 0%. */}
              <Circle cx={marker.x} cy={marker.y} r={RING_STROKE / 2 + 1} fill={T.accent} />
            </Svg>
            <View style={styles.ringCentre} pointerEvents="none">
              <Text style={styles.ringValue}>{pct}%</Text>
              <Text style={styles.ringLabel}>Sets logged</Text>
            </View>
          </View>

          <View style={{ flex: 1, gap: 6 }}>
            <Text style={styles.heroTitle}>{headline}</Text>
            <Text style={styles.heroBody}>{subline}</Text>
            <Pressable
              onPress={() => setExpanded(true)}
              accessibilityRole="button"
              accessibilityLabel="Review the values entered for each exercise"
              hitSlop={8}
              testID="summary-review-link"
            >
              <Text style={styles.heroLink}>Review entered values</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.statRow}>
          <Stat styles={styles} value={clock(workout.durationSec)} label="Duration" />
          <View style={styles.statDivider} />
          <Stat styles={styles} value={`${workout.exercises.length}`} label="Exercises" />
          <View style={styles.statDivider} />
          <Stat
            styles={styles}
            value={`${stats.completedSets}`}
            trail={` / ${stats.totalSets}`}
            label="Sets"
          />
          <View style={styles.statDivider} />
          <Stat styles={styles} value={`${stats.volume}`} unit={unit} label="Volume" />
        </View>

        {newPRs.length > 0 && (
          <View style={styles.prCard} testID="summary-prs">
            <View style={styles.prHead}>
              <Ionicons name="trophy" size={18} color={T.pr} />
              <Text style={styles.prTitle}>
                {newPRs.length} personal record{newPRs.length === 1 ? "" : "s"}
              </Text>
            </View>
            {newPRs.map((p, i) => (
              <Text key={i} style={styles.prItem}>
                {p}
              </Text>
            ))}
          </View>
        )}

        <Text style={styles.section}>Session plan</Text>
        <View style={styles.planCard} testID="summary-plan">
          <PlanRow styles={styles} T={T} icon="list-outline" label="Exercises planned" value={`${workout.exercises.length}`} />
          <PlanRow
            styles={styles}
            T={T}
            icon="ellipse-outline"
            label="Exercises not completed"
            value={`${notCompleted}`}
          />
          <PlanRow
            styles={styles}
            T={T}
            icon="remove-circle-outline"
            label="Sets not completed"
            value={`${setsOutstanding}`}
          />
          <View style={styles.planDivider} />
          <Pressable
            style={styles.planRow}
            onPress={() => setExpanded((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            accessibilityLabel={`${expanded ? "Hide" : "View"} the exercise breakdown, ${workout.exercises.length} exercises`}
            testID="summary-breakdown-toggle"
          >
            <Ionicons name="stats-chart-outline" size={18} color={T.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.planLabelStrong}>
                {expanded ? "Hide exercise breakdown" : "View exercise breakdown"}
              </Text>
              <Text style={styles.planSub}>
                {workout.exercises.length} exercise{workout.exercises.length === 1 ? "" : "s"}
              </Text>
            </View>
            <Ionicons name={expanded ? "chevron-up" : "chevron-forward"} size={18} color={T.textDim} />
          </Pressable>
        </View>

        {expanded &&
          workout.exercises.map((e) => {
            const ex = getExercise(e.exerciseId);
            const bodyweight = isBodyweightEquipment(ex?.equipment);
            const status = exerciseStatus(e);
            const done = e.sets.filter(isCountableSet).length;
            const icon =
              status === "Completed" ? "checkmark-done" : status === "Incomplete" ? "remove-circle-outline" : "ellipse-outline";
            const tint = status === "Completed" ? T.accent : status === "Incomplete" ? T.secondary : T.textDim;
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

        <View style={styles.noteRow}>
          <Ionicons name="information-circle-outline" size={16} color={T.textFaint} />
          <Text style={styles.noteText}>
            Entered values are stored and stay available to review. They are never counted towards totals or records.
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.actions, { paddingBottom: insets.bottom + 14 }]}>
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => setExpanded((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={expanded ? "Hide the entered values" : "Review the entered values"}
          testID="summary-review"
        >
          <Ionicons name="reader-outline" size={17} color={T.accent} />
          <Text style={styles.secondaryText}>{expanded ? "Hide log" : "Review log"}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.doneBtn} onPress={leave} testID="summary-done">
          <Text style={styles.doneText}>Done</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Stat({
  styles,
  value,
  trail,
  unit,
  label,
}: {
  styles: ReturnType<typeof makeStyles>;
  value: string;
  trail?: string;
  unit?: string;
  label: string;
}) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${value}${trail ?? ""}${unit ? ` ${unit}` : ""} ${label}`}>
      <View style={styles.statValueRow}>
        <Text style={styles.statValue}>{value}</Text>
        {trail ? <Text style={styles.statTrail}>{trail}</Text> : null}
        {unit ? <Text style={styles.statUnit}>{unit}</Text> : null}
      </View>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function PlanRow({
  styles,
  T,
  icon,
  label,
  value,
}: {
  styles: ReturnType<typeof makeStyles>;
  T: LegacyPalette;
  icon: any;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.planRow} accessible accessibilityLabel={`${label}: ${value}`}>
      <Ionicons name={icon} size={18} color={T.accent} />
      <Text style={styles.planLabel}>{label}</Text>
      <Text style={styles.planValue}>{value}</Text>
    </View>
  );
}

const makeStyles = (T: LegacyPalette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingBottom: 10, gap: 4 },
  badge: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 6 },
  badgeText: {
    color: T.accent, fontSize: 12, fontWeight: "800",
    textTransform: "uppercase", letterSpacing: 0.8,
  },
  headerBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", overflow: "hidden" },

  title: { color: T.text, fontSize: 24, fontWeight: "800", lineHeight: 30 },
  subtitle: { color: T.textDim, fontSize: 14, marginTop: 4 },

  heroCard: { flexDirection: "row", alignItems: "center", gap: 16, backgroundColor: T.bg2, borderRadius: 22, padding: 16 },
  ringCentre: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  ringValue: { color: T.text, fontSize: 24, fontWeight: "800" },
  ringLabel: { color: T.textFaint, fontSize: 9.5, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, marginTop: 2 },
  heroTitle: { color: T.text, fontSize: 17, fontWeight: "800", lineHeight: 22 },
  heroBody: { color: T.textDim, fontSize: 13, lineHeight: 18 },
  heroLink: { color: T.accent, fontSize: 13.5, fontWeight: "800", paddingVertical: 4 },

  statRow: { flexDirection: "row", alignItems: "center" },
  stat: { flex: 1, alignItems: "center" },
  statValueRow: { flexDirection: "row", alignItems: "baseline", gap: 2 },
  statValue: { color: T.text, fontSize: 20, fontWeight: "800" },
  statTrail: { color: T.textDim, fontSize: 13, fontWeight: "700" },
  statUnit: { color: T.textDim, fontSize: 12, fontWeight: "700", marginLeft: 2 },
  statLabel: { color: T.textFaint, fontSize: 11.5, marginTop: 3 },
  statDivider: { width: 1, height: 30, backgroundColor: T.border },

  prCard: { backgroundColor: T.bg2, borderRadius: 22, padding: 16 },
  prHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  prTitle: { color: T.pr, fontSize: 15, fontWeight: "800" },
  prItem: { color: T.text, fontSize: 14, marginTop: 2 },

  section: { color: T.textDim, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: -6 },
  planCard: { backgroundColor: T.bg2, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 4 },
  planRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52 },
  planLabel: { color: T.text, fontSize: 14.5, fontWeight: "600", flex: 1 },
  planLabelStrong: { color: T.text, fontSize: 14.5, fontWeight: "800" },
  planSub: { color: T.textFaint, fontSize: 12, marginTop: 1 },
  planValue: { color: T.text, fontSize: 15, fontWeight: "800" },
  planDivider: { height: 1, backgroundColor: T.border, marginVertical: 2 },

  exBlock: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: T.border },
  exRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: T.bg2, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8 },
  exName: { color: T.text, fontSize: 15, fontWeight: "600", flex: 1 },
  exStatus: { fontSize: 12, fontWeight: "800" },
  exSets: { color: T.textDim, fontSize: 13 },
  exNote: { color: T.textDim, fontSize: 12.5, lineHeight: 18, marginTop: 4 },
  setLine: { color: T.text, fontSize: 13, fontWeight: "600" },

  noteRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingHorizontal: 2 },
  noteText: { flex: 1, color: T.textFaint, fontSize: 11.5, lineHeight: 16 },

  actions: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    flexDirection: "row", gap: 10, paddingHorizontal: 18, paddingTop: 12,
    backgroundColor: T.bg, borderTopWidth: 1, borderTopColor: T.border,
  },
  secondaryBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7,
    borderRadius: 22, paddingVertical: 15, borderWidth: 1.5, borderColor: T.accent, overflow: "hidden",
  },
  secondaryText: { color: T.accent, fontSize: 15.5, fontWeight: "800" },
  doneBtn: { flex: 1, backgroundColor: T.accent, borderRadius: 22, paddingVertical: 15, alignItems: "center", overflow: "hidden" },
  doneText: { color: T.bg, fontSize: 16, fontWeight: "800" },
});
