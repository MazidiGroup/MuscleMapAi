import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { AnatomyViewer } from "./AnatomyViewer";
import { DraggableSheet } from "./DraggableSheet";
import {
  useWorkout,
  computeRecovery,
  weeklySetsByGroup,

  computeStreaks,
  periodStats,
  topPRs,
  RECOVERY_COLORS,
  RECOVERY_LEGEND,
  RECOVERY_NOTE,
} from "./workoutStore";
import {
  CONSISTENCY_NOTE,
  VOLUME_CHART_TITLE,
  performanceUnitSafe,
  rollingVolumeSeries,
} from "@/src/history/metrics";
import { legacyPalette, LegacyPalette } from "./ui";
import { FLAGS } from "@/src/config/featureFlags";
import { useTheme } from "@/src/theme/ThemeContext";
import { A11yControl } from "@/src/ui/A11yControl";
import { LiquidTouchableOpacity as TouchableOpacity } from "@/src/ui/LiquidTouchableOpacity";

type Period = "week" | "month";

const fmtVol = (v: number) => (v >= 10000 ? `${Math.round(v / 100) / 10}k` : `${v}`);

export function InsightsView() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { height } = useWindowDimensions();
  const { mode } = useTheme();
  const T = useMemo(() => legacyPalette(mode), [mode]);
  const styles = useMemo(() => makeStyles(T), [T]);
  const { history, prs, unit } = useWorkout();
  const [period, setPeriod] = useState<Period>("week");

  const days = period === "week" ? 7 : 30;
  const recovery = useMemo(() => computeRecovery(history), [history]);
  const activation = useMemo(() => weeklySetsByGroup(history, days), [history, days]);
  // Discrete rolling 7-day windows — deliberately NOT calendar weeks, and the
  // exact same series feeds the chart and its table alternative.
  const series = useMemo(
    () => rollingVolumeSeries(history, period === "week" ? 6 : 12),
    [history, period],
  );
  const [showTable, setShowTable] = useState(false);
  const stats = useMemo(() => periodStats(history, days), [history, days]);
  const streaks = useMemo(() => computeStreaks(history), [history]);
  const records = useMemo(() => topPRs(prs, 6), [prs]);
  const maxVol = Math.max(1, ...series.map((s) => s.volume));
  const maxSets = Math.max(1, ...activation.list.map((g) => g.sets));

  if (history.length === 0) {
    return (
      <View style={[styles.full, styles.empty, { paddingTop: insets.top + 56 }]}>
        <Ionicons name="pulse-outline" size={40} color={T.textFaint} />
        <Text style={styles.emptyText}>No insights yet</Text>
        <Text style={styles.emptySub}>Finish a few workouts to see your training stats, records and progress charts.</Text>
      </View>
    );
  }

  const sheetMax = Math.min(height * 0.86, height - insets.top - 108);

  return (
    <View style={styles.full}>
      <AnatomyViewer mode="recovery" recovery={recovery.colorMap} />

      {/* Draggable panel: drag the handle to see more of the 3D recovery map or more stats. */}
      <DraggableSheet peekHeight={190} maxHeight={sheetMax} initial="half">
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + 80 }}
        >
          {/* Key to the 3D model above. Without it the colours are unreadable —
              the model is the first thing on this screen, so the key comes first. */}
          <View style={styles.legendCard} testID="recovery-legend">
            <Text style={styles.legendTitle}>Recovery map</Text>
            <View style={styles.legendGrid}>
              {RECOVERY_LEGEND.map((item) => (
                <View
                  key={item.state}
                  style={styles.legendItem}
                  accessible
                  accessibilityLabel={`${item.label}: ${item.help}`}
                >
                  <View style={[styles.legendDot, { backgroundColor: RECOVERY_COLORS[item.state] }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.legendLabel}>{item.label}</Text>
                    <Text style={styles.legendHelp}>{item.help}</Text>
                  </View>
                </View>
              ))}
            </View>
            <Text style={styles.legendNote}>{RECOVERY_NOTE}</Text>
          </View>

          {FLAGS.insightsV2 && (
            <>
              {/* week / month toggle */}
              <View style={styles.periodSeg}>
                {(["week", "month"] as Period[]).map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={[styles.periodBtn, period === p && styles.periodBtnActive]}
                    onPress={() => setPeriod(p)}
                    testID={`insights-period-${p}`}
                  >
                    <Text style={[styles.periodText, period === p && styles.periodTextActive]}>
                      {p === "week" ? "Last 7 days" : "Last 30 days"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* period stats */}
              <View style={styles.weekStats}>
                <View style={styles.wStat}>
                  <Text style={styles.wValue}>{stats.workouts}</Text>
                  <Text style={styles.wLabel}>Workouts</Text>
                </View>
                <View style={styles.wStat}>
                  <Text style={styles.wValue}>{stats.sets}</Text>
                  <Text style={styles.wLabel}>Sets</Text>
                </View>
                <View style={styles.wStat}>
                  <Text style={styles.wValue}>{fmtVol(stats.volume)}</Text>
                  <Text style={styles.wLabel}>{`Volume (${unit})`}</Text>
                </View>
                <View style={styles.wStat}>
                  <Text style={styles.wValue}>{period === "month" ? stats.perWeek : activation.list.filter((g) => g.sets > 0).length}</Text>
                  <Text style={styles.wLabel}>{period === "month" ? "Per week" : "Groups hit"}</Text>
                </View>
              </View>

              {/* streak */}
              <View style={styles.streakCard} testID="insights-streak">
                <View style={styles.streakIcon}>
                  <Ionicons name="flame" size={22} color="#FF8A3D" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.streakValue}>
                    {streaks.currentWeeks} week{streaks.currentWeeks === 1 ? "" : "s"} in a row
                  </Text>
                  <Text style={styles.streakSub}>
                    Best: {streaks.bestWeeks} week{streaks.bestWeeks === 1 ? "" : "s"} · {streaks.workoutsThisWeek} workout
                    {streaks.workoutsThisWeek === 1 ? "" : "s"} this Monday–Sunday week
                  </Text>
                  <Text style={styles.streakNote}>{CONSISTENCY_NOTE}</Text>
                </View>
              </View>
            </>
          )}

          {/* sets per muscle group */}
          <Text style={styles.section}>{period === "week" ? "Sets This Week" : "Sets Last 30 Days"}</Text>
          {activation.list
            .filter((g) => g.sets > 0)
            .map((g) => (
              <View key={g.group} style={styles.barRow}>
                <Text style={styles.barLabel}>{g.label}</Text>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${(g.sets / maxSets) * 100}%` }]} />
                </View>
                <Text style={styles.barVal}>{g.sets}</Text>
              </View>
            ))}
          {activation.neglected.length > 0 && (
            <View style={styles.neglect}>
              <Ionicons name="alert-circle-outline" size={16} color={T.secondary} />
              <Text style={styles.neglectText}>
                Not trained {period === "week" ? "this week" : "in the last 30 days"}: {activation.neglected.join(", ")}
              </Text>
            </View>
          )}

          {/* personal records */}
          {FLAGS.insightsV2 && records.length > 0 && (
            <>
              <Text style={styles.section}>Personal Records</Text>
              {records.map((r) => (
                <View key={r.exerciseId} style={styles.prRow} testID={`pr-${r.exerciseId}`}>
                  <View style={styles.prBadge}>
                    <Ionicons name="trophy" size={14} color="#FFB020" />
                  </View>
                  <Text style={styles.prName} numberOfLines={1}>
                    {r.name}
                  </Text>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.prWeight}>{r.maxWeight > 0 ? `${r.maxWeight} ${unit}` : "—"}</Text>
                  </View>
                </View>
              ))}
            </>
          )}

          {/* Volume trend — rolling 7-day periods, with an equivalent table. */}
          <View style={styles.chartHead}>
            <Text style={[styles.section, { flex: 1 }]}>{VOLUME_CHART_TITLE}</Text>
            <A11yControl
              label={showTable ? "Show chart" : "Show volume as a table"}
              hint="Switches between the volume chart and the same figures as a table"
              onPress={() => setShowTable((v) => !v)}
              style={styles.tableToggle}
              testID="insights-chart-toggle"
            >
              <Ionicons name={showTable ? "stats-chart" : "list"} size={14} color={T.text} />
              <Text style={styles.tableToggleText}>{showTable ? "Chart" : "Table"}</Text>
            </A11yControl>
          </View>

          <Text style={styles.hint} testID="insights-chart-summary">
            {`Completed volume in ${unit} for the last ${series.length} rolling 7-day periods, ${series[0].rangeLabel} through ${series[series.length - 1].rangeLabel}.`}
          </Text>

          {showTable ? (
            <View style={styles.table} testID="insights-volume-table">
              {series.map((point) => (
                <View key={point.startTs} style={styles.tableRow}>
                  <Text style={styles.tableRange}>{point.rangeLabel}</Text>
                  <Text style={styles.tableValue}>
                    {performanceUnitSafe(point.volume, unit)}
                    {point.workouts === 0 ? " · no workouts" : ` · ${point.workouts} workout${point.workouts === 1 ? "" : "s"}`}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <View
              style={styles.chart}
              accessible
              accessibilityRole="image"
              accessibilityLabel={series
                .map((p) => `${p.rangeLabel}: ${performanceUnitSafe(p.volume, unit)}`)
                .join("; ")}
              testID="insights-volume-chart"
            >
              {series.map((point, i) => (
                <View key={point.startTs} style={styles.chartCol}>
                  <Text style={styles.chartVal}>
                    {point.volume > 0 ? Math.round((point.volume / 1000) * 10) / 10 + "k" : ""}
                  </Text>
                  <View style={styles.chartBarTrack}>
                    <View style={[styles.chartBar, { height: `${(point.volume / maxVol) * 100}%` }]} />
                  </View>
                  <Text style={styles.chartLabel}>
                    {series.length > 8 && (series.length - 1 - i) % 2 !== 0 ? "" : point.rangeLabel.split(" – ")[1]}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Citations — Guideline 1.4.1: sources for recovery timing & training data */}
          <TouchableOpacity
            style={styles.srcRow}
            onPress={() => router.push("/references")}
            testID="insights-view-sources"
          >
            <Ionicons name="library-outline" size={14} color={T.textFaint} />
            <Text style={styles.srcText}>
              Recovery timing (24–72 h) and volume guidance based on ACSM position stands and peer-reviewed research on DOMS &amp; muscle protein synthesis.
            </Text>
            <Text style={styles.srcCta}>View sources</Text>
          </TouchableOpacity>
        </ScrollView>
      </DraggableSheet>
    </View>
  );
}

const makeStyles = (T: LegacyPalette) => StyleSheet.create({
  full: { ...StyleSheet.absoluteFillObject, backgroundColor: T.bg },
  empty: { alignItems: "center", justifyContent: "center", gap: 10, padding: 30 },
  emptyText: { color: T.text, fontSize: 17, fontWeight: "700" },
  emptySub: { color: T.textDim, fontSize: 14, textAlign: "center", lineHeight: 20 },
  legendCard: {
    backgroundColor: T.bg2, borderWidth: 1, borderColor: T.border, borderRadius: 22,
    padding: 14, marginTop: 12,
  },
  legendTitle: {
    color: T.textDim, fontSize: 11.5, fontWeight: "800",
    textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10,
  },
  legendGrid: { gap: 9 },
  legendItem: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  legendDot: { width: 12, height: 12, borderRadius: 6, marginTop: 2 },
  legendLabel: { color: T.text, fontSize: 13, fontWeight: "700" },
  legendHelp: { color: T.textFaint, fontSize: 11.5, marginTop: 1 },
  legendNote: { color: T.textFaint, fontSize: 10.5, lineHeight: 15, marginTop: 11 },

  periodSeg: { flexDirection: "row", backgroundColor: T.bg2, borderRadius: 22, padding: 4, gap: 4, marginTop: 12, borderWidth: 1, borderColor: T.border },
  periodBtn: { flex: 1, paddingVertical: 8, borderRadius: 22, alignItems: "center" },
  periodBtnActive: { backgroundColor: T.accent },
  periodText: { color: T.textDim, fontSize: 13, fontWeight: "700" },
  periodTextActive: { color: T.bg },
  streakCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "rgba(255,138,61,0.10)", borderWidth: 1, borderColor: "rgba(255,138,61,0.35)", borderRadius: 22, padding: 14, marginTop: 8 },
  streakIcon: { width: 40, height: 40, borderRadius: 22, backgroundColor: "rgba(255,138,61,0.16)", alignItems: "center", justifyContent: "center" },
  streakValue: { color: T.text, fontSize: 16, fontWeight: "800" },
  streakNote: { color: T.textFaint, fontSize: 11.5, marginTop: 2 },
  chartHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  tableToggle: {
    flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 12,
    borderRadius: 999, borderWidth: 1, borderColor: T.border, backgroundColor: T.surface,
  },
  tableToggleText: { color: T.text, fontSize: 12.5, fontWeight: "700" },
  table: { borderWidth: 1, borderColor: T.border, borderRadius: 22, overflow: "hidden" },
  tableRow: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: T.border },
  tableRange: { color: T.textDim, fontSize: 12, fontWeight: "700" },
  tableValue: { color: T.text, fontSize: 14, fontWeight: "700", marginTop: 2 },
  streakSub: { color: T.textDim, fontSize: 12, marginTop: 2 },
  prRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: T.bg2, borderWidth: 1, borderColor: T.border, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 7 },
  prBadge: { width: 30, height: 30, borderRadius: 22, backgroundColor: "rgba(255,176,32,0.14)", alignItems: "center", justifyContent: "center" },
  prName: { color: T.text, fontSize: 14, fontWeight: "700", flex: 1 },
  prWeight: { color: T.accent, fontSize: 15, fontWeight: "800" },
  section: { color: T.textDim, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 20, marginBottom: 10 },
  weekStats: { flexDirection: "row", gap: 8, marginBottom: 14 },
  wStat: { flex: 1, backgroundColor: T.bg2, borderRadius: 22, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: T.border },
  wValue: { color: T.accent, fontSize: 20, fontWeight: "800" },
  wLabel: { color: T.textFaint, fontSize: 11, marginTop: 2 },
  barRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  barLabel: { color: T.text, fontSize: 13, fontWeight: "600", width: 88 },
  barTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: T.surfaceHi, overflow: "hidden" },
  barFill: { height: 10, borderRadius: 5, backgroundColor: T.accent },
  barVal: { color: T.textDim, fontSize: 13, fontWeight: "700", width: 28, textAlign: "right" },
  neglect: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, backgroundColor: "rgba(255,176,32,0.1)", borderRadius: 22, padding: 12 },
  neglectText: { color: T.text, fontSize: 13, flex: 1 },
  chart: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", height: 150, gap: 8, paddingTop: 8 },
  chartCol: { flex: 1, alignItems: "center", height: "100%" },
  chartVal: { color: T.textDim, fontSize: 10, fontWeight: "700", marginBottom: 4 },
  chartBarTrack: { flex: 1, width: "70%", justifyContent: "flex-end" },
  chartBar: { width: "100%", backgroundColor: T.accent, borderRadius: 6, minHeight: 3 },
  chartLabel: { color: T.textFaint, fontSize: 11, marginTop: 6 },
  hint: { color: T.textFaint, fontSize: 12, marginTop: 8 },
  srcRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 18,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: T.bg2,
    borderWidth: 1,
    borderColor: T.border,
  },
  srcText: { flex: 1, color: T.textFaint, fontSize: 11, lineHeight: 15 },
  srcCta: { color: T.accent, fontSize: 11, fontWeight: "800" },
});
