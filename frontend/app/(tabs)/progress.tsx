import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";

import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { apiGet } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { WeeklyPlanner } from "@/src/components/WeeklyPlanner";
import { PremiumLock } from "@/src/components/PremiumLock";

export default function Progress() {
  const { user } = useAuth();
  const [data, setData] = useState<any>({});
  const [week, setWeek] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, w] = await Promise.all([apiGet("/progress/summary"), apiGet("/plan/week")]);
      setData(p);
      setWeek(w.week || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (loading) {
    return <View style={styles.loader}><ActivityIndicator color={COLORS.primary} /></View>;
  }

  const trends = data.trends || {};
  const topTrends = Object.entries(trends).slice(0, 4) as any[];

  return (
    <SafeAreaView style={styles.root} edges={["top"]} testID="progress-screen">
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Progress</Text>
        <Text style={styles.sub}>Your strength journey, visualised.</Text>

        {week.length > 0 && (
          <View style={styles.weekBlock} testID="progress-weekly-planner">
            <Text style={styles.sectionTitle}>This week</Text>
            <WeeklyPlanner week={week} variant="expanded" />
          </View>
        )}

        <View style={styles.statsGrid}>
          <View style={styles.statCard} testID="progress-stat-total">
            <Text style={styles.statValue}>{data.total_workouts || 0}</Text>
            <Text style={styles.statLabel}>Total workouts</Text>
          </View>
          <View style={styles.statCard} testID="progress-stat-week">
            <Text style={styles.statValue}>{data.week_count || 0}</Text>
            <Text style={styles.statLabel}>This week</Text>
          </View>
          <View style={styles.statCard} testID="progress-stat-streak">
            <Text style={[styles.statValue, { color: "#F59E0B" }]}>{data.streak || 0}</Text>
            <Text style={styles.statLabel}>Day streak</Text>
          </View>
          <View style={styles.statCard} testID="progress-stat-prs">
            <Text style={styles.statValue}>{(data.prs || []).length}</Text>
            <Text style={styles.statLabel}>Personal records</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Personal Records {!user?.is_premium && <Text style={styles.lockedDot}> · top 3 free</Text>}</Text>
        {(data.prs || []).length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="trophy-outline" size={28} color={COLORS.textTertiary} />
            <Text style={styles.emptyText}>Complete workouts to set your first PR.</Text>
          </View>
        ) : (
          <View style={styles.prList}>
            {(user?.is_premium ? data.prs : data.prs.slice(0, 3)).map((pr: any, i: number) => (
              <View key={pr.exercise_id} style={styles.prRow} testID={`pr-row-${i}`}>
                <View style={styles.prRank}>
                  <Text style={styles.prRankText}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.prName}>{pr.name}</Text>
                  <Text style={styles.prDate}>{pr.date ? new Date(pr.date).toLocaleDateString() : ""}</Text>
                </View>
                <Text style={styles.prWeight}>{pr.weight}{data.units || "kg"}</Text>
              </View>
            ))}
            {!user?.is_premium && data.prs.length > 3 && (
              <View style={{ padding: 12 }}>
                <PremiumLock title={`+${data.prs.length - 3} more PRs locked`} subtitle="Premium unlocks full PR dashboard" testID="pr-lock" />
              </View>
            )}
          </View>
        )}

        <Text style={styles.sectionTitle}>Strength trends</Text>
        {topTrends.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="analytics-outline" size={28} color={COLORS.textTertiary} />
            <Text style={styles.emptyText}>Trends appear after a few sessions.</Text>
          </View>
        ) : (
          topTrends.map(([eid, points]: [string, any[]]) => {
            const sorted = [...points].reverse(); // chronological
            const max = Math.max(...sorted.map((p) => p.weight), 1);
            const min = Math.min(...sorted.map((p) => p.weight), 0);
            return (
              <View key={eid} style={styles.trendCard} testID={`trend-${eid}`}>
                <Text style={styles.trendName}>{eid.replace(/-/g, " ")}</Text>
                <View style={styles.sparkRow}>
                  {sorted.map((p, idx) => {
                    const h = max === min ? 30 : 8 + ((p.weight - min) / (max - min)) * 36;
                    return (
                      <View
                        key={idx}
                        style={[styles.sparkBar, { height: h, backgroundColor: idx === sorted.length - 1 ? COLORS.primary : "rgba(255,255,255,0.15)" }]}
                      />
                    );
                  })}
                </View>
                <View style={styles.trendFoot}>
                  <Text style={styles.trendLatest}>Latest {sorted[sorted.length - 1]?.weight}{data.units || "kg"}</Text>
                  <Text style={styles.trendChange}>Best {max}{data.units || "kg"}</Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  loader: { flex: 1, backgroundColor: COLORS.bg, alignItems: "center", justifyContent: "center" },
  scroll: { padding: SPACING["2xl"], paddingBottom: 80 },
  title: { color: COLORS.text, fontSize: 32, fontWeight: "700", letterSpacing: -0.5 },
  sub: { color: COLORS.textSecondary, fontSize: 14, marginTop: 4, marginBottom: SPACING.xl },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: SPACING.xl },
  statCard: { width: "47.5%", backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.lg, padding: 16 },
  statValue: { color: COLORS.text, fontSize: 28, fontWeight: "700" },
  statLabel: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  sectionTitle: { color: COLORS.text, fontSize: 18, fontWeight: "600", marginTop: SPACING.lg, marginBottom: 12 },
  empty: { alignItems: "center", padding: SPACING["3xl"], backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.xl },
  emptyText: { color: COLORS.textSecondary, fontSize: 13, marginTop: 8 },
  prList: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.xl, overflow: "hidden" },
  prRow: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  prRank: { width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(10,132,255,0.15)", alignItems: "center", justifyContent: "center" },
  prRankText: { color: COLORS.primary, fontSize: 13, fontWeight: "700" },
  prName: { color: COLORS.text, fontSize: 15, fontWeight: "600", textTransform: "capitalize" },
  prDate: { color: COLORS.textTertiary, fontSize: 11, marginTop: 2 },
  prWeight: { color: COLORS.text, fontSize: 17, fontWeight: "700" },
  trendCard: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.xl, padding: 16, marginBottom: 12 },
  trendName: { color: COLORS.text, fontSize: 14, fontWeight: "600", textTransform: "capitalize", marginBottom: 10 },
  sparkRow: { flexDirection: "row", alignItems: "flex-end", gap: 4, height: 48 },
  sparkBar: { flex: 1, borderRadius: 3, minWidth: 4 },
  trendFoot: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 },
  trendLatest: { color: COLORS.textSecondary, fontSize: 12 },
  trendChange: { color: COLORS.primary, fontSize: 12, fontWeight: "600" },
  weekBlock: { marginBottom: SPACING.xl },
  lockedDot: { color: COLORS.textTertiary, fontSize: 12, fontWeight: "400" },
});
