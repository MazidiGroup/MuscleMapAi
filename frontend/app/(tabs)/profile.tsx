import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";

import { COLORS, RADIUS, SPACING } from "@/src/theme";
import { apiGet } from "@/src/api";
import { useAuth } from "@/src/auth-context";

export default function Profile() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [sub, setSub] = useState<any>({ status: "none" });

  const load = useCallback(async () => {
    try {
      const s = await apiGet("/billing/subscription");
      setSub(s);
    } catch (e) {
      console.warn(e);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const isPremium = sub?.status === "active";

  return (
    <SafeAreaView style={styles.root} edges={["top"]} testID="profile-screen">
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            {user?.picture ? (
              <Image source={{ uri: user.picture }} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarText}>{user?.name?.charAt(0)?.toUpperCase() || "A"}</Text>
            )}
          </View>
          <Text style={styles.name}>{user?.name || "Athlete"}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          {isPremium && (
            <View style={styles.premiumBadge} testID="premium-badge">
              <Ionicons name="diamond" size={11} color={COLORS.primary} />
              <Text style={styles.premiumText}>PREMIUM</Text>
            </View>
          )}
        </View>

        {!isPremium && (
          <Pressable style={styles.upgradeCard} onPress={() => router.push("/subscribe")} testID="upgrade-card">
            <View style={styles.upgradeIcon}>
              <Ionicons name="sparkles" size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.upgradeTitle}>Unlock Apex Premium</Text>
              <Text style={styles.upgradeSub}>Unlimited coaching · adaptive plans · £9.99/mo</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#fff" />
          </Pressable>
        )}

        <Text style={styles.sectionLabel}>YOUR PLAN</Text>
        <View style={styles.infoCard}>
          <InfoRow label="Goal" value={user?.goal?.replace("_", " ") || "—"} />
          <InfoRow label="Experience" value={user?.experience || "—"} />
          <InfoRow label="Frequency" value={user?.frequency ? `${user.frequency} days/week` : "—"} />
          <InfoRow label="Equipment" value={(user?.equipment || []).map((e) => e.replace("_", " ")).join(", ") || "—"} last />
        </View>

        <Pressable style={styles.row} onPress={() => router.push("/weekly-report")} testID="weekly-report-btn">
          <Ionicons name="document-text-outline" size={20} color={COLORS.text} />
          <Text style={styles.rowText}>Weekly coach report</Text>
          <Ionicons name="chevron-forward" size={18} color={COLORS.textTertiary} />
        </Pressable>

        <Pressable style={styles.row} onPress={() => router.push("/onboarding")} testID="redo-onboarding-btn">
          <Ionicons name="reload-outline" size={20} color={COLORS.text} />
          <Text style={styles.rowText}>Redo onboarding</Text>
          <Ionicons name="chevron-forward" size={18} color={COLORS.textTertiary} />
        </Pressable>

        <Pressable style={[styles.row, { borderBottomWidth: 0 }]} onPress={signOut} testID="signout-btn">
          <Ionicons name="log-out-outline" size={20} color={COLORS.danger} />
          <Text style={[styles.rowText, { color: COLORS.danger }]}>Sign out</Text>
          <Ionicons name="chevron-forward" size={18} color={COLORS.textTertiary} />
        </Pressable>

        <Text style={styles.footer}>Apex AI · V1</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.infoRow, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: SPACING["2xl"], paddingBottom: 60 },
  profileHeader: { alignItems: "center", marginTop: SPACING.lg, marginBottom: SPACING["2xl"] },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImg: { width: 80, height: 80 },
  avatarText: { color: COLORS.text, fontSize: 28, fontWeight: "700" },
  name: { color: COLORS.text, fontSize: 22, fontWeight: "700", marginTop: 12 },
  email: { color: COLORS.textSecondary, fontSize: 13, marginTop: 4 },
  premiumBadge: { flexDirection: "row", gap: 6, alignItems: "center", paddingVertical: 4, paddingHorizontal: 10, backgroundColor: "rgba(10,132,255,0.15)", borderRadius: 999, marginTop: 8 },
  premiumText: { color: COLORS.primary, fontSize: 10, fontWeight: "700", letterSpacing: 1.5 },
  upgradeCard: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: RADIUS.xl, backgroundColor: COLORS.primary, marginBottom: SPACING.xl },
  upgradeIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
  upgradeTitle: { color: "#fff", fontSize: 15, fontWeight: "700" },
  upgradeSub: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
  sectionLabel: { color: COLORS.textTertiary, fontSize: 11, fontWeight: "700", letterSpacing: 2, marginBottom: 8 },
  infoCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.lg, overflow: "hidden" },
  infoRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  infoLabel: { color: COLORS.textSecondary, fontSize: 14, textTransform: "capitalize" },
  infoValue: { color: COLORS.text, fontSize: 14, fontWeight: "600", textTransform: "capitalize", flex: 1, textAlign: "right" },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 16, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  rowText: { flex: 1, color: COLORS.text, fontSize: 15, fontWeight: "500" },
  footer: { textAlign: "center", color: COLORS.textTertiary, fontSize: 12, marginTop: SPACING["2xl"] },
});
