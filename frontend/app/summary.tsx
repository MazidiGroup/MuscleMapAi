import React, { useMemo, useRef, useState } from "react";
import { Alert, View, Text, StyleSheet, ScrollView, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { captureRef } from "react-native-view-shot";

import { BodyMap2D } from "@/src/anatomy/BodyMap2D";
import { revealOrder, sessionSetsByGroup } from "@/src/anatomy/bodyMap";
import { GYM_GROUPS } from "@/src/anatomy/groups";
import { formatSetLoad, isBodyweightEquipment } from "@/src/anatomy/bodyweight";
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
import { COPPER_RAMP, copperForCount, legacyPalette, LegacyPalette } from "@/src/anatomy/ui";
import { useTheme } from "@/src/theme/ThemeContext";
import { CARD_RADIUS } from "@/src/theme/tokens";
import { NUMERAL_TYPE } from "@/src/theme/semantic";
import { LiquidTouchableOpacity as TouchableOpacity } from "@/src/ui/LiquidTouchableOpacity";
import { BrandMark } from "@/src/ui/BrandMark";

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
  const { width: screenW } = useWindowDimensions();
  const heroRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);

  // THIS session's working sets per gym group → a copper step each. A count
  // of logged sets, never an activation percentage.
  const setsByGroup = useMemo(() => (workout ? sessionSetsByGroup(workout.exercises) : {}), [workout]);
  const maxSets = Math.max(0, ...Object.values(setsByGroup));
  const fills = useMemo(() => {
    const out: Record<string, string> = {};
    for (const g of Object.keys(GYM_GROUPS)) out[g] = copperForCount(setsByGroup[g] || 0, maxSets);
    return out;
  }, [setsByGroup, maxSets]);
  const reveal = useMemo(() => ({ order: revealOrder(setsByGroup), from: COPPER_RAMP[0] }), [setsByGroup]);

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
  const title = workoutTitle(workout);

  // The hero is exactly 9:16, so the captured image is a story-sized card
  // with nothing stretched. Only what is on screen goes into it.
  const heroW = Math.min(screenW - 36, 340);
  const bodyW = Math.floor((heroW - 44) / 2);
  const worked = reveal.order.map((g) => `${GYM_GROUPS[g].label} ${setsByGroup[g]} ${setsByGroup[g] === 1 ? "set" : "sets"}`);
  const heroLabel =
    `${title}. ${stats.volume} ${unit} total volume, ${stats.completedSets} sets, ${fmt(workout.durationSec)}.` +
    (worked.length ? ` Worked: ${worked.join(", ")}.` : "") +
    (newPRs.length ? ` ${newPRs.length} new personal record${newPRs.length === 1 ? "" : "s"}.` : "");

  const share = async () => {
    if (!heroRef.current || sharing) return;
    setSharing(true);
    try {
      const uri = await captureRef(heroRef, { format: "png", quality: 1, result: "tmpfile", width: 1080, height: 1920 });
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert("Sharing isn't available", "This device can't open the share sheet.");
        return;
      }
      await Sharing.shareAsync(uri, { mimeType: "image/png", UTI: "public.png", dialogTitle: "Share your workout" });
    } catch {
      Alert.alert("Couldn't share", "The workout card could not be created. Your workout is saved.");
    } finally {
      setSharing(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.panel}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 80 }}
        >
          <View
            ref={heroRef}
            collapsable={false}
            style={[styles.hero, { width: heroW, height: Math.round((heroW * 16) / 9) }]}
            accessible
            accessibilityLabel={heroLabel}
            testID="summary-hero"
          >
            <BrandMark size={20} />
            <Text style={styles.heroTitle} numberOfLines={2}>{title}</Text>
            <View style={styles.heroBodies}>
              <BodyMap2D view="front" fills={fills} glow={false} reveal={reveal} width={bodyW} />
              <BodyMap2D view="back" fills={fills} glow={false} reveal={reveal} width={bodyW} />
            </View>
            <View style={{ alignItems: "center" }}>
              <Text style={styles.heroVolume} testID="summary-volume">
                {stats.volume.toLocaleString()}
              </Text>
              <Text style={styles.heroVolumeCaps}>{unit.toUpperCase()} TOTAL VOLUME</Text>
            </View>
            <Text style={styles.heroMeta}>
              {stats.completedSets} {stats.completedSets === 1 ? "set" : "sets"} · {fmt(workout.durationSec)}
            </Text>
            {newPRs.length > 0 ? (
              <View style={styles.prChip} testID="summary-pr-chip">
                <Ionicons name="trophy" size={13} color={T.pr} />
                <Text style={styles.prChipText}>
                  {newPRs.length === 1 ? "New PR" : `${newPRs.length} new PRs`}
                </Text>
              </View>
            ) : null}
          </View>

          <TouchableOpacity
            style={[styles.shareBtn, sharing && { opacity: 0.6 }]}
            onPress={share}
            disabled={sharing}
            accessibilityRole="button"
            accessibilityLabel="Share"
            accessibilityHint="Opens the share sheet with an image of this workout card"
            accessibilityState={{ disabled: sharing, busy: sharing }}
            testID="summary-share"
          >
            <Ionicons name="share-outline" size={17} color={T.accent} />
            <Text style={styles.shareText}>Share</Text>
          </TouchableOpacity>

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
                          bodyweight ? formatSetLoad(set.weight, unit, true) : set.weight > 0 ? `${set.weight} ${unit}` : "—"
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
  panel: { flex: 1, paddingHorizontal: 18 },
  hero: {
    alignSelf: "center", backgroundColor: T.surfaceSolid, borderRadius: CARD_RADIUS,
    paddingHorizontal: 18, paddingVertical: 20, alignItems: "center", justifyContent: "space-between", overflow: "hidden",
  },
  heroTitle: { color: T.text, fontSize: 19, fontWeight: "800", textAlign: "center" },
  heroBodies: { flexDirection: "row", gap: 8, justifyContent: "center" },
  heroVolume: { ...NUMERAL_TYPE, color: T.text },
  heroVolumeCaps: { color: T.accentDim, fontSize: 10.5, fontWeight: "800", letterSpacing: 1.2, marginTop: 2 },
  heroMeta: { color: T.textDim, fontSize: 13, fontWeight: "600" },
  prChip: {
    flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 999, backgroundColor: T.pr + "22", borderWidth: 1, borderColor: T.pr + "66",
  },
  prChipText: { color: T.pr, fontSize: 12, fontWeight: "800" },
  shareBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, alignSelf: "center",
    minHeight: 44, paddingHorizontal: 22, borderRadius: 22, marginTop: 12, marginBottom: 16,
    backgroundColor: T.bg2, borderWidth: 1, borderColor: T.accent + "55",
  },
  shareText: { color: T.accent, fontSize: 14, fontWeight: "800" },
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
