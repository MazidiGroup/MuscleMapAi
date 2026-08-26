// Insights — the recovery model, and what the stored records say about it.
//
// The 3D map is the subject of the screen; the panel below it is one column of
// cards that read in order: what the colours mean, what was trained, what was
// beaten, and how the volume moved. Every figure comes from the same completed
// -set rules as History, and the chart always has a table equivalent.

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
import { usePremium } from "@/src/premium/PremiumContext";
import { canChartPeriod } from "@/src/premium/freeLimits";
import { A11yControl } from "@/src/ui/A11yControl";
import { LiquidTouchableOpacity as TouchableOpacity } from "@/src/ui/LiquidTouchableOpacity";

type Period = "week" | "month";

const PR_PREVIEW = 3;

const fmtVol = (v: number) => (v >= 10000 ? `${Math.round(v / 100) / 10}k` : `${v}`);

export function InsightsView() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { height } = useWindowDimensions();
  const { mode } = useTheme();
  const T = useMemo(() => legacyPalette(mode), [mode]);
  const styles = useMemo(() => makeStyles(T), [T]);
  const { history, prs, unit } = useWorkout();
  const { resolution } = usePremium();
  const [period, setPeriod] = useState<Period>("week");

  // The current week is free; the 30-day view is Premium. Entitlement is read,
  // never re-derived, and a free account is dropped back to the week rather
  // than being shown an empty or half-populated chart.
  const hasPremium = resolution.access;
  const periodAllowed = canChartPeriod(period === "week" ? 7 : 30, hasPremium);
  const effectivePeriod: Period = periodAllowed ? period : "week";
  const days = effectivePeriod === "week" ? 7 : 30;
  const recovery = useMemo(() => computeRecovery(history), [history]);
  const activation = useMemo(() => weeklySetsByGroup(history, days), [history, days]);
  // Discrete rolling 7-day windows — deliberately NOT calendar weeks, and the
  // exact same series feeds the chart and its table alternative.
  const series = useMemo(
    () => rollingVolumeSeries(history, effectivePeriod === "week" ? 6 : 12),
    [history, effectivePeriod],
  );
  const [showTable, setShowTable] = useState(false);
  const [allRecords, setAllRecords] = useState(false);
  const stats = useMemo(() => periodStats(history, days), [history, days]);
  const streaks = useMemo(() => computeStreaks(history), [history]);
  const records = useMemo(() => topPRs(prs, 12), [prs]);
  const maxVol = Math.max(1, ...series.map((s) => s.volume));
  const trained = activation.list.filter((g) => g.sets > 0);
  const maxSets = Math.max(1, ...trained.map((g) => g.sets));
  const shownRecords = allRecords ? records : records.slice(0, PR_PREVIEW);

  if (history.length === 0) {
    return (
      <View style={[styles.full, styles.empty, { paddingTop: 24 }]}>
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
      <DraggableSheet peekHeight={210} maxHeight={sheetMax} initial="half" opaque>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + 80, gap: 14 }}
        >
          {/* Panel header: what this panel is, and over which period. */}
          <View style={styles.panelHead}>
            <Text style={styles.panelTitle} accessibilityRole="header">
              Training overview
            </Text>
            <View style={styles.periodSeg}>
              {(["week", "month"] as Period[]).map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.periodBtn, effectivePeriod === p && styles.periodBtnActive]}
                  onPress={() => (p === "month" && !hasPremium ? router.push("/(tabs)/coach") : setPeriod(p))}
                  accessibilityRole="button"
                  accessibilityLabel={
                    p === "month" && !hasPremium
                      ? "Last 30 days, part of Premium. Opens Premium."
                      : p === "week" ? "Last 7 days" : "Last 30 days"
                  }
                  accessibilityState={{ selected: effectivePeriod === p }}
                  testID={`insights-period-${p}`}
                >
                  <Text style={[styles.periodText, effectivePeriod === p && styles.periodTextActive]}>
                    {p === "week" ? "7 days" : "30 days"}
                  </Text>
                  {p === "month" && !hasPremium ? (
                    <Ionicons name="lock-closed" size={10} color={T.textFaint} style={{ marginLeft: 4 }} />
                  ) : null}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Key to the 3D model above. Without it the colours are unreadable —
              the model is the first thing on this screen, so the key comes first. */}
          <View style={styles.card} testID="recovery-legend">
            <Text style={styles.cardTitle}>Recovery map</Text>
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
            <Text style={styles.cardNote}>{RECOVERY_NOTE}</Text>
          </View>

          {/* What was trained in the period, and the period's headline totals. */}
          <View style={styles.card} testID="insights-activation">
            <Text style={styles.cardHeading}>
              {trained.length} muscle group{trained.length === 1 ? "" : "s"} trained
            </Text>

            {trained.length === 0 ? (
              <Text style={styles.cardNote}>
                No completed working sets in the last {days} days.
              </Text>
            ) : (
              <View style={{ gap: 8, marginTop: 12 }}>
                {trained.map((g) => (
                  <View
                    key={g.group}
                    style={styles.barRow}
                    accessible
                    accessibilityLabel={`${g.label}, ${g.sets} set${g.sets === 1 ? "" : "s"}`}
                  >
                    <Text style={styles.barLabel} numberOfLines={1}>
                      {g.label}
                    </Text>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { width: `${(g.sets / maxSets) * 100}%` }]} />
                    </View>
                    <Text style={styles.barVal}>
                      {g.sets} set{g.sets === 1 ? "" : "s"}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {activation.neglected.length > 0 && (
              <Text style={styles.cardNote}>
                Not trained {effectivePeriod === "week" ? "this week" : "in the last 30 days"}:{" "}
                {activation.neglected.join(", ")}
              </Text>
            )}

            {FLAGS.insightsV2 && (
              <>
                <View style={styles.divider} />
                <View style={styles.statRow} testID="insights-streak">
                  <Stat styles={styles} value={`${stats.workouts}`} label="Workouts" />
                  <View style={styles.statDivider} />
                  <Stat styles={styles} value={fmtVol(stats.volume)} unit={unit} label="Volume" />
                  <View style={styles.statDivider} />
                  <Stat
                    styles={styles}
                    value={`${streaks.currentWeeks}`}
                    unit={streaks.currentWeeks === 1 ? "week" : "weeks"}
                    label="Streak"
                  />
                </View>
                <Text style={styles.cardNote}>{CONSISTENCY_NOTE}</Text>
              </>
            )}
          </View>

          {/* Personal records — the only place violet is allowed to compete. */}
          {FLAGS.insightsV2 && records.length > 0 && (
            <View style={styles.card} testID="insights-records">
              <View style={styles.cardHead}>
                <Text style={[styles.cardHeading, { flex: 1 }]}>Personal records</Text>
                {records.length > PR_PREVIEW && (
                  <A11yControl
                    label={allRecords ? "Show fewer personal records" : `See all ${records.length} personal records`}
                    onPress={() => setAllRecords((v) => !v)}
                    style={styles.linkBtn}
                    testID="insights-records-toggle"
                  >
                    <Text style={styles.linkText}>{allRecords ? "Show less" : "See all"}</Text>
                    <Ionicons name={allRecords ? "chevron-up" : "chevron-forward"} size={14} color={T.accent} />
                  </A11yControl>
                )}
              </View>
              <View style={{ marginTop: 4 }}>
                {shownRecords.map((r, i) => (
                  <View
                    key={r.exerciseId}
                    style={[styles.prRow, i > 0 && styles.prRowDivided]}
                    accessible
                    accessibilityLabel={`${r.name}, best ${r.maxWeight > 0 ? `${r.maxWeight} ${unit}` : "no load recorded"}`}
                    testID={`pr-${r.exerciseId}`}
                  >
                    <View style={styles.prBadge}>
                      <Ionicons name="trophy" size={14} color={T.pr} />
                    </View>
                    <Text style={styles.prName} numberOfLines={1}>
                      {r.name}
                    </Text>
                    <Text style={styles.prWeight}>{r.maxWeight > 0 ? `${r.maxWeight} ${unit}` : "—"}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Volume trend — rolling 7-day periods, with an equivalent table. */}
          <View style={styles.card} testID="insights-volume">
            <View style={styles.cardHead}>
              <Text style={[styles.cardHeading, { flex: 1 }]}>
                {effectivePeriod === "week" ? "7-day volume" : "30-day volume"}
              </Text>
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

            <View style={styles.totalRow}>
              <Text style={styles.total}>{fmtVol(stats.volume)}</Text>
              <Text style={styles.totalUnit}>{unit}</Text>
            </View>

            <Text style={styles.hint} testID="insights-chart-summary">
              {`${VOLUME_CHART_TITLE}. The last ${series.length} periods in ${unit}, ${series[0].rangeLabel} through ${series[series.length - 1].rangeLabel}.`}
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
                    <Text style={styles.chartVal}>{point.volume > 0 ? fmtVol(point.volume) : ""}</Text>
                    <View style={styles.chartBarTrack}>
                      <View style={[styles.chartBar, { height: `${(point.volume / maxVol) * 100}%` }]} />
                    </View>
                    <Text style={styles.chartLabel} numberOfLines={2}>
                      {series.length > 8 && (series.length - 1 - i) % 2 !== 0
                        ? ""
                        : point.rangeLabel.split(" – ")[1]}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>

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

function Stat({
  styles,
  value,
  unit,
  label,
}: {
  styles: ReturnType<typeof makeStyles>;
  value: string;
  unit?: string;
  label: string;
}) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${value}${unit ? ` ${unit}` : ""} ${label}`}>
      <View style={styles.statValueRow}>
        <Text style={styles.statValue}>{value}</Text>
        {unit ? <Text style={styles.statUnit}>{unit}</Text> : null}
      </View>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const makeStyles = (T: LegacyPalette) => StyleSheet.create({
  // A flex child, not an absolute fill: Insights is now its own screen and
  // must sit UNDER that screen's header rather than painting over its back
  // button.
  full: { flex: 1, backgroundColor: T.bg },
  empty: { alignItems: "center", justifyContent: "center", gap: 10, padding: 30 },
  emptyText: { color: T.text, fontSize: 17, fontWeight: "700" },
  emptySub: { color: T.textDim, fontSize: 14, textAlign: "center", lineHeight: 20 },

  panelHead: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 2 },
  panelTitle: { flex: 1, color: T.text, fontSize: 20, fontWeight: "800" },
  periodSeg: { flexDirection: "row", backgroundColor: T.bg2, borderRadius: 22, padding: 4, gap: 4 },
  // Selection is an outline in the accent; the fill never changes. The
  // transparent border at rest keeps the geometry identical in both states.
  periodBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 22,
    borderWidth: 1.5, borderColor: "transparent",
  },
  periodBtnActive: { borderColor: T.accent },
  periodText: { color: T.textDim, fontSize: 13, fontWeight: "700" },
  periodTextActive: { color: T.accent },

  card: { backgroundColor: T.bg2, borderRadius: 22, padding: 16 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  cardTitle: { color: T.text, fontSize: 15, fontWeight: "800", marginBottom: 12 },
  cardHeading: { color: T.text, fontSize: 16, fontWeight: "800" },
  cardNote: { color: T.textFaint, fontSize: 11, lineHeight: 16, marginTop: 12 },
  divider: { height: 1, backgroundColor: T.border, marginVertical: 14 },

  legendGrid: { flexDirection: "row", flexWrap: "wrap", rowGap: 12, columnGap: 12 },
  legendItem: { flexDirection: "row", alignItems: "flex-start", gap: 9, width: "46%", flexGrow: 1 },
  legendDot: { width: 14, height: 14, borderRadius: 7, marginTop: 1 },
  legendLabel: { color: T.text, fontSize: 13.5, fontWeight: "700" },
  legendHelp: { color: T.textFaint, fontSize: 11.5, marginTop: 1 },

  barRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  barLabel: { color: T.text, fontSize: 13, fontWeight: "600", width: 78 },
  barTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: T.surfaceHi, overflow: "hidden" },
  barFill: { height: 8, borderRadius: 4, backgroundColor: T.accent },
  barVal: { color: T.text, fontSize: 13, fontWeight: "700", width: 54, textAlign: "right" },

  statRow: { flexDirection: "row", alignItems: "center" },
  stat: { flex: 1, alignItems: "center" },
  statValueRow: { flexDirection: "row", alignItems: "baseline", gap: 3 },
  statValue: { color: T.accent, fontSize: 22, fontWeight: "800" },
  statUnit: { color: T.accent, fontSize: 12, fontWeight: "700" },
  statLabel: { color: T.textFaint, fontSize: 11.5, marginTop: 3 },
  statDivider: { width: 1, height: 34, backgroundColor: T.border },

  linkBtn: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44, paddingHorizontal: 6 },
  linkText: { color: T.accent, fontSize: 13, fontWeight: "700" },
  prRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11 },
  prRowDivided: { borderTopWidth: 1, borderTopColor: T.border },
  prBadge: { width: 32, height: 32, borderRadius: 16, backgroundColor: T.surfaceHi, alignItems: "center", justifyContent: "center" },
  prName: { color: T.text, fontSize: 14, fontWeight: "700", flex: 1 },
  prWeight: { color: T.accent, fontSize: 15, fontWeight: "800" },

  totalRow: { flexDirection: "row", alignItems: "baseline", gap: 5, marginTop: 10 },
  total: { color: T.accent, fontSize: 28, fontWeight: "800" },
  totalUnit: { color: T.accent, fontSize: 15, fontWeight: "700" },
  tableToggle: {
    flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 12,
    borderRadius: 999, backgroundColor: T.surface,
  },
  tableToggleText: { color: T.text, fontSize: 12.5, fontWeight: "700" },
  table: { borderRadius: 22, overflow: "hidden", marginTop: 6 },
  tableRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: T.border },
  tableRange: { color: T.textDim, fontSize: 12, fontWeight: "700" },
  tableValue: { color: T.text, fontSize: 14, fontWeight: "700", marginTop: 2 },

  chart: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", height: 168, gap: 6, paddingTop: 8 },
  chartCol: { flex: 1, alignItems: "center", height: "100%" },
  chartVal: { color: T.textDim, fontSize: 10, fontWeight: "700", marginBottom: 4 },
  chartBarTrack: { flex: 1, width: "68%", justifyContent: "flex-end" },
  chartBar: { width: "100%", backgroundColor: T.accent, borderRadius: 6, minHeight: 3 },
  chartLabel: { color: T.textFaint, fontSize: 10.5, marginTop: 6, textAlign: "center" },
  hint: { color: T.textFaint, fontSize: 11, lineHeight: 16, marginTop: 8 },

  srcRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 22,
    backgroundColor: T.bg2,
  },
  srcText: { flex: 1, color: T.textFaint, fontSize: 11, lineHeight: 15 },
  srcCta: { color: T.accent, fontSize: 11, fontWeight: "800" },
});
