// Weekly plan + Workout day + Swap sheet.
//
// - Weekly view: header (logo + Shuffle + theme toggle), summary chips,
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
import { R } from "@/src/theme/tokens";
import { usePlanStore, todayISO } from "./planStore";
import { entryFor, alternativesFor, MUSCLE_LABEL, GOAL_LABEL, REGION_LABEL } from "./planAdapter";
import type { PlanDay, PlanExerciseEntry } from "./exercises";
import { posterUrl } from "@/src/anatomy/media";
import { useWorkout } from "@/src/anatomy/workoutStore";

const DOW = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function WeeklyPlan({ onOpenDay, onEdit }: { onOpenDay: (i: number) => void; onEdit: () => void }) {
  const { T, mode, toggleTheme } = useTheme();
  const plan = usePlanStore(s => s.plan);
  const reshuffle = usePlanStore(s => s.reshuffle);
  if (!plan) return null;
  const { answers, splitLabel, days } = plan;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: T.bg }} contentContainerStyle={styles.wpScroll}>
      <View style={styles.wpHeader}>
        <View style={styles.wpBrandRow}>
          <Image source={require("../../assets/images/icon.png")} style={styles.wpLogo} />
          <Text style={[styles.wpWordmark, { color: T.textCaps }]}>MUSCLE MAP AI</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity
            style={[styles.headerBtn, { backgroundColor: T.card, borderColor: T.border }]}
            onPress={toggleTheme}
            testID="theme-toggle"
          >
            <Ionicons name={mode === "night" ? "sunny" : "moon"} size={16} color={T.text2} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.shuffleBtn, { backgroundColor: T.accent }]}
            onPress={reshuffle}
            testID="wp-shuffle"
          >
            <Ionicons name="refresh" size={14} color={T.ctaText} />
            <Text style={[styles.shuffleText, { color: T.ctaText }]}>Shuffle</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={[styles.wpTitle, { color: T.text }]}>Your weekly plan</Text>

      <View style={styles.chipsRow}>
        <Chip label={GOAL_LABEL[answers.goal]} />
        <Chip label={`${answers.days.length} days / week`} />
        <Chip label={splitLabel} />
        {answers.focus.map(f => (
          <Chip key={f} label={`Focus: ${REGION_LABEL[f]}`} tone="focus" />
        ))}
        {answers.posture && <Chip label="Posture work" tone="posture" />}
      </View>

      <View style={{ gap: 10, marginTop: 20 }}>
        {days.map((day, i) => (
          <DayCard key={i} day={day} onPress={() => !day.rest && onOpenDay(i)} />
        ))}
      </View>

      <View style={styles.wpFooter}>
        <TouchableOpacity
          style={[styles.footBtn, { borderColor: T.border, backgroundColor: T.card }]}
          onPress={onEdit}
          testID="wp-edit"
        >
          <Ionicons name="create-outline" size={14} color={T.text2} />
          <Text style={[styles.footBtnText, { color: T.text2 }]}>Edit my answers</Text>
        </TouchableOpacity>
      </View>
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
      <Text style={[styles.chipText, { color }]}>{label}</Text>
    </View>
  );
}

function DayCard({ day, onPress }: { day: PlanDay; onPress: () => void }) {
  const { T } = useTheme();
  if (day.rest) {
    return (
      <View style={[styles.restCard, { borderColor: T.borderDashed }]}>
        <Text style={[styles.restCaps, { color: T.textCaps }]}>{day.dow.slice(0, 3).toUpperCase()}</Text>
        <Text style={[styles.restText, { color: T.textMuted }]}>Rest &amp; recover</Text>
      </View>
    );
  }
  return (
    <TouchableOpacity
      style={[styles.dayCard, { backgroundColor: T.card, borderColor: T.border }]}
      onPress={onPress}
      testID={`day-card-${day.dow}`}
    >
      <View style={styles.dayCardTop}>
        <Text style={[styles.dowCaps, { color: T.textCaps }]}>{day.dow.slice(0, 3).toUpperCase()}</Text>
        <Text style={[styles.dayMin, { color: T.textMuted }]}>~{day.minutes} min</Text>
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
      <Text style={[styles.dayMuscles, { color: T.text2 }]} numberOfLines={1}>
        {(day.focusMuscles || []).map(m => MUSCLE_LABEL[m]).slice(0, 4).join(" · ")}
      </Text>
    </TouchableOpacity>
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
  const [replaced, setReplaced] = useState<Record<string, PlanExerciseEntry>>({});
  if (!plan) return null;
  const day = plan.days[dayIndex];
  if (day.rest) return null;
  const dateKey = todayISO();

  const items = (day.exercises || []).map(e => replaced[e.id] || e);

  const addAllToSession = () => {
    for (const it of items) w.addExerciseFromPlan(it.id, dateKey);
    router.push({ pathname: "/(tabs)/workout", params: { seg: "session" } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <View style={styles.wpHeader}>
        <TouchableOpacity
          style={[styles.headerBtn, { backgroundColor: T.card, borderColor: T.border }]}
          onPress={onBack}
        >
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
          onPress={addAllToSession}
          testID="add-all-to-session"
        >
          <Text style={{ color: T.ctaText, fontWeight: "800", fontSize: 12 }}>Start</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {items.map((ex) => {
          const done = !!completions[`${dateKey}:${ex.id}`];
          const inSession = !!w.session?.some((s) => s.exerciseId === ex.id);
          return (
            <View key={ex.id} style={[styles.exCard, { backgroundColor: T.card, borderColor: T.border }]}>
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
                    if (!inSession) w.addExerciseFromPlan(ex.id, dateKey);
                  }}
                  testID={`add-${ex.id}`}
                >
                  <Ionicons name={inSession ? "checkmark-circle" : "add"} size={16} color={inSession ? T.accent : T.text2} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.swapBtn, { borderColor: T.border }]}
                  onPress={() => setSwapId(ex.id)}
                  testID={`swap-${ex.id}`}
                >
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
          if (swapId) setReplaced(r => ({ ...r, [swapId]: newEntry }));
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
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 8,
  },
  wpBrandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  wpLogo: { width: 26, height: 26, borderRadius: 6 },
  wpWordmark: { fontSize: 11, fontWeight: "700", letterSpacing: 1.5 },
  wpTitle: { fontSize: 24, fontWeight: "700", marginTop: 22 },
  headerBtn: {
    width: 36, height: 36, borderRadius: 18, borderWidth: 1,
    alignItems: "center", justifyContent: "center",
  },
  shuffleBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: R.pill,
  },
  shuffleText: { fontSize: 12, fontWeight: "800" },

  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: R.pill, borderWidth: 1 },
  chipText: { fontSize: 11, fontWeight: "700" },

  dayCard: { borderRadius: R.xl, borderWidth: 1, padding: 14 },
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
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  restCaps: { fontSize: 11, fontWeight: "800", letterSpacing: 1.4 },
  restText: { fontSize: 13, fontStyle: "italic" },

  wpFooter: { flexDirection: "row", justifyContent: "center", marginTop: 20 },
  footBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: R.pill, borderWidth: 1,
  },
  footBtnText: { fontSize: 12, fontWeight: "700" },

  dayHeaderTitle: { fontSize: 17, fontWeight: "700" },
  dayHeaderMeta: { fontSize: 12, marginTop: 2 },

  exCard: {
    flexDirection: "row", padding: 12, borderRadius: R.lg, borderWidth: 1, marginBottom: 10, alignItems: "center",
  },
  exPoster: { width: 86, height: 60, borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  exMuscleCap: { fontSize: 10.5, fontWeight: "800", letterSpacing: 1.2 },
  exBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: R.pill },
  exName: { fontSize: 14.5, fontWeight: "600", marginTop: 4 },
  exMeta: { fontSize: 12, marginTop: 4 },
  tickBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  addBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  swapBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  startAllBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: R.pill },

  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 20,
  },
  sheetTitle: { fontSize: 17, fontWeight: "700", marginBottom: 14 },
  altRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1 },
  altPoster: { width: 54, height: 40, borderRadius: 8, borderWidth: 1, overflow: "hidden" },
  usePill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: R.pill },
});
