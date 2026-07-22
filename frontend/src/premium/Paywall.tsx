import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { usePremium, PremiumPackage } from "./PremiumContext";
import { legacyPalette, LegacyPalette } from "@/src/anatomy/ui";
import { useTheme } from "@/src/theme/ThemeContext";
import { ThemeToggle } from "@/src/theme/ThemeToggle";

const PERKS: { icon: any; label: string; desc: string }[] = [
  { icon: "cube", label: "3D Explore", desc: "Full interactive 3D anatomy explorer" },
  { icon: "body", label: "Muscle Library", desc: "Muscle guide + guided anatomy lessons" },
  { icon: "barbell", label: "Muscle Groups", desc: "3D muscle-group view in your workout" },
  { icon: "sparkles", label: "AI Coach", desc: "Personalised coaching, anytime" },
  { icon: "pulse", label: "Insights", desc: "Recovery heatmap & weekly analytics" },
];

// Preferred package order for display.
const ORDER = ["WEEKLY", "MONTHLY", "ANNUAL", "LIFETIME"];

// Human-readable subscription length for App Store compliance (3.1.2(c)).
const PERIOD_LABEL: Record<string, string> = {
  WEEKLY: "1 week",
  MONTHLY: "1 month",
  ANNUAL: "1 year",
  TWO_MONTH: "2 months",
  THREE_MONTH: "3 months",
  SIX_MONTH: "6 months",
  LIFETIME: "one-time",
};

// Divisor to derive price-per-month from a package price. Undefined => no derived unit.
const MONTHS_IN_PACKAGE: Record<string, number | undefined> = {
  WEEKLY: undefined, // shown per-week directly
  MONTHLY: 1,
  ANNUAL: 12,
  TWO_MONTH: 2,
  THREE_MONTH: 3,
  SIX_MONTH: 6,
  LIFETIME: undefined,
};

/**
 * Format a "price per month" string using the numeric product.price + priceString.
 * Falls back to empty string if we can't safely compute it.
 */
function pricePerUnit(pkg: PremiumPackage): string {
  const product = pkg.raw?.product ?? {};
  const price: number | undefined = typeof product.price === "number" ? product.price : undefined;
  const priceStr: string = pkg.priceString || product.priceString || "";
  const type = pkg.packageType;
  if (type === "WEEKLY" && priceStr) return `${priceStr} / week`;
  if (type === "LIFETIME") return "one-time purchase";
  const months = MONTHS_IN_PACKAGE[type];
  if (!months || !price || !priceStr) return "";
  const per = price / months;
  // Extract the currency prefix/suffix from priceString (e.g. "£9.99", "US$9.99", "9,99 €").
  // Preserve the same non-numeric characters, replace the number with per-month value.
  const numMatch = priceStr.match(/[\d.,]+/);
  if (!numMatch) return "";
  const perFmt = per.toFixed(2);
  const priceStrPerMonth = priceStr.replace(numMatch[0], perFmt);
  return months === 1 ? `${priceStrPerMonth} / month` : `${priceStrPerMonth} / month`;
}

export function Paywall({ title = "Unlock Premium", headerOffset = 0, showThemeToggle = true }: { title?: string; headerOffset?: number; showThemeToggle?: boolean }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { mode } = useTheme();
  const T = useMemo(() => legacyPalette(mode), [mode]);
  const styles = useMemo(() => makeStyles(T), [T]);
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
      {showThemeToggle && <ThemeToggle style={{ position: "absolute", top: insets.top + 8, right: 16, zIndex: 30 }} />}
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.crown}>
          <Ionicons name="star" size={30} color={T.accent} />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>Go Premium to unlock the full Muscle Map Ai experience.</Text>

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
              const perUnit = pricePerUnit(p);
              const length = PERIOD_LABEL[p.packageType] || "";
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
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.planLabel, active && { color: T.text }]}>{p.label}</Text>
                    {length ? <Text style={styles.planMeta}>{length}</Text> : null}
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[styles.planPrice, active && { color: T.text }]}>{p.priceString}</Text>
                    {perUnit ? <Text style={styles.planMeta}>{perUnit}</Text> : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <Text style={styles.plansNote}>Subscription plans appear on the installed app.</Text>
        )}

        {/* Required subscription disclosure — Guideline 3.1.2 */}
        <View style={styles.discBox}>
          <Text style={styles.discTitle}>Subscription details</Text>
          <Text style={styles.discBody}>
            Muscle Map Ai Premium is an auto-renewing subscription. Payment is charged to your Apple ID
            at confirmation of purchase. The subscription automatically renews for the same period at
            the same price unless auto-renew is turned off at least 24 hours before the end of the
            current period. You can manage or cancel your subscription in your Apple ID Account Settings
            after purchase.
          </Text>
        </View>

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

        {notice ? <Text style={styles.notice}>{notice}</Text> : null}

        {/* Legal footer — Guideline 3.1.2 requires functional Terms & Privacy links */}
        <View style={styles.legalRow}>
          <TouchableOpacity onPress={() => router.push("/terms")} testID="paywall-terms">
            <Text style={styles.legalLink}>Terms of Use</Text>
          </TouchableOpacity>
          <Text style={styles.legalSep}>·</Text>
          <TouchableOpacity onPress={() => router.push("/privacy")} testID="paywall-privacy">
            <Text style={styles.legalLink}>Privacy Policy</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (T: LegacyPalette) => StyleSheet.create({
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
  planLabel: { color: T.textDim, fontSize: 15, fontWeight: "700" },
  planMeta: { color: T.textFaint, fontSize: 11, fontWeight: "500", marginTop: 2 },
  planPrice: { color: T.textDim, fontSize: 15, fontWeight: "800" },
  plansNote: { color: T.textFaint, fontSize: 13, marginTop: 22, textAlign: "center" },
  discBox: {
    width: "100%", marginTop: 18, backgroundColor: T.surface,
    borderWidth: 1, borderColor: T.border, borderRadius: 12, padding: 14,
  },
  discTitle: { color: T.textDim, fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  discBody: { color: T.textFaint, fontSize: 12, lineHeight: 18 },
  upgradeBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: T.accent, borderRadius: 14, paddingVertical: 16, width: "100%", marginTop: 20, minHeight: 52,
  },
  upgradeText: { color: T.bg, fontSize: 16, fontWeight: "800" },
  restoreBtn: { paddingVertical: 14, marginTop: 4, minHeight: 44, justifyContent: "center" },
  restoreText: { color: T.accent, fontSize: 14, fontWeight: "700" },
  legal: { color: T.textFaint, fontSize: 11, marginTop: 6 },
  notice: { color: T.textDim, fontSize: 12, marginTop: 8, textAlign: "center" },
  legalRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, marginTop: 14,
  },
  legalLink: { color: T.textDim, fontSize: 12, fontWeight: "700", textDecorationLine: "underline" },
  legalSep: { color: T.textFaint, fontSize: 12 },
});
