import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { usePremium, PremiumPackage } from "./PremiumContext";
import { T } from "@/src/anatomy/ui";

const PERKS: { icon: any; label: string; desc: string }[] = [
  { icon: "school", label: "Learn", desc: "Guided anatomy lessons & quizzes" },
  { icon: "sparkles", label: "AI Coach", desc: "Personalised coaching, anytime" },
  { icon: "pulse", label: "Insights", desc: "Recovery heatmap & weekly analytics" },
];

// Preferred package order for display.
const ORDER = ["WEEKLY", "MONTHLY", "ANNUAL", "LIFETIME"];

export function Paywall({ title = "Unlock Premium", headerOffset = 0 }: { title?: string; headerOffset?: number }) {
  const insets = useSafeAreaInsets();
  const { packages, purchase, restorePurchases } = usePremium();
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<"purchase" | "restore" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const sorted = useMemo(() => {
    return [...packages].sort((a, b) => {
      const ia = ORDER.indexOf(a.packageType);
      const ib = ORDER.indexOf(b.packageType);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }, [packages]);

  // Default-select the monthly package (or the first available).
  useEffect(() => {
    if (selected || sorted.length === 0) return;
    const monthly = sorted.find((p) => p.packageType === "MONTHLY");
    setSelected((monthly ?? sorted[0]).identifier);
  }, [sorted, selected]);

  const onUpgrade = async () => {
    const pkg = sorted.find((p) => p.identifier === selected);
    if (!pkg) {
      setNotice("Subscription plans load inside the app build.");
      return;
    }
    setBusy("purchase");
    setNotice(null);
    const ok = await purchase(pkg);
    setBusy(null);
    if (!ok) setNotice("Purchase was not completed.");
    // On success the premium gate re-renders and this screen unmounts.
  };

  const onRestore = async () => {
    setBusy("restore");
    setNotice(null);
    const ok = await restorePurchases();
    setBusy(null);
    setNotice(ok ? "Purchases restored." : "No previous purchases found.");
  };

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

        {/* Live subscription options from the App Store (via RevenueCat) */}
        {sorted.length > 0 ? (
          <View style={styles.plans}>
            {sorted.map((p) => {
              const active = p.identifier === selected;
              return (
                <TouchableOpacity
                  key={p.identifier}
                  style={[styles.plan, active && styles.planActive]}
                  onPress={() => setSelected(p.identifier)}
                  testID={`plan-${p.packageType.toLowerCase()}`}
                >
                  <View style={[styles.radio, active && styles.radioActive]}>
                    {active && <View style={styles.radioDot} />}
                  </View>
                  <Text style={[styles.planLabel, active && { color: T.text }]}>{p.label}</Text>
                  <Text style={[styles.planPrice, active && { color: T.text }]}>{p.priceString}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <Text style={styles.plansNote}>Subscription plans appear on the installed app.</Text>
        )}

        <TouchableOpacity style={[styles.upgradeBtn, busy && { opacity: 0.6 }]} onPress={onUpgrade} disabled={!!busy} testID="paywall-upgrade">
          {busy === "purchase" ? (
            <ActivityIndicator color={T.bg} />
          ) : (
            <>
              <Ionicons name="star" size={16} color={T.bg} />
              <Text style={styles.upgradeText}>Upgrade</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.restoreBtn} onPress={onRestore} disabled={!!busy} testID="paywall-restore">
          {busy === "restore" ? (
            <ActivityIndicator color={T.accent} />
          ) : (
            <Text style={styles.restoreText}>Restore Purchases</Text>
          )}
        </TouchableOpacity>

        {notice ? <Text style={styles.notice}>{notice}</Text> : <Text style={styles.legal}>Cancel anytime.</Text>}
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
  perks: { width: "100%", marginTop: 24, gap: 10 },
  perkRow: {
    flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: T.surface,
    borderWidth: 1, borderColor: T.border, borderRadius: 14, padding: 14,
  },
  perkIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(52,199,255,0.1)" },
  perkLabel: { color: T.text, fontSize: 15, fontWeight: "700" },
  perkDesc: { color: T.textFaint, fontSize: 12, marginTop: 2 },
  plans: { width: "100%", marginTop: 22, gap: 10 },
  plan: {
    flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: T.surface,
    borderWidth: 1, borderColor: T.border, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 15,
  },
  planActive: { borderColor: T.accent, backgroundColor: "rgba(52,199,255,0.08)" },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: T.border, alignItems: "center", justifyContent: "center" },
  radioActive: { borderColor: T.accent },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: T.accent },
  planLabel: { flex: 1, color: T.textDim, fontSize: 15, fontWeight: "700" },
  planPrice: { color: T.textDim, fontSize: 15, fontWeight: "800" },
  plansNote: { color: T.textFaint, fontSize: 13, marginTop: 22, textAlign: "center" },
  upgradeBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: T.accent, borderRadius: 14, paddingVertical: 16, width: "100%", marginTop: 20, minHeight: 52,
  },
  upgradeText: { color: T.bg, fontSize: 16, fontWeight: "800" },
  restoreBtn: { paddingVertical: 14, marginTop: 4, minHeight: 44, justifyContent: "center" },
  restoreText: { color: T.accent, fontSize: 14, fontWeight: "700" },
  legal: { color: T.textFaint, fontSize: 11, marginTop: 6 },
  notice: { color: T.textDim, fontSize: 12, marginTop: 8, textAlign: "center" },
});
