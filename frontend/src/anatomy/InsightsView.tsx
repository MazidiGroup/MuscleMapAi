import React, { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { AnatomyViewer } from "./AnatomyViewer";
import { useWorkout, computeRecovery, weeklySetsByGroup, weeklyVolumeSeries } from "./workoutStore";
import { T } from "./ui";

const STATE_COLOR = { red: "#FF4438", orange: "#FFB020", green: "#2FBF71" } as const;
const STATE_LABEL = { red: "Recently trained", orange: "Recovering", green: "Recovered" } as const;

export function InsightsView() {
  const insets = useSafeAreaInsets();
  const { history } = useWorkout();

  const recovery = useMemo(() => computeRecovery(history), [history]);
  const weekly = useMemo(() => weeklySetsByGroup(history), [history]);
  const series = useMemo(() => weeklyVolumeSeries(history, 6), [history]);
  const maxVol = Math.max(1, ...series.map((s) => s.volume));
  const maxSets = Math.max(1, ...weekly.list.map((g) => g.sets));

  if (history.length === 0) {
    return (
      <View style={[styles.full, styles.empty, { paddingTop: insets.top + 56 }]}>
        <Ionicons name="pulse-outline" size={40} color={T.textFaint} />
        <Text style={styles.emptyText}>No insights yet</Text>
        <Text style={styles.emptySub}>Finish a few workouts to unlock your recovery heatmap, weekly activation and progression charts.</Text>
      </View>
    );
  }

  return (
    <View style={styles.full}>
      <View style={{ height: "36%" }}>
        <AnatomyViewer mode="recovery" recovery={recovery.colorMap} />
      </View>

      <View style={styles.panel}>
        <View style={styles.handle} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}>
          {/* recovery legend */}
          <View style={styles.legendRow}>
            {(["red", "orange", "green"] as const).map((s) => (
              <View key={s} style={styles.legendItem}>
                <View style={[styles.dot, { backgroundColor: STATE_COLOR[s] }]} />
                <Text style={styles.legendText}>{STATE_LABEL[s]}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.section}>Muscle Recovery</Text>
          {recovery.groups.map((g) => (
            <View key={g.group} style={styles.recRow} testID={`rec-${g.group}`}>
              <View style={[styles.recDot, { backgroundColor: STATE_COLOR[g.state] }]} />
              <Text style={styles.recName}>{g.label}</Text>
              <Text style={[styles.recStatus, { color: STATE_COLOR[g.state] }]}>
                {g.state === "green" ? (g.lastTs ? "Ready" : "Fresh") : `~${g.hoursLeft}h left`}
              </Text>
            </View>
          ))}

          {/* weekly activation */}
          <Text style={styles.section}>This Week</Text>
          <View style={styles.weekStats}>
            <View style={styles.wStat}>
              <Text style={styles.wValue}>{weekly.workouts}</Text>
              <Text style={styles.wLabel}>Workouts</Text>
            </View>
            <View style={styles.wStat}>
              <Text style={styles.wValue}>{weekly.totalSets}</Text>
              <Text style={styles.wLabel}>Sets</Text>
            </View>
            <View style={styles.wStat}>
              <Text style={styles.wValue}>{weekly.list.filter((g) => g.sets > 0).length}</Text>
              <Text style={styles.wLabel}>Groups hit</Text>
            </View>
          </View>
          {weekly.list
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
          {weekly.neglected.length > 0 && (
            <View style={styles.neglect}>
              <Ionicons name="alert-circle-outline" size={16} color={T.secondary} />
              <Text style={styles.neglectText}>Neglected this week: {weekly.neglected.join(", ")}</Text>
            </View>
          )}

          {/* progression chart */}
          <Text style={styles.section}>Weekly Volume</Text>
          <View style={styles.chart}>
            {series.map((s, i) => (
              <View key={i} style={styles.chartCol}>
                <Text style={styles.chartVal}>{s.volume > 0 ? Math.round(s.volume / 1000 * 10) / 10 + "k" : ""}</Text>
                <View style={styles.chartBarTrack}>
                  <View style={[styles.chartBar, { height: `${(s.volume / maxVol) * 100}%` }]} />
                </View>
                <Text style={styles.chartLabel}>{s.label}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.hint}>Total volume lifted (kg) per week over the last 6 weeks.</Text>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  full: { ...StyleSheet.absoluteFillObject, backgroundColor: T.bg },
  empty: { alignItems: "center", justifyContent: "center", gap: 10, padding: 30 },
  emptyText: { color: T.text, fontSize: 17, fontWeight: "700" },
  emptySub: { color: T.textDim, fontSize: 14, textAlign: "center", lineHeight: 20 },
  panel: { flex: 1, backgroundColor: T.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: T.border, marginTop: -24, paddingHorizontal: 18, paddingTop: 10 },
  handle: { alignSelf: "center", width: 42, height: 5, borderRadius: 3, backgroundColor: "rgba(120,160,220,0.25)", marginBottom: 12 },
  legendRow: { flexDirection: "row", justifyContent: "space-around", backgroundColor: T.bg2, borderRadius: 12, paddingVertical: 10, borderWidth: 1, borderColor: T.border },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: T.textDim, fontSize: 12, fontWeight: "600" },
  section: { color: T.textDim, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 20, marginBottom: 10 },
  recRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: T.bg2, borderWidth: 1, borderColor: T.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 7 },
  recDot: { width: 12, height: 12, borderRadius: 6 },
  recName: { color: T.text, fontSize: 15, fontWeight: "600", flex: 1 },
  recStatus: { fontSize: 13, fontWeight: "700" },
  weekStats: { flexDirection: "row", gap: 8, marginBottom: 14 },
  wStat: { flex: 1, backgroundColor: T.bg2, borderRadius: 12, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: T.border },
  wValue: { color: T.accent, fontSize: 20, fontWeight: "800" },
  wLabel: { color: T.textFaint, fontSize: 11, marginTop: 2 },
  barRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  barLabel: { color: T.text, fontSize: 13, fontWeight: "600", width: 88 },
  barTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: T.surfaceHi, overflow: "hidden" },
  barFill: { height: 10, borderRadius: 5, backgroundColor: T.accent },
  barVal: { color: T.textDim, fontSize: 13, fontWeight: "700", width: 28, textAlign: "right" },
  neglect: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, backgroundColor: "rgba(255,176,32,0.1)", borderRadius: 10, padding: 12 },
  neglectText: { color: T.text, fontSize: 13, flex: 1 },
  chart: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", height: 150, gap: 8, paddingTop: 8 },
  chartCol: { flex: 1, alignItems: "center", height: "100%" },
  chartVal: { color: T.textDim, fontSize: 10, fontWeight: "700", marginBottom: 4 },
  chartBarTrack: { flex: 1, width: "70%", justifyContent: "flex-end" },
  chartBar: { width: "100%", backgroundColor: T.accent, borderRadius: 6, minHeight: 3 },
  chartLabel: { color: T.textFaint, fontSize: 11, marginTop: 6 },
  hint: { color: T.textFaint, fontSize: 12, marginTop: 8 },
});
