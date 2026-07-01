import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { usePremium } from "./PremiumContext";
import { T } from "@/src/anatomy/ui";

const PERKS: { icon: any; label: string; desc: string }[] = [
  { icon: "school", label: "Learn", desc: "Guided anatomy lessons & quizzes" },
  { icon: "sparkles", label: "AI Coach", desc: "Personalised coaching, anytime" },
  { icon: "pulse", label: "Insights", desc: "Recovery heatmap & weekly analytics" },
];

export function Paywall({ title = "Unlock Premium", headerOffset = 0 }: { title?: string; headerOffset?: number }) {
  const insets = useSafeAreaInsets();
  const { setPremium } = usePremium();

  // Payments are not wired yet — keep these as clearly-marked stubs.
  const onUpgrade = () =>
    Alert.alert("Coming soon", "Subscriptions will be available shortly.");
  const onRestore = () =>
    Alert.alert("Restore Purchases", "No previous purchases found for this account.");

  return (
    <View style={[styles.root, { paddingTop: insets.top + 24 + headerOffset }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.crown}>
          <Ionicons name="star" size={30} color={T.accent} />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>Go Premium to unlock the full Anatomy Trainer experience.</Text>

        <View style={styles.perks}>
          {PERKS.map((p) => (
            <View key={p.label} style={styles.perkRow}>
              <View style={styles.perkIcon}>
                <Ionicons name={p.icon} size={20} color={T.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.perkLabel}>{p.label}</Text>
                <Text style={styles.perkDesc}>{p.desc}</Text>
              </View>
              <Ionicons name="checkmark-circle" size={20} color="#2FBF71" />
            </View>
          ))}
        </View>

        <View style={styles.priceRow}>
          <Text style={styles.price}>£9.99</Text>
          <Text style={styles.per}> / month</Text>
        </View>

        <TouchableOpacity style={styles.upgradeBtn} onPress={onUpgrade} testID="paywall-upgrade">
          <Ionicons name="star" size={16} color={T.bg} />
          <Text style={styles.upgradeText}>Upgrade</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.restoreBtn} onPress={onRestore} testID="paywall-restore">
          <Text style={styles.restoreText}>Restore Purchases</Text>
        </TouchableOpacity>

        <Text style={styles.legal}>Cancel anytime. Billed monthly.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  scroll: { paddingHorizontal: 24, paddingBottom: 40, alignItems: "center" },
  crown: {
    width: 64, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(52,199,255,0.12)", borderWidth: 1, borderColor: T.borderHi, marginBottom: 18,
  },
  title: { color: T.text, fontSize: 26, fontWeight: "800", textAlign: "center" },
  subtitle: { color: T.textDim, fontSize: 14, textAlign: "center", marginTop: 8, lineHeight: 20, maxWidth: 300 },
  perks: { width: "100%", marginTop: 26, gap: 10 },
  perkRow: {
    flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: T.surface,
    borderWidth: 1, borderColor: T.border, borderRadius: 14, padding: 14,
  },
  perkIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(52,199,255,0.1)" },
  perkLabel: { color: T.text, fontSize: 15, fontWeight: "700" },
  perkDesc: { color: T.textFaint, fontSize: 12, marginTop: 2 },
  priceRow: { flexDirection: "row", alignItems: "baseline", marginTop: 28 },
  price: { color: T.text, fontSize: 34, fontWeight: "900" },
  per: { color: T.textDim, fontSize: 15, fontWeight: "600" },
  upgradeBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: T.accent, borderRadius: 14, paddingVertical: 16, width: "100%", marginTop: 20,
  },
  upgradeText: { color: T.bg, fontSize: 16, fontWeight: "800" },
  restoreBtn: { paddingVertical: 14, marginTop: 4 },
  restoreText: { color: T.accent, fontSize: 14, fontWeight: "700" },
  legal: { color: T.textFaint, fontSize: 11, marginTop: 6 },
});
