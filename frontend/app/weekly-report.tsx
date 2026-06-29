import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { apiPost } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { PremiumLock } from "@/src/components/PremiumLock";

export default function WeeklyReport() {
  const router = useRouter();
  const { user } = useAuth();
  const [report, setReport] = useState<any>(null);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.is_premium) {
      setLoading(false);
      return;
    }
    apiPost("/coach/weekly-report", {})
      .then((res: any) => {
        setReport(res.report);
        setCount(res.workouts_this_week);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  if (loading) {
    return <View style={styles.loader}><ActivityIndicator color={COLORS.primary} /><Text style={styles.loadText}>Apex is reviewing your week…</Text></View>;
  }

  if (!user?.is_premium) {
    return (
      <SafeAreaView style={styles.root} edges={["top", "bottom"]} testID="weekly-report-screen">
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} testID="report-back">
            <Ionicons name="chevron-back" size={26} color={COLORS.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Weekly report</Text>
          <View style={{ width: 26 }} />
        </View>
        <View style={styles.lockedContent}>
          <View style={styles.lockedIconWrap}>
            <Ionicons name="lock-closed" size={28} color={COLORS.primary} />
          </View>
          <Text style={styles.lockedTitle}>Weekly Coach Reports{"\n"}are a Premium feature</Text>
          <Text style={styles.lockedSub}>
            Apex analyses every session, highlights what you crushed,{"\n"}what's holding you back, and adapts next week's plan.
          </Text>
          <View style={{ height: 24, width: "100%" }} />
          <PremiumLock title="Unlock Weekly Coach Report" subtitle="From £6.66/month with annual" testID="report-premium-lock" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]} testID="weekly-report-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="report-back">
          <Ionicons name="chevron-back" size={26} color={COLORS.text} />
        </Pressable>
        <Text style={styles.headerTitle}>This week</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>WEEKLY COACH REPORT</Text>
          <Text style={styles.bigStat}>{count}</Text>
          <Text style={styles.bigStatLabel}>workouts completed</Text>
        </View>

        {report && (
          <>
            <Section title="Highlights" icon="trophy">
              {report.highlights?.map((h: string, i: number) => (
                <Bullet key={i} text={h} testID={`highlight-${i}`} />
              ))}
            </Section>

            <Section title="Areas to focus" icon="flag">
              {report.weak_points?.map((h: string, i: number) => (
                <Bullet key={i} text={h} testID={`weak-${i}`} />
              ))}
            </Section>

            <Section title="Recovery" icon="moon">
              <Text style={styles.bodyText} testID="recovery-text">{report.recovery}</Text>
            </Section>

            <Section title="Next week" icon="rocket">
              {report.next_week?.map((h: string, i: number) => (
                <Bullet key={i} text={h} testID={`next-${i}`} primary />
              ))}
            </Section>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon} size={18} color={COLORS.primary} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Bullet({ text, primary, testID }: { text: string; primary?: boolean; testID?: string }) {
  return (
    <View style={styles.bullet} testID={testID}>
      <View style={[styles.bulletDot, primary && { backgroundColor: COLORS.primary }]} />
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  loader: { flex: 1, backgroundColor: COLORS.bg, alignItems: "center", justifyContent: "center", gap: 12 },
  loadText: { color: COLORS.textSecondary, fontSize: 13 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: SPACING.xl, paddingVertical: 10 },
  headerTitle: { color: COLORS.text, fontSize: 17, fontWeight: "600" },
  scroll: { padding: SPACING["2xl"], paddingBottom: 60 },
  hero: { alignItems: "center", padding: SPACING["2xl"], borderRadius: RADIUS["2xl"], backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING["2xl"] },
  eyebrow: { color: COLORS.primary, fontSize: 11, fontWeight: "700", letterSpacing: 3 },
  bigStat: { color: COLORS.text, fontSize: 84, fontWeight: "700", letterSpacing: -3, marginTop: 8 },
  bigStatLabel: { color: COLORS.textSecondary, fontSize: 14, marginTop: -4 },
  section: { marginBottom: SPACING.xl },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  sectionTitle: { color: COLORS.text, fontSize: 18, fontWeight: "600" },
  sectionBody: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.xl, padding: 16, gap: 10 },
  bullet: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  bulletDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.textSecondary, marginTop: 8 },
  bulletText: { flex: 1, color: COLORS.text, fontSize: 14, lineHeight: 21 },
  bodyText: { color: COLORS.text, fontSize: 14, lineHeight: 21 },
  lockedContent: { flex: 1, padding: SPACING["2xl"], alignItems: "center", justifyContent: "flex-start", paddingTop: SPACING["4xl"] },
  lockedIconWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: "rgba(10,132,255,0.12)", borderWidth: 1, borderColor: COLORS.primary, alignItems: "center", justifyContent: "center", marginBottom: SPACING.xl },
  lockedTitle: { color: COLORS.text, fontSize: 24, fontWeight: "700", textAlign: "center", lineHeight: 30 },
  lockedSub: { color: COLORS.textSecondary, fontSize: 14, textAlign: "center", marginTop: 12, lineHeight: 21 },
});
