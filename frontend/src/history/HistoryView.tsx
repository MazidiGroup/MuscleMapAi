// History home — one Monday–Sunday week at a time.
//
// Everything here comes from this owner's verified local records: completed sets
// only, Monday-start calendar weeks labelled as such, and an honest account of
// what is stored where. Damaged records are skipped without being deleted, and
// nothing implies cloud backup or cross-device recovery.
//
// The week is the unit of navigation. Inside a week the owner picks a day, and
// within that day repeats of one routine collapse into a single card rather
// than three near-identical ones — the individual sessions stay reachable from
// the card, and nothing is merged in storage.

import React, { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import type { Workout } from "@/src/anatomy/workoutScope";
import { setsByGroup, useWorkout } from "@/src/anatomy/workoutStore";
import { useSemanticTokens, SemanticTokens } from "@/src/theme/semantic";
import { usePremium } from "@/src/premium/PremiumContext";
import { hiddenHistoryCount, visibleHistory } from "@/src/premium/freeLimits";
import { EmptyState, InfoBanner, RetryPanel, WarningBanner } from "@/src/ui/state";
import { LiquidSheen } from "@/src/ui/GlassSurface";

import {
  CalendarCell,
  DAY_MS,
  HISTORY_COPY,
  RoutineSummary,
  calendarDayLabel,
  compactDuration,
  dayHeading,
  groupSessionsByRoutine,
  monthLabel,
  monthMatrix,
  partitionRecords,
  selectedDayLabel,
  setProgressLabel,
  startOfDay,
  startOfWeek,
  weekRangeLabel,
  weekRelativeLabel,
  weekShortLabel,
  weekTotals,
  workoutTitle,
} from "./metrics";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** A routine's icon is read from what it actually trained, never from its name. */
function routineIcon(sessions: Workout[]): keyof typeof Ionicons.glyphMap {
  const top = setsByGroup(sessions)
    .list.filter((g) => g.sets > 0)
    .sort((a, b) => b.sets - a.sets)[0]?.group;
  switch (top) {
    case "back":
    case "chest":
    case "core":
      return "body-outline";
    case "shoulders":
    case "arms":
    case "forearms":
      return "barbell-outline";
    case "quads":
    case "hamstrings":
    case "glutes":
    case "calves":
    case "adductors":
      return "walk-outline";
    default:
      return "fitness-outline";
  }
}

export function HistoryView({ scrollPadding = 24, topPadding }: { scrollPadding?: number; topPadding?: number }) {
  const t = useSemanticTokens();
  const s = useMemo(() => makeStyles(t), [t]);
  const router = useRouter();
  const w = useWorkout();
  const { resolution } = usePremium();

  // Damaged records are excluded from everything, and never removed from storage.
  const { valid, damaged } = useMemo(() => partitionRecords(w.history), [w.history]);
  // A free account reviews its recent workouts; older ones stay recorded and
  // are never deleted, only rolled up behind Premium. The count is stated
  // plainly rather than the list simply ending.
  const hasPremium = resolution.access;
  const reviewable = useMemo(() => visibleHistory(valid, hasPremium), [valid, hasPremium]);
  const hiddenCount = hiddenHistoryCount(valid.length, hasPremium);

  const [storageOpen, setStorageOpen] = useState(false);
  const [view, setView] = useState<"list" | "calendar">("list");

  const thisWeek = useMemo(() => startOfWeek(Date.now()), []);
  const [weekStart, setWeekStart] = useState(thisWeek);
  const [selectedDay, setSelectedDay] = useState(() => startOfDay(Date.now()));

  const totals = useMemo(() => weekTotals(reviewable, weekStart), [reviewable, weekStart]);
  const groupsTrained = useMemo(
    () =>
      setsByGroup(reviewable.filter((x) => x.date >= weekStart && x.date < weekStart + 7 * DAY_MS)).list.filter(
        (g) => g.sets > 0,
      ).length,
    [reviewable, weekStart],
  );

  const daySessions = useMemo(
    () => reviewable.filter((x) => startOfDay(x.date) === selectedDay),
    [reviewable, selectedDay],
  );
  const routines = useMemo(() => groupSessionsByRoutine(daySessions), [daySessions]);

  const shiftWeek = (delta: number) => {
    const next = weekStart + delta * 7 * DAY_MS;
    setWeekStart(next);
    // Land on the most recent day of that week that holds a record, so the day
    // list is never silently empty after a jump.
    const inWeek = reviewable
      .filter((x) => x.date >= next && x.date < next + 7 * DAY_MS)
      .sort((a, b) => b.date - a.date);
    setSelectedDay(inWeek.length > 0 ? startOfDay(inWeek[0].date) : next);
  };

  // Calendar month state — the month view is the equivalent of the day strip.
  const now = new Date();
  const [month, setMonth] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [calSelected, setCalSelected] = useState<number | null>(null);
  const cells = useMemo(() => monthMatrix(month.year, month.month, valid), [month, valid]);
  const calWorkouts = useMemo(
    () => (calSelected === null ? [] : valid.filter((x) => startOfDay(x.date) === calSelected)),
    [calSelected, valid],
  );
  const shiftMonth = (delta: number) => {
    setCalSelected(null);
    const d = new Date(month.year, month.month + delta, 1);
    setMonth({ year: d.getFullYear(), month: d.getMonth() });
  };
  const prevMonth = new Date(month.year, month.month - 1, 1);
  const nextMonth = new Date(month.year, month.month + 1, 1);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.color.bg }}
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
          {/* Week navigator — the week is the unit of browsing. */}
          <View style={s.weekNav} testID="history-week-nav">
            <Pressable
              onPress={() => shiftWeek(-1)}
              accessibilityRole="button"
              accessibilityLabel={`Previous week, ${weekShortLabel(weekStart - 7 * DAY_MS)}`}
              testID="week-prev"
              style={s.navBtn}
            >
              <LiquidSheen tone="neutral" />
              <Ionicons name="chevron-back" size={20} color={t.color.text} />
            </Pressable>
            <View style={{ flex: 1, alignItems: "center" }} accessibilityLiveRegion="polite">
              <Text style={[t.type.heading, { color: t.color.text }]} testID="week-range">
                {weekShortLabel(weekStart)}
              </Text>
              <Text style={[t.type.caption, { color: t.color.textMuted, marginTop: 2 }]}>
                {weekRelativeLabel(weekStart)}
              </Text>
            </View>
            <Pressable
              onPress={() => shiftWeek(1)}
              disabled={weekStart >= thisWeek}
              accessibilityRole="button"
              accessibilityState={{ disabled: weekStart >= thisWeek }}
              accessibilityLabel={`Next week, ${weekShortLabel(weekStart + 7 * DAY_MS)}`}
              testID="week-next"
              style={[s.navBtn, weekStart >= thisWeek && { opacity: t.state.disabledOpacity }]}
            >
              <LiquidSheen tone="neutral" />
              <Ionicons name="chevron-forward" size={20} color={t.color.text} />
            </Pressable>
          </View>

          {/* The selected week's totals, from completed sets only. */}
          <View style={[s.card, { padding: t.space.lg }]} testID="history-week">
            <LiquidSheen tone="neutral" />
            <Text style={[t.type.label, { color: t.color.textMuted }]}>{weekRangeLabel(weekStart)}</Text>
            <Text style={[t.type.title, { color: t.color.text, marginTop: 2 }]}>
              {totals.sessions} session{totals.sessions === 1 ? "" : "s"} logged
            </Text>

            <View style={[s.statRow, { marginTop: t.space.lg }]}>
              <Stat t={t} s={s} value={`${totals.completedSets}`} label="Sets" />
              <View style={s.statDivider} />
              <Stat t={t} s={s} value={`${totals.volume}`} unit={w.unit} label="Volume" />
              <View style={s.statDivider} />
              <Stat t={t} s={s} value={`${groupsTrained}`} label={groupsTrained === 1 ? "Group" : "Groups"} />
            </View>

            {/* Days trained — one segment per day of the Monday–Sunday week. */}
            <View
              style={s.dayMeter}
              accessible
              accessibilityLabel={`${totals.daysTrained} of 7 days trained in this week`}
              testID="history-day-meter"
            >
              {totals.perDay.map((n, i) => (
                <View key={i} style={[s.dayMeterSeg, { backgroundColor: n > 0 ? t.color.accent : t.color.surfaceAlt }]} />
              ))}
            </View>
          </View>

          {/* List / Calendar. Every action in one has an equivalent in the other. */}
          <View style={s.seg} testID="history-view-toggle">
            {(["list", "calendar"] as const).map((v) => (
              <Pressable
                key={v}
                onPress={() => setView(v)}
                accessibilityRole="button"
                accessibilityState={{ selected: view === v }}
                accessibilityLabel={v === "list" ? "List view" : "Calendar view"}
                testID={`history-view-${v}`}
                style={[s.segBtn, view === v && { borderColor: t.color.accent }]}
              >
                <Ionicons
                  name={v === "list" ? "list" : "calendar-outline"}
                  size={16}
                  color={view === v ? t.color.accent : t.color.textMuted}
                />
                <Text style={[t.type.bodyStrong, { color: view === v ? t.color.accent : t.color.textMuted }]}>
                  {v === "list" ? "List" : "Calendar"}
                </Text>
              </Pressable>
            ))}
          </View>

          {view === "list" ? (
            <>
              {/* Day strip for the selected week. */}
              <View style={[s.card, { padding: t.space.sm }]} testID="history-day-strip">
                <LiquidSheen tone="neutral" />
                <View style={s.strip}>
                  {WEEKDAYS.map((label, i) => {
                    const ts = weekStart + i * DAY_MS;
                    const selected = ts === selectedDay;
                    const count = totals.perDay[i];
                    return (
                      <Pressable
                        key={label}
                        onPress={() => setSelectedDay(ts)}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        accessibilityLabel={`${dayHeading(ts)}, ${count} session${count === 1 ? "" : "s"}`}
                        testID={`history-day-${i}`}
                        style={[
                          s.stripCell,
                          {
                            borderColor: selected ? t.color.accent : "transparent",
                            backgroundColor: selected ? t.color.accent + "1A" : "transparent",
                          },
                        ]}
                      >
                        <Text style={[t.type.caption, { color: selected ? t.color.accent : t.color.textMuted }]}>
                          {label}
                        </Text>
                        <Text style={[t.type.subheading, { color: selected ? t.color.accent : t.color.text, marginTop: 2 }]}>
                          {new Date(ts).getDate()}
                        </Text>
                        {/* A trained day is marked by a shape, not by colour alone. */}
                        <View style={[s.stripDot, { backgroundColor: count > 0 ? t.color.accent : "transparent" }]} />
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={{ gap: 2 }}>
                <Text style={[t.type.heading, { color: t.color.text }]} testID="history-day-heading">
                  {dayHeading(selectedDay)}
                </Text>
                <Text style={[t.type.caption, { color: t.color.textMuted }]}>
                  {daySessions.length === 0
                    ? "No sessions"
                    : `${daySessions.length} session${daySessions.length === 1 ? "" : "s"}`}
                </Text>
              </View>

              {routines.length === 0 ? (
                <View style={[s.card, { padding: t.space.lg }]} testID="history-day-empty">
                  <LiquidSheen tone="neutral" />
                  <Text style={[t.type.body, { color: t.color.textSecondary }]}>
                    No completed workout is recorded on this date.
                  </Text>
                </View>
              ) : (
                routines.map((r) => <RoutineCard key={r.key} routine={r} unit={w.unit} />)
              )}
            </>
          ) : (
            /* Month grid. Every action here has a list equivalent above. */
            <View style={[s.card, { padding: t.space.lg, gap: t.space.md }]} testID="history-calendar">
              <LiquidSheen tone="neutral" />
              <View style={s.row}>
                <Pressable
                  onPress={() => shiftMonth(-1)}
                  accessibilityRole="button"
                  accessibilityLabel={`Previous month, ${monthLabel(prevMonth.getFullYear(), prevMonth.getMonth())}`}
                  testID="cal-prev"
                  style={s.iconBtn}
                >
                  <LiquidSheen tone="neutral" />
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
                  style={s.iconBtn}
                >
                  <LiquidSheen tone="neutral" />
                  <Ionicons name="chevron-forward" size={18} color={t.color.textSecondary} />
                </Pressable>
              </View>

              <View style={s.grid}>
                {WEEKDAYS.map((d) => (
                  <Text key={d} style={[t.type.caption, s.cell, { color: t.color.textMuted }]}>
                    {d}
                  </Text>
                ))}
                {cells.map((cell, i) => (
                  <CalendarDay
                    key={cell ? cell.ts : `pad${i}`}
                    cell={cell}
                    selected={!!cell && calSelected === cell.ts}
                    onPress={() => cell && setCalSelected(calSelected === cell.ts ? null : cell.ts)}
                  />
                ))}
              </View>

              {calSelected !== null && (
                <View style={{ gap: t.space.sm }} testID="cal-selected">
                  <Text style={[t.type.label, { color: t.color.textMuted }]}>
                    {selectedDayLabel(calSelected, calWorkouts.length)}
                  </Text>
                  {calWorkouts.length === 0 ? (
                    <Text style={[t.type.caption, { color: t.color.textMuted }]}>
                      No completed workout on this date.
                    </Text>
                  ) : (
                    calWorkouts.map((item) => (
                      <Pressable
                        key={item.id}
                        onPress={() => router.push({ pathname: "/summary", params: { id: item.id } })}
                        accessibilityRole="button"
                        testID={`cal-workout-${item.id}`}
                        style={[s.card, { backgroundColor: t.color.surfaceAlt, padding: t.space.md }]}
                      >
                        <LiquidSheen tone="subtle" />
                        <Text style={[t.type.bodyStrong, { color: t.color.text }]}>{workoutTitle(item)}</Text>
                      </Pressable>
                    ))
                  )}
                </View>
              )}
            </View>
          )}
        </>
      )}

      {hiddenCount > 0 ? (
        <Pressable
          onPress={() => router.push("/(tabs)/coach")}
          accessibilityRole="button"
          accessibilityLabel={`${hiddenCount} earlier ${hiddenCount === 1 ? "workout is" : "workouts are"} part of Premium. Opens Premium.`}
          testID="history-cap-notice"
          style={[s.storageRow, { minHeight: t.target.min }]}
        >
          <LiquidSheen tone="accent" />
          <Ionicons name="time-outline" size={16} color={t.color.accent} />
          <Text style={[t.type.bodyStrong, { color: t.color.text, flex: 1 }]}>
            {hiddenCount} earlier {hiddenCount === 1 ? "workout" : "workouts"} saved — see your full history with Premium
          </Text>
          <Ionicons name="chevron-forward" size={16} color={t.color.accent} />
        </Pressable>
      ) : null}

      <Pressable
        onPress={() => setStorageOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={HISTORY_COPY.storageEntry}
        testID="history-storage-entry"
        style={[s.storageRow, { minHeight: t.target.min }]}
      >
        <LiquidSheen tone="neutral" />
        <Ionicons name="information-circle-outline" size={18} color={t.color.textSecondary} />
        <Text style={[t.type.bodyStrong, { color: t.color.textSecondary, flex: 1 }]}>{HISTORY_COPY.storageEntry}</Text>
        <Ionicons name="chevron-forward" size={16} color={t.color.textMuted} />
      </Pressable>

      <StorageDialog visible={storageOpen} onClose={() => setStorageOpen(false)} />
    </ScrollView>
  );
}

function Stat({
  t,
  s,
  value,
  unit,
  label,
}: {
  t: SemanticTokens;
  s: ReturnType<typeof makeStyles>;
  value: string;
  unit?: string;
  label: string;
}) {
  return (
    <View style={s.stat} accessible accessibilityLabel={`${value}${unit ? ` ${unit}` : ""} ${label}`}>
      <View style={s.statValueRow}>
        <Text style={[t.type.title, { color: t.color.text }]}>{value}</Text>
        {unit ? <Text style={[t.type.caption, { color: t.color.textSecondary }]}>{unit}</Text> : null}
      </View>
      <Text style={[t.type.caption, { color: t.color.textMuted, marginTop: 2 }]}>{label}</Text>
    </View>
  );
}

/**
 * One routine on one day. Repeats of the same routine collapse here: the card
 * opens the latest run, and every run stays individually reachable through its
 * own duration chip. Nothing is merged in storage.
 */
function RoutineCard({ routine, unit }: { routine: RoutineSummary; unit: string }) {
  const t = useSemanticTokens();
  const s = useMemo(() => makeStyles(t), [t]);
  const router = useRouter();
  const open = (id: string) => router.push({ pathname: "/summary", params: { id } });
  const repeats = routine.sessions.length;
  const icon = useMemo(() => routineIcon(routine.sessions), [routine.sessions]);

  return (
    <View style={[s.card, { padding: t.space.lg, gap: t.space.md }]} testID={`hist-routine-${routine.key}`}>
      <LiquidSheen tone="neutral" />
      <Pressable
        onPress={() => open(routine.sessions[0].id)}
        accessibilityRole="button"
        accessibilityLabel={`${routine.name}, ${setProgressLabel(routine.completedSets, routine.totalSets)} sets completed, ${routine.volume} ${unit}, ${repeats} session${repeats === 1 ? "" : "s"}${routine.needsReview ? ", needs review" : ""}`}
        testID={`hist-${routine.sessions[0].id}`}
        style={s.row}
      >
        <View style={s.avatar}>
          <LiquidSheen tone="accent" />
          <Ionicons name={icon} size={20} color={t.color.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.routineName} numberOfLines={1}>
            {routine.name}
          </Text>
          <Text style={[t.type.caption, { color: t.color.textMuted, marginTop: 2 }]}>
            {setProgressLabel(routine.completedSets, routine.totalSets)} sets · {routine.volume} {unit}
          </Text>
        </View>
        {repeats > 1 ? (
          <View style={s.chip}>
            <LiquidSheen tone="accent" />
            <Text style={[t.type.caption, { color: t.color.accent }]}>{repeats} sessions</Text>
          </View>
        ) : routine.sessions[0].durationSec > 0 ? (
          <Text style={[t.type.caption, { color: t.color.textMuted }]}>
            {compactDuration(routine.sessions[0].durationSec)}
          </Text>
        ) : null}
        <Ionicons name="chevron-forward" size={18} color={t.color.textMuted} />
      </Pressable>

      {(repeats > 1 || routine.needsReview) && (
        <View style={s.footer}>
          <View style={s.chipWrap}>
            {repeats > 1 &&
              routine.sessions.map((session) => (
                <Pressable
                  key={session.id}
                  onPress={() => open(session.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open the ${compactDuration(session.durationSec)} run of ${routine.name}`}
                  testID={`hist-session-${session.id}`}
                  style={s.durationChip}
                >
                  <LiquidSheen tone="subtle" />
                  <Text style={[t.type.caption, { color: t.color.textSecondary }]}>
                    {compactDuration(session.durationSec)}
                  </Text>
                </Pressable>
              ))}
          </View>
          {routine.needsReview && (
            <Text style={[t.type.bodyStrong, { color: t.color.accent }]} testID={`hist-review-${routine.key}`}>
              Needs review
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

function CalendarDay({ cell, selected, onPress }: { cell: CalendarCell | null; selected: boolean; onPress: () => void }) {
  const t = useSemanticTokens();
  const s = useMemo(() => makeStyles(t), [t]);
  if (!cell) return <View style={s.cell} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />;
  const completed = cell.completed > 0;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={calendarDayLabel(cell, selected)}
      testID={`cal-day-${cell.day}`}
      style={[
        s.cell,
        s.dayCell,
        {
          borderRadius: t.radius.md,
          borderWidth: selected ? 2 : 1,
          borderColor: selected ? t.color.accent : completed ? t.color.accentSoft : "transparent",
          backgroundColor: completed ? t.color.accent + "22" : t.color.surfaceAlt,
        },
      ]}
    >
      <LiquidSheen tone={selected || completed ? "accent" : "subtle"} />
      <Text
        style={[
          t.type.caption,
          { color: completed ? t.color.accent : t.color.textSecondary, fontWeight: completed ? "800" : "600" },
        ]}
      >
        {cell.day}
      </Text>
      {/* Status is shown by shape and label as well as colour. */}
      {completed && <Ionicons name="checkmark" size={10} color={t.color.accent} />}
    </Pressable>
  );
}

function StorageDialog({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useSemanticTokens();
  const s = useMemo(() => makeStyles(t), [t]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={[StyleSheet.absoluteFill, { backgroundColor: t.color.scrim }]}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
      />
      <View style={[s.dialogWrap, { pointerEvents: "box-none" }]}>
        <View
          style={[s.card, { padding: t.space.xl, gap: t.space.md }]}
          accessibilityViewIsModal
          accessibilityRole="alert"
          accessibilityLabel={HISTORY_COPY.storageEntry}
          testID="history-storage-dialog"
        >
          <LiquidSheen tone="neutral" />
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
            style={[s.closeBtn, { backgroundColor: t.color.accent, minHeight: t.target.comfortable }]}
          >
            <LiquidSheen tone="accent" />
            <Text style={[t.type.bodyStrong, { color: t.color.onAccent }]}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (t: SemanticTokens) =>
  StyleSheet.create({
    card: { borderRadius: t.radius.xl, overflow: "hidden", backgroundColor: t.color.surface },
    row: { flexDirection: "row", alignItems: "center", gap: t.space.sm },
    weekNav: { flexDirection: "row", alignItems: "center", gap: t.space.sm },
    navBtn: {
      width: t.target.min,
      height: t.target.min,
      borderRadius: t.radius.md,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      backgroundColor: t.color.surface,
    },
    statRow: { flexDirection: "row", alignItems: "center" },
    stat: { flex: 1, alignItems: "center" },
    statValueRow: { flexDirection: "row", alignItems: "baseline", gap: 3 },
    statDivider: { width: 1, height: 34, backgroundColor: t.color.border },
    dayMeter: { flexDirection: "row", gap: 3, marginTop: t.space.lg },
    dayMeterSeg: { flex: 1, height: 4, borderRadius: 2 },
    seg: {
      flexDirection: "row",
      gap: t.space.sm,
      backgroundColor: t.color.surface,
      borderRadius: t.radius.xl,
      padding: 4,
      overflow: "hidden",
    },
    // Selection is an outline in the accent; the fill never changes, so the
    // geometry is identical in both states.
    segBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      minHeight: t.target.min,
      borderRadius: t.radius.xl,
      borderWidth: 1.5,
      borderColor: "transparent",
    },
    strip: { flexDirection: "row" },
    stripCell: {
      flex: 1,
      alignItems: "center",
      paddingVertical: t.space.sm,
      borderRadius: t.radius.md,
      borderWidth: 1.5,
    },
    stripDot: { width: 5, height: 5, borderRadius: 3, marginTop: 4 },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      backgroundColor: t.color.surfaceAlt,
    },
    routineName: { color: t.color.text, fontSize: 17, fontWeight: "800", lineHeight: 22 },
    chip: {
      flexShrink: 0,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: t.radius.pill,
      overflow: "hidden",
      backgroundColor: t.color.surfaceAlt,
    },
    footer: { flexDirection: "row", alignItems: "center", gap: t.space.sm },
    chipWrap: { flex: 1, flexDirection: "row", flexWrap: "wrap" },
    durationChip: {
      minHeight: 30,
      justifyContent: "center",
      paddingHorizontal: 10,
      borderRadius: t.radius.pill,
      overflow: "hidden",
      backgroundColor: t.color.surfaceAlt,
      marginRight: 6,
      marginBottom: 4,
    },
    iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", overflow: "hidden" },
    grid: { flexDirection: "row", flexWrap: "wrap" },
    cell: { width: `${100 / 7}%`, height: 44, alignItems: "center", justifyContent: "center" },
    dayCell: { marginVertical: 2, overflow: "hidden" },
    storageRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderRadius: t.radius.xl,
      paddingHorizontal: 14,
      overflow: "hidden",
      backgroundColor: t.color.surface,
    },
    dialogWrap: { flex: 1, justifyContent: "center", padding: 24 },
    closeBtn: {
      borderRadius: t.radius.xl,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.28)",
    },
  });
