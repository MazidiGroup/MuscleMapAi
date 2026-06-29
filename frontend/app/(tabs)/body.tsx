import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Modal,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useFocusEffect } from "expo-router";
import Svg, { Polyline, Line, Circle as SvgCircle, Defs, LinearGradient as SvgGradient, Stop } from "react-native-svg";

import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { apiGet, apiPost } from "@/src/api";
import { BodyDiagram, MuscleMap, MuscleStatus } from "@/src/components/BodyDiagram";
import { Body3D } from "@/src/components/Body3D";

type Group = {
  id: string;
  name: string;
  sets_done: number;
  ideal_sets: number;
  activation_pct: number;
  status: MuscleStatus;
};

const STATUS_COLOR: Record<MuscleStatus, string> = {
  green: "#34D399",
  yellow: "#F59E0B",
  red: "#EF4444",
  none: "#52525B",
};

export default function BodyScreen() {
  const router = useRouter();
  const [view, setView] = useState<"front" | "back" | "side">("front");
  const [intel, setIntel] = useState<any>(null);
  const [trend, setTrend] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null);
  const [muscleDetail, setMuscleDetail] = useState<any>(null);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    try {
      const [i, t] = await Promise.all([apiGet("/body/intelligence"), apiGet("/body/trend")]);
      setIntel(i);
      setTrend(t);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openMuscleDetail = async (groupId: string) => {
    setSelectedMuscle(groupId);
    setMuscleDetail(null);
    try {
      const d = await apiGet(`/body/muscle/${groupId}`);
      setMuscleDetail(d);
    } catch {
      // ignore
    }
  };

  const generateFocusWorkout = async () => {
    setGenerating(true);
    try {
      const w = await apiPost<any>("/body/generate-focus-workout", {});
      router.push(`/workout/${w.workout_id}`);
    } catch {
      // ignore
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return <View style={styles.loader}><ActivityIndicator color={COLORS.primary} /></View>;
  }

  const muscleMap: MuscleMap = {};
  intel?.muscle_groups?.forEach((g: Group) => {
    muscleMap[g.id as keyof MuscleMap] = g.status;
  });

  const lastImpactMap: MuscleMap = {};
  intel?.last_impact?.primary?.forEach((g: string) => {
    lastImpactMap[g as keyof MuscleMap] = "green";
  });
  intel?.last_impact?.secondary?.forEach((g: string) => {
    if (!lastImpactMap[g as keyof MuscleMap]) {
      lastImpactMap[g as keyof MuscleMap] = "yellow";
    }
  });

  return (
    <SafeAreaView style={styles.root} edges={["top"]} testID="body-screen">
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={COLORS.primary} />}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Body Intelligence</Text>
          <Text style={styles.sub}>Your muscle map. AI-tracked.</Text>
        </View>

        {/* Legend */}
        <View style={styles.legendRow} testID="body-legend">
          <LegendItem color={STATUS_COLOR.green} label="Well trained" />
          <LegendItem color={STATUS_COLOR.yellow} label="Underused" />
          <LegendItem color={STATUS_COLOR.red} label="Very underused" />
        </View>

        {/* 3D Body model with view toggles */}
        <View style={styles.bodyCard}>
          <LinearGradient
            colors={["rgba(10,132,255,0.06)", "transparent"]}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.bodyRow}>
            <View style={styles.bodyView} testID="body-diagram">
              <Body3D muscles={muscleMap} size={220} viewSnap={view} />
            </View>
            <View style={styles.viewToggle} testID="body-view-toggle">
              {(["front", "back", "side"] as const).map((v) => (
                <Pressable
                  key={v}
                  testID={`view-${v}`}
                  onPress={() => setView(v)}
                  style={[styles.toggleBtn, view === v && styles.toggleBtnActive]}
                >
                  <Text style={[styles.toggleText, view === v && styles.toggleTextActive]}>
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <Text style={styles.dragHint} testID="drag-hint">↻ Drag to rotate · pinch to zoom</Text>

          {/* Overall balance */}
          <View style={styles.balanceWrap} testID="overall-balance">
            <View style={styles.balanceHeader}>
              <Text style={styles.balanceLabel}>Overall Muscle Balance</Text>
              <Text style={styles.balancePct}>{intel?.balance_pct || 0}%</Text>
            </View>
            <View style={styles.balanceBar}>
              <View style={[styles.balanceFill, { width: `${intel?.balance_pct || 0}%` }]} />
            </View>
            <Text style={styles.balanceSub}>{intel?.balance_label}</Text>
          </View>
        </View>

        {/* Muscle Group Status Panel */}
        <Text style={styles.sectionTitle}>Muscle groups</Text>
        <View style={styles.panel} testID="muscle-groups-panel">
          {(intel?.muscle_groups || []).map((g: Group) => (
            <Pressable
              key={g.id}
              testID={`group-row-${g.id}`}
              onPress={() => openMuscleDetail(g.id)}
              style={({ pressed }) => [styles.groupRow, pressed && { opacity: 0.7 }]}
            >
              <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[g.status] }]} />
              <Text style={styles.groupName}>{g.name}</Text>
              <View style={styles.groupBarTrack}>
                <View style={[styles.groupBarFill, {
                  width: `${g.activation_pct}%`,
                  backgroundColor: STATUS_COLOR[g.status],
                }]} />
              </View>
              <Text style={styles.groupPct}>{g.activation_pct}%</Text>
            </Pressable>
          ))}
          <View style={styles.tipBox}>
            <Ionicons name="bulb-outline" size={14} color={COLORS.primary} />
            <Text style={styles.tipText}>Focus on your underused muscle groups</Text>
          </View>
        </View>

        {/* Muscle Balance Over Time Chart */}
        <Text style={styles.sectionTitle}>Muscle balance over time</Text>
        <View style={styles.chartCard} testID="balance-chart">
          <BalanceChart weeks={trend?.weeks || []} />
          <View style={styles.chartStats}>
            <View style={styles.chartStat}>
              <Text style={styles.chartStatValue}>
                {(trend?.improvement || 0) >= 0 ? "+" : ""}{trend?.improvement || 0}%
              </Text>
              <Text style={styles.chartStatLabel}>Improvement</Text>
            </View>
            <View style={styles.chartStat}>
              <Text style={styles.chartStatValue}>{trend?.streak || 0}</Text>
              <Text style={styles.chartStatLabel}>Week streak</Text>
            </View>
            <View style={styles.chartStat}>
              <Text style={[styles.chartStatValue, { color: COLORS.primary }]}>{trend?.rating || "—"}</Text>
              <Text style={styles.chartStatLabel}>Progress</Text>
            </View>
          </View>
        </View>

        {/* Workout Impact */}
        {intel?.last_impact?.workout_name && (
          <>
            <Text style={styles.sectionTitle}>Last workout impact</Text>
            <View style={styles.impactCard} testID="workout-impact">
              <View style={styles.impactThumbs}>
                <View style={styles.impactThumb}>
                  <Text style={styles.impactLabel}>FRONT</Text>
                  <BodyDiagram view="front" muscles={lastImpactMap} size={80} />
                </View>
                <View style={styles.impactThumb}>
                  <Text style={styles.impactLabel}>BACK</Text>
                  <BodyDiagram view="back" muscles={lastImpactMap} size={80} />
                </View>
                <View style={styles.impactInfo}>
                  <Text style={styles.impactName}>{intel.last_impact.workout_name}</Text>
                  <View style={styles.impactLegendRow}>
                    <LegendItem color={STATUS_COLOR.green} label="Primary" small />
                    <LegendItem color={STATUS_COLOR.yellow} label="Secondary" small />
                  </View>
                </View>
              </View>
            </View>
          </>
        )}

        {/* Muscle Focus Recommendation */}
        {intel?.lagging?.length > 0 && (
          <View style={styles.focusCard} testID="focus-recommendation">
            <View style={styles.focusHeader}>
              <View style={styles.focusBadge}>
                <Ionicons name="sparkles" size={14} color={COLORS.primary} />
                <Text style={styles.focusBadgeText}>APEX RECOMMENDATION</Text>
              </View>
            </View>
            <Text style={styles.focusTitle}>You have {intel.lagging.length} lagging muscle {intel.lagging.length === 1 ? "group" : "groups"}.</Text>
            <Text style={styles.focusSub}>Hit these this week to restore balance:</Text>
            <View style={styles.laggingList}>
              {intel.lagging.map((g: Group) => (
                <View key={g.id} style={styles.laggingChip} testID={`lagging-${g.id}`}>
                  <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[g.status] }]} />
                  <Text style={styles.laggingName}>{g.name}</Text>
                  <Text style={[styles.laggingTag, { color: STATUS_COLOR[g.status] }]}>
                    {g.status === "red" ? "VERY LOW" : "LOW"}
                  </Text>
                </View>
              ))}
            </View>
            <Pressable
              testID="generate-focus-workout-btn"
              onPress={generateFocusWorkout}
              disabled={generating}
              style={({ pressed }) => [styles.generateBtn, pressed && { opacity: 0.85 }]}
            >
              {generating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="flash" size={16} color="#fff" />
                  <Text style={styles.generateBtnText}>Generate focus workout</Text>
                </>
              )}
            </Pressable>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Muscle Detail Modal */}
      <Modal
        visible={!!selectedMuscle}
        transparent
        animationType="slide"
        onRequestClose={() => { setSelectedMuscle(null); setMuscleDetail(null); }}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => { setSelectedMuscle(null); setMuscleDetail(null); }}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()} testID="muscle-detail-modal">
            <View style={styles.modalHandle} />
            {!muscleDetail ? (
              <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 40 }} />
            ) : (
              <>
                <Text style={styles.modalTitle}>{muscleDetail.name}</Text>
                <View style={styles.modalDiagrams}>
                  <View style={{ alignItems: "center" }}>
                    <Text style={styles.impactLabel}>FRONT</Text>
                    <BodyDiagram view="front" muscles={{ [muscleDetail.id]: muscleDetail.status } as MuscleMap} size={90} />
                  </View>
                  <View style={{ alignItems: "center" }}>
                    <Text style={styles.impactLabel}>BACK</Text>
                    <BodyDiagram view="back" muscles={{ [muscleDetail.id]: muscleDetail.status } as MuscleMap} size={90} />
                  </View>
                </View>

                <View style={styles.modalStats}>
                  <View style={styles.modalStatRow}>
                    <Text style={styles.modalStatLabel}>Activation this week</Text>
                    <Text style={[styles.modalStatValue, { color: STATUS_COLOR[muscleDetail.status as MuscleStatus] }]}>
                      {muscleDetail.activation_pct}%
                    </Text>
                  </View>
                  <View style={styles.modalBar}>
                    <View style={[styles.modalBarFill, {
                      width: `${muscleDetail.activation_pct}%`,
                      backgroundColor: STATUS_COLOR[muscleDetail.status as MuscleStatus],
                    }]} />
                  </View>
                  <View style={styles.modalStatRow}>
                    <Text style={styles.modalStatLabel}>Ideal range</Text>
                    <Text style={styles.modalStatValue}>{muscleDetail.ideal_range}</Text>
                  </View>
                </View>

                <View style={styles.coachTip}>
                  <View style={styles.coachTipHeader}>
                    <View style={styles.aiDot} />
                    <Text style={styles.coachTipLabel}>APEX COACH</Text>
                  </View>
                  <Text style={styles.coachTipText}>{muscleDetail.tip}</Text>
                </View>

                {muscleDetail.suggested_exercises?.length > 0 && (
                  <>
                    <Text style={styles.exSugTitle}>Try these exercises</Text>
                    {muscleDetail.suggested_exercises.map((e: any, i: number) => (
                      <Pressable
                        key={e.id}
                        testID={`suggested-ex-${i}`}
                        onPress={() => {
                          setSelectedMuscle(null);
                          setMuscleDetail(null);
                          router.push(`/exercise/${e.id}`);
                        }}
                        style={styles.exSugRow}
                      >
                        <Ionicons name="barbell-outline" size={16} color={COLORS.text} />
                        <Text style={styles.exSugName}>{e.name}</Text>
                        <Ionicons name="chevron-forward" size={16} color={COLORS.textTertiary} />
                      </Pressable>
                    ))}
                  </>
                )}
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function LegendItem({ color, label, small }: { color: string; label: string; small?: boolean }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={[styles.legendLabel, small && { fontSize: 10 }]}>{label}</Text>
    </View>
  );
}

function BalanceChart({ weeks }: { weeks: { label: string; balance_pct: number }[] }) {
  const W = 320;
  const H = 120;
  const padding = 12;
  if (!weeks.length) return null;
  const points = weeks.map((w, i) => {
    const x = padding + (i / Math.max(1, weeks.length - 1)) * (W - padding * 2);
    const y = H - padding - ((w.balance_pct / 100) * (H - padding * 2));
    return `${x},${y}`;
  }).join(" ");
  return (
    <View>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        <Defs>
          <SvgGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#0A84FF" stopOpacity="0.5" />
            <Stop offset="1" stopColor="#0A84FF" stopOpacity="1" />
          </SvgGradient>
        </Defs>
        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map((y) => {
          const yPos = H - padding - ((y / 100) * (H - padding * 2));
          return <Line key={y} x1={padding} y1={yPos} x2={W - padding} y2={yPos} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />;
        })}
        {/* Line */}
        <Polyline points={points} fill="none" stroke="url(#lineGrad)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {/* Dots */}
        {weeks.map((w, i) => {
          const x = padding + (i / Math.max(1, weeks.length - 1)) * (W - padding * 2);
          const y = H - padding - ((w.balance_pct / 100) * (H - padding * 2));
          return <SvgCircle key={i} cx={x} cy={y} r="3" fill="#0A84FF" />;
        })}
      </Svg>
      <View style={styles.chartLabels}>
        {weeks.map((w, i) => (
          <Text key={i} style={styles.chartLabel}>{w.label}</Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  loader: { flex: 1, backgroundColor: COLORS.bg, alignItems: "center", justifyContent: "center" },
  scroll: { padding: SPACING["2xl"], paddingBottom: 80 },
  header: { marginBottom: SPACING.lg },
  title: { color: COLORS.text, fontSize: 32, fontWeight: "700", letterSpacing: -0.5 },
  sub: { color: COLORS.textSecondary, fontSize: 14, marginTop: 4 },
  legendRow: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginBottom: SPACING.md },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { color: COLORS.textSecondary, fontSize: 11, fontWeight: "500" },
  bodyCard: { padding: SPACING.lg, borderRadius: RADIUS.xl, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, overflow: "hidden" },
  bodyRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  bodyView: { flex: 1, alignItems: "center" },
  dragHint: { color: COLORS.textTertiary, fontSize: 11, textAlign: "center", marginTop: 6, fontWeight: "500", letterSpacing: 0.5 },
  viewToggle: { gap: 8, marginLeft: 8 },
  toggleBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surfaceElevated, minWidth: 64, alignItems: "center" },
  toggleBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  toggleText: { color: COLORS.textSecondary, fontSize: 12, fontWeight: "600" },
  toggleTextActive: { color: "#fff" },
  balanceWrap: { marginTop: SPACING.md, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border },
  balanceHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  balanceLabel: { color: COLORS.text, fontSize: 13, fontWeight: "600" },
  balancePct: { color: COLORS.primary, fontSize: 18, fontWeight: "700" },
  balanceBar: { height: 6, backgroundColor: COLORS.surfaceElevated, borderRadius: 999, overflow: "hidden" },
  balanceFill: { height: 6, backgroundColor: COLORS.primary, borderRadius: 999 },
  balanceSub: { color: COLORS.textSecondary, fontSize: 12, marginTop: 6 },
  sectionTitle: { color: COLORS.text, fontSize: 18, fontWeight: "600", marginTop: SPACING.xl, marginBottom: 10 },
  panel: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.xl, padding: 14, gap: 4 },
  groupRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  groupName: { color: COLORS.text, fontSize: 13, width: 86, fontWeight: "500" },
  groupBarTrack: { flex: 1, height: 6, backgroundColor: COLORS.surfaceElevated, borderRadius: 999, overflow: "hidden" },
  groupBarFill: { height: 6, borderRadius: 999 },
  groupPct: { color: COLORS.text, fontSize: 12, fontWeight: "600", width: 36, textAlign: "right" },
  tipBox: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border },
  tipText: { color: COLORS.textSecondary, fontSize: 12, fontStyle: "italic" },
  chartCard: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.xl, padding: 14 },
  chartLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: 6, paddingHorizontal: 8 },
  chartLabel: { color: COLORS.textTertiary, fontSize: 10 },
  chartStats: { flexDirection: "row", justifyContent: "space-around", marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border },
  chartStat: { alignItems: "center" },
  chartStatValue: { color: COLORS.text, fontSize: 18, fontWeight: "700" },
  chartStatLabel: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2 },
  impactCard: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.xl, padding: 14 },
  impactThumbs: { flexDirection: "row", alignItems: "center", gap: 14 },
  impactThumb: { alignItems: "center" },
  impactLabel: { color: COLORS.textTertiary, fontSize: 9, fontWeight: "700", letterSpacing: 1.5, marginBottom: 4 },
  impactInfo: { flex: 1, marginLeft: 6 },
  impactName: { color: COLORS.text, fontSize: 16, fontWeight: "600" },
  impactLegendRow: { flexDirection: "row", gap: 12, marginTop: 6 },
  focusCard: { marginTop: SPACING.xl, padding: 18, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.primary, backgroundColor: "rgba(10,132,255,0.06)" },
  focusHeader: { marginBottom: 8 },
  focusBadge: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: "rgba(10,132,255,0.15)" },
  focusBadgeText: { color: COLORS.primary, fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  focusTitle: { color: COLORS.text, fontSize: 17, fontWeight: "700", lineHeight: 23 },
  focusSub: { color: COLORS.textSecondary, fontSize: 13, marginTop: 4 },
  laggingList: { marginTop: 12, gap: 6 },
  laggingChip: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: RADIUS.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  laggingName: { flex: 1, color: COLORS.text, fontSize: 14, fontWeight: "500" },
  laggingTag: { fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  generateBtn: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", marginTop: 14, backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: RADIUS.full },
  generateBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: "#13131A", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: SPACING["2xl"], paddingBottom: SPACING["3xl"], borderTopWidth: 1, borderColor: COLORS.border, maxHeight: "85%" },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#3A3A40", alignSelf: "center", marginBottom: 16 },
  modalTitle: { color: COLORS.text, fontSize: 22, fontWeight: "700" },
  modalDiagrams: { flexDirection: "row", justifyContent: "center", gap: 16, marginVertical: 12 },
  modalStats: { backgroundColor: COLORS.surfaceElevated, borderRadius: RADIUS.lg, padding: 14, gap: 8 },
  modalStatRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  modalStatLabel: { color: COLORS.textSecondary, fontSize: 13 },
  modalStatValue: { color: COLORS.text, fontSize: 14, fontWeight: "600" },
  modalBar: { height: 6, backgroundColor: COLORS.surface, borderRadius: 999, overflow: "hidden" },
  modalBarFill: { height: 6, borderRadius: 999 },
  coachTip: { marginTop: 12, padding: 14, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.primary, backgroundColor: "rgba(10,132,255,0.06)" },
  coachTipHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  aiDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.primary },
  coachTipLabel: { color: COLORS.primary, fontSize: 10, fontWeight: "700", letterSpacing: 1.5 },
  coachTipText: { color: COLORS.text, fontSize: 13, lineHeight: 20 },
  exSugTitle: { color: COLORS.text, fontSize: 14, fontWeight: "600", marginTop: 16, marginBottom: 8 },
  exSugRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: RADIUS.md, backgroundColor: COLORS.surfaceElevated, marginBottom: 6 },
  exSugName: { flex: 1, color: COLORS.text, fontSize: 14 },
});
