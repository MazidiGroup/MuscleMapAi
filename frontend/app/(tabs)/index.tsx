import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ImageBackground,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";

import { COLORS, FONT, IMAGES, RADIUS, SPACING } from "@/src/theme";
import { apiGet, apiPost } from "@/src/api";
import { useAuth } from "@/src/auth-context";

export default function Home() {
  const router = useRouter();
  const { user } = useAuth();
  const [workout, setWorkout] = useState<any>(null);
  const [restDay, setRestDay] = useState(false);
  const [insight, setInsight] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [progress, setProgress] = useState<any>({});

  const load = useCallback(async () => {
    try {
      const [w, p] = await Promise.all([
        apiGet("/workouts/today"),
        apiGet("/progress/summary"),
      ]);
      setWorkout(w.workout);
      setRestDay(!!w.rest_day);
      setProgress(p);
      // fire-and-forget for insight
      apiPost("/coach/today-insight", {}).then((res: any) => setInsight(res.insight)).catch(() => {});
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const startWorkout = async () => {
    try {
      const w = await apiPost("/workouts/start", {});
      router.push(`/workout/${w.workout_id}`);
    } catch (e) {
      console.warn(e);
    }
  };

  if (loading) {
    return (
      <View style={styles.loader} testID="home-loading">
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={["top"]} testID="home-screen">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.greeting}>Hey, {user?.name?.split(" ")[0] || "Athlete"}</Text>
            <Text style={styles.dateText}>{new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" })}</Text>
          </View>
          <View style={styles.streakPill} testID="streak-pill">
            <Ionicons name="flame" size={14} color="#F59E0B" />
            <Text style={styles.streakText}>{progress.streak || 0}d</Text>
          </View>
        </View>

        {/* AI insight card */}
        <View style={styles.insightCard} testID="ai-insight-card">
          <View style={styles.insightHeader}>
            <View style={styles.aiDot} />
            <Text style={styles.insightLabel}>APEX • TODAY</Text>
          </View>
          <Text style={styles.insightText}>
            {insight || "Loading your coaching insight…"}
          </Text>
        </View>

        {/* Today's workout card */}
        {workout && !restDay ? (
          <Pressable style={styles.workoutCard} onPress={startWorkout} testID="todays-workout-card">
            <ImageBackground source={{ uri: IMAGES.workoutMale }} style={styles.workoutBg} imageStyle={{ borderRadius: RADIUS["2xl"] }}>
              <LinearGradient
                colors={["rgba(10,10,10,0.0)", "rgba(10,10,10,0.55)", "rgba(10,10,10,0.92)"]}
                style={StyleSheet.absoluteFillObject}
              />
              <View style={styles.workoutContent}>
                <Text style={styles.workoutEyebrow}>{`TODAY'S WORKOUT`}</Text>
                <Text style={styles.workoutTitle}>{workout.name}</Text>
                <Text style={styles.workoutMeta}>
                  {workout.exercises?.length || 0} exercises · {workout.muscle_focus}
                </Text>
                <View style={styles.workoutCta} testID="start-workout-button">
                  <Text style={styles.workoutCtaText}>Start workout</Text>
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                </View>
              </View>
            </ImageBackground>
          </Pressable>
        ) : restDay && workout ? (
          <View style={styles.restCard} testID="rest-day-card">
            <Ionicons name="moon-outline" size={28} color={COLORS.primary} />
            <Text style={styles.restTitle}>Rest day</Text>
            <Text style={styles.restSub}>Next session: {workout.name}</Text>
            <Pressable style={styles.restCta} onPress={startWorkout} testID="start-anyway-button">
              <Text style={styles.restCtaText}>Train anyway →</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.restCard}>
            <Text style={styles.restTitle}>No plan yet</Text>
            <Text style={styles.restSub}>Complete onboarding to generate one.</Text>
          </View>
        )}

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard} testID="stat-week">
            <Text style={styles.statValue}>{progress.week_count || 0}</Text>
            <Text style={styles.statLabel}>This week</Text>
          </View>
          <View style={styles.statCard} testID="stat-total">
            <Text style={styles.statValue}>{progress.total_workouts || 0}</Text>
            <Text style={styles.statLabel}>All-time</Text>
          </View>
          <View style={styles.statCard} testID="stat-recovery">
            <Text style={[styles.statValue, { color: COLORS.success }]}>Good</Text>
            <Text style={styles.statLabel}>Recovery</Text>
          </View>
        </View>

        {/* Coach shortcut */}
        <Pressable style={styles.coachShortcut} onPress={() => router.push("/(tabs)/coach")} testID="coach-shortcut">
          <View style={styles.coachIcon}>
            <Ionicons name="sparkles" size={18} color={COLORS.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.coachTitle}>Ask your coach</Text>
            <Text style={styles.coachSub}>{`"My shoulder hurts" • "I only have 30 min"`}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.textTertiary} />
        </Pressable>

        {/* Weekly report shortcut */}
        <Pressable style={styles.reportRow} onPress={() => router.push("/weekly-report")} testID="weekly-report-link">
          <Ionicons name="document-text-outline" size={18} color={COLORS.text} />
          <Text style={styles.reportText}>{`View this week's coach report`}</Text>
          <Ionicons name="chevron-forward" size={18} color={COLORS.textTertiary} />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  loader: { flex: 1, backgroundColor: COLORS.bg, alignItems: "center", justifyContent: "center" },
  scroll: { paddingHorizontal: SPACING["2xl"], paddingBottom: SPACING["4xl"] },
  headerRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: SPACING.md, marginBottom: SPACING.xl },
  greeting: { color: COLORS.text, fontSize: 28, fontWeight: "700", letterSpacing: -0.5 },
  dateText: { color: COLORS.textSecondary, fontSize: 14, marginTop: 2 },
  streakPill: { flexDirection: "row", gap: 6, alignItems: "center", backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  streakText: { color: COLORS.text, fontSize: 13, fontWeight: "600" },
  insightCard: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.xl, padding: 18, marginBottom: SPACING.xl },
  insightHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  aiDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary, shadowColor: COLORS.primary, shadowOpacity: 0.8, shadowRadius: 6 },
  insightLabel: { color: COLORS.primary, fontSize: 10, fontWeight: "700", letterSpacing: 2 },
  insightText: { color: COLORS.text, fontSize: 16, lineHeight: 22 },
  workoutCard: { borderRadius: RADIUS["2xl"], overflow: "hidden", marginBottom: SPACING.xl },
  workoutBg: { height: 220, justifyContent: "flex-end" },
  workoutContent: { padding: 20 },
  workoutEyebrow: { color: COLORS.primary, fontSize: 10, fontWeight: "700", letterSpacing: 2, marginBottom: 6 },
  workoutTitle: { color: "#fff", fontSize: 26, fontWeight: "700", letterSpacing: -0.5 },
  workoutMeta: { color: "rgba(255,255,255,0.7)", fontSize: 13, marginTop: 4 },
  workoutCta: { flexDirection: "row", gap: 8, alignItems: "center", alignSelf: "flex-start", marginTop: 14, backgroundColor: COLORS.primary, paddingVertical: 12, paddingHorizontal: 22, borderRadius: 999 },
  workoutCtaText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  restCard: { padding: 22, borderRadius: RADIUS["2xl"], backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: "flex-start", marginBottom: SPACING.xl },
  restTitle: { color: COLORS.text, fontSize: 22, fontWeight: "700", marginTop: 10 },
  restSub: { color: COLORS.textSecondary, fontSize: 14, marginTop: 6 },
  restCta: { marginTop: 14 },
  restCtaText: { color: COLORS.primary, fontSize: 14, fontWeight: "600" },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: SPACING.xl },
  statCard: { flex: 1, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.lg, padding: 14, alignItems: "flex-start" },
  statValue: { color: COLORS.text, fontSize: 22, fontWeight: "700" },
  statLabel: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  coachShortcut: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.xl, padding: 14, marginBottom: 12 },
  coachIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(10,132,255,0.12)", alignItems: "center", justifyContent: "center" },
  coachTitle: { color: COLORS.text, fontSize: 15, fontWeight: "600" },
  coachSub: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  reportRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 4 },
  reportText: { flex: 1, color: COLORS.text, fontSize: 14, fontWeight: "500" },
});
