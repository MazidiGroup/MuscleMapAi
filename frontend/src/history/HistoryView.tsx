// History home — a Workout-tab segment, not a sixth tab.
//
// Everything here comes from this owner's verified local records: completed sets
// only, Monday-start calendar weeks labelled as such, and an honest account of
// what is stored where. Damaged records are skipped without being deleted, and
// nothing implies cloud backup or cross-device recovery.

import React, { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { getExercise } from "@/src/anatomy/exercises";
import { useWorkout } from "@/src/anatomy/workoutStore";
import { useSemanticTokens } from "@/src/theme/semantic";
import { EmptyState, InfoBanner, RetryPanel, WarningBanner } from "@/src/ui/state";

import {
  CalendarCell,
  HISTORY_COPY,
  absoluteDate,
  calendarDayLabel,
  durationLabel,
  exerciseStatus,
  groupHistory,
  monthLabel,
  monthMatrix,
  partitionRecords,
  selectedDayLabel,
  setProgressLabel,
  weekSummary,
  workoutTitle,
  workoutTotals,
} from "./metrics";

export function HistoryView({ scrollPadding = 24, topPadding }: { scrollPadding?: number; topPadding?: number }) {
  const t = useSemanticTokens();
  const router = useRouter();
  const w = useWorkout();

  // Damaged records are excluded from everything, and never removed from storage.
  const { valid, damaged } = useMemo(() => partitionRecords(w.history), [w.history]);
  const groups = useMemo(() => groupHistory(valid), [valid]);
  const week = useMemo(() => weekSummary(valid), [valid]);

  const [storageOpen, setStorageOpen] = useState(false);
  const now = new Date();
  const [month, setMonth] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [selected, setSelected] = useState<number | null>(null);

  const cells = useMemo(() => monthMatrix(month.year, month.month, valid), [month, valid]);
  const selectedWorkouts = useMemo(
    () => (selected === null ? [] : valid.filter((x) => new Date(x.date).setHours(0, 0, 0, 0) === selected)),
    [selected, valid],
  );

  const shiftMonth = (delta: number) => {
    setSelected(null);
    const d = new Date(month.year, month.month + delta, 1);
    setMonth({ year: d.getFullYear(), month: d.getMonth() });
  };

  // The month arrows name where they go, not just which way they point.
  const prevMonth = new Date(month.year, month.month - 1, 1);
  const nextMonth = new Date(month.year, month.month + 1, 1);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.color.bg }}
      // The screen's segmented header floats ABOVE this list, so the first row has to
      // start below it — including the notch inset — at every scroll position.
      contentContainerStyle={{
        padding: t.space.lg,
        paddingTop: topPadding ?? t.space.lg,
        paddingBottom: scrollPadding,
        gap: t.space.lg,
      }}
      scrollIndicatorInsets={{ top: (topPadding ?? 0) - t.space.lg }}
      testID="history-view"
    >
      {w.readFailed && (
        <RetryPanel
          title={HISTORY_COPY.readFailureTitle}
          body={HISTORY_COPY.readFailure}
          preserved={["Your saved workouts", "Your Plan", "Your unit preference"]}
          retry={{ label: "Try again", onPress: w.retryRead, testID: "history-read-retry" }}
          testID="history-read-failed"
        />
      )}

      {damaged.length > 0 && (
        <WarningBanner
          title={HISTORY_COPY.damagedTitle}
          message={HISTORY_COPY.damaged(damaged.length)}
          consequence="Nothing has been deleted."
          testID="history-damaged"
        />
      )}

      {valid.length === 0 ? (
        <EmptyState
          icon="time-outline"
          title={HISTORY_COPY.emptyTitle}
          body={HISTORY_COPY.empty}
          note={HISTORY_COPY.storageBody}
          testID="history-empty"
        />
      ) : (
        <>
          {/* Monday–Sunday calendar week, explicitly labelled. */}
          <View style={[styles.card, { backgroundColor: t.color.surface, borderColor: t.color.border, padding: t.space.lg }]} testID="history-week">
            <Text style={[t.type.label, { color: t.color.textMuted }]}>{week.rangeLabel}</Text>
            <Text style={[t.type.title, { color: t.color.text, marginTop: 2 }]}>{week.copy}</Text>
            <Text style={[t.type.caption, { color: t.color.textMuted, marginTop: 6 }]}>
              {HISTORY_COPY.whatCounts.join(" · ")}
            </Text>
          </View>

          {groups.map((g) => (
            <View key={g.key} style={{ gap: t.space.sm }}>
              <Text style={[t.type.label, { color: t.color.textMuted }]}>{g.label}</Text>
              {g.items.map((item) => {
                const totals = workoutTotals(item.exercises);
                const incomplete = item.exercises.filter((e) => exerciseStatus(e) !== "Completed").length;
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => router.push({ pathname: "/summary", params: { id: item.id } })}
                    accessibilityRole="button"
                    accessibilityLabel={`${workoutTitle(item)}, ${totals.completedSets} completed sets, ${totals.volume} ${w.unit}`}
                    testID={`hist-${item.id}`}
                    style={[styles.card, { backgroundColor: t.color.surface, borderColor: t.color.border, padding: t.space.lg }]}
                  >
                    <View style={styles.row}>
                      <Text style={[t.type.subheading, { color: t.color.text, flex: 1 }]}>{workoutTitle(item)}</Text>
                      {item.durationSec > 0 && (
                        <Text style={[t.type.caption, { color: t.color.textMuted }]}>{durationLabel(item.durationSec)}</Text>
                      )}
                    </View>
                    <Text style={[t.type.caption, { color: t.color.textSecondary, marginTop: 4 }]} numberOfLines={1}>
                      {item.exercises.map((e) => getExercise(e.exerciseId)?.name || e.exerciseId).join(" · ")}
                    </Text>
                    <View style={[styles.row, { marginTop: 8, gap: t.space.lg }]}>
                      <Text style={[t.type.caption, { color: t.color.textMuted }]}>
                        {setProgressLabel(totals.completedSets, totals.totalSets)} sets completed
                      </Text>
                      <Text style={[t.type.caption, { color: t.color.textMuted }]}>
                        {totals.volume} {w.unit}
                      </Text>
                      {incomplete > 0 && (
                        <Text style={[t.type.caption, { color: t.status.warning.fg }]}>{incomplete} not fully completed</Text>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}

          {/* Month grid. Every action here has a list equivalent above. */}
          <View style={[styles.card, { backgroundColor: t.color.surface, borderColor: t.color.border, padding: t.space.lg, gap: t.space.md }]} testID="history-calendar">
            <View style={styles.row}>
              <Pressable
                onPress={() => shiftMonth(-1)}
                accessibilityRole="button"
                accessibilityLabel={`Previous month, ${monthLabel(prevMonth.getFullYear(), prevMonth.getMonth())}`}
                testID="cal-prev"
                style={[styles.iconBtn, { borderColor: t.color.border }]}
              >
                <Ionicons name="chevron-back" size={18} color={t.color.textSecondary} />
              </Pressable>
              <Text
                style={[t.type.subheading, { color: t.color.text, flex: 1, textAlign: "center" }]}
                accessibilityLiveRegion="polite"
                testID="cal-month"
              >
                {monthLabel(month.year, month.month)}
              </Text>
              <Pressable
                onPress={() => shiftMonth(1)}
                accessibilityRole="button"
                accessibilityLabel={`Next month, ${monthLabel(nextMonth.getFullYear(), nextMonth.getMonth())}`}
                testID="cal-next"
                style={[styles.iconBtn, { borderColor: t.color.border }]}
              >
                <Ionicons name="chevron-forward" size={18} color={t.color.textSecondary} />
              </Pressable>
            </View>

            <View style={styles.grid}>
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <Text key={d} style={[t.type.caption, styles.cell, { color: t.color.textMuted }]}>
                  {d}
                </Text>
              ))}
              {cells.map((cell, i) => (
                <CalendarDay
                  key={cell ? cell.ts : `pad${i}`}
                  cell={cell}
                  selected={!!cell && selected === cell.ts}
                  onPress={() => cell && setSelected(selected === cell.ts ? null : cell.ts)}
                />
              ))}
            </View>

            {selected !== null && (
              <View style={{ gap: t.space.sm }} testID="cal-selected">
                <Text style={[t.type.label, { color: t.color.textMuted }]}>
                  {selectedDayLabel(selected, selectedWorkouts.length)}
                </Text>
                {selectedWorkouts.length === 0 ? (
                  <Text style={[t.type.caption, { color: t.color.textMuted }]}>No completed workout on this date.</Text>
                ) : (
                  selectedWorkouts.map((item) => (
                    <Pressable
                      key={item.id}
                      onPress={() => router.push({ pathname: "/summary", params: { id: item.id } })}
                      accessibilityRole="button"
                      testID={`cal-workout-${item.id}`}
                      style={[styles.card, { backgroundColor: t.color.surfaceAlt, borderColor: t.color.border, padding: t.space.md }]}
                    >
                      <Text style={[t.type.bodyStrong, { color: t.color.text }]}>{workoutTitle(item)}</Text>
                    </Pressable>
                  ))
                )}
              </View>
            )}
          </View>
        </>
      )}

      <Pressable
        onPress={() => setStorageOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={HISTORY_COPY.storageEntry}
        testID="history-storage-entry"
        style={[styles.storageRow, { borderColor: t.color.border, minHeight: t.target.min }]}
      >
        <Ionicons name="phone-portrait-outline" size={16} color={t.color.textSecondary} />
        <Text style={[t.type.bodyStrong, { color: t.color.textSecondary, flex: 1 }]}>{HISTORY_COPY.storageEntry}</Text>
        <Ionicons name="chevron-forward" size={16} color={t.color.textMuted} />
      </Pressable>

      <StorageDialog visible={storageOpen} onClose={() => setStorageOpen(false)} />
    </ScrollView>
  );
}

function CalendarDay({ cell, selected, onPress }: { cell: CalendarCell | null; selected: boolean; onPress: () => void }) {
  const t = useSemanticTokens();
  if (!cell) return <View style={styles.cell} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />;
  const completed = cell.completed > 0;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={calendarDayLabel(cell, selected)}
      testID={`cal-day-${cell.day}`}
      style={[
        styles.cell,
        styles.dayCell,
        {
          borderRadius: t.radius.md,
          borderWidth: selected ? 2 : 1,
          borderColor: selected ? t.color.accent : completed ? t.color.accentSoft : "transparent",
          backgroundColor: completed ? t.color.accent + "22" : t.color.surfaceAlt,
        },
      ]}
    >
      <Text style={[t.type.caption, { color: completed ? t.color.accent : t.color.textSecondary, fontWeight: completed ? "800" : "600" }]}>
        {cell.day}
      </Text>
      {/* Status is shown by shape and label as well as colour. */}
      {completed && <Ionicons name="checkmark" size={10} color={t.color.accent} />}
    </Pressable>
  );
}

function StorageDialog({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useSemanticTokens();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={[StyleSheet.absoluteFill, { backgroundColor: t.color.scrim }]}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
      />
      <View style={[styles.dialogWrap, { pointerEvents: "box-none" }]}>
        <View
          style={[styles.card, { backgroundColor: t.color.surface, borderColor: t.color.border, padding: t.space.xl, gap: t.space.md }]}
          accessibilityViewIsModal
          accessibilityRole="alert"
          accessibilityLabel={HISTORY_COPY.storageEntry}
          testID="history-storage-dialog"
        >
          <Text style={[t.type.heading, { color: t.color.text }]} accessibilityRole="header">
            {HISTORY_COPY.storageEntry}
          </Text>
          <Text style={[t.type.body, { color: t.color.textSecondary }]}>{HISTORY_COPY.storageBody}</Text>
          <InfoBanner message={HISTORY_COPY.whatCounts.join(" · ")} testID="storage-what-counts" />
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            testID="storage-close"
            style={[styles.closeBtn, { backgroundColor: t.color.accent, minHeight: t.target.comfortable }]}
          >
            <Text style={[t.type.bodyStrong, { color: t.color.onAccent }]}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconBtn: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, height: 44, alignItems: "center", justifyContent: "center" },
  dayCell: { marginVertical: 2 },
  storageRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14 },
  dialogWrap: { flex: 1, justifyContent: "center", padding: 24 },
  closeBtn: { borderRadius: 14, alignItems: "center", justifyContent: "center" },
});
