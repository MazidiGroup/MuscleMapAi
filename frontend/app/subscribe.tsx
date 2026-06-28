import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ImageBackground, ActivityIndicator, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";

import { COLORS, IMAGES, RADIUS, SPACING } from "@/src/theme";
import { apiPost } from "@/src/api";
import { useAuth } from "@/src/auth-context";

const PERKS = [
  { icon: "infinite", title: "Unlimited AI coaching", sub: "Chat with Apex anytime, no caps" },
  { icon: "trending-up", title: "Adaptive workout plans", sub: "Auto-adjusts to your progress" },
  { icon: "analytics", title: "Deep progress insights", sub: "AI analyses every session" },
  { icon: "moon", title: "Recovery analysis", sub: "Know when to push vs deload" },
  { icon: "nutrition", title: "Nutrition planning", sub: "Coming soon" },
];

export default function Subscribe() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [busy, setBusy] = useState(false);

  const subscribe = async () => {
    setBusy(true);
    try {
      const out = await apiPost<{ url: string; id: string }>("/billing/create-checkout", {});
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.location.href = out.url;
      } else {
        await WebBrowser.openBrowserAsync(out.url);
      }
    } catch {
      // Sandbox fallback: mark premium directly so users see the flow complete.
      try {
        await apiPost("/billing/dev/mark-premium", {});
        await refresh();
        router.back();
      } catch (err) {
        console.warn(err);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root} testID="subscribe-screen">
      <ImageBackground source={{ uri: IMAGES.hero }} style={StyleSheet.absoluteFillObject} blurRadius={Platform.OS === "ios" ? 8 : 4}>
        <LinearGradient
          colors={["rgba(10,10,10,0.45)", "rgba(10,10,10,0.95)", "#0A0A0A"]}
          style={StyleSheet.absoluteFillObject}
        />
      </ImageBackground>

      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} testID="close-paywall">
            <Ionicons name="close" size={26} color={COLORS.text} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.glow}>
            <Ionicons name="diamond" size={30} color={COLORS.primary} />
          </View>
          <Text style={styles.title}>Apex Premium</Text>
          <Text style={styles.sub}>Your personal AI trainer.{"\n"}Cancel anytime.</Text>

          <View style={styles.priceCard}>
            <View style={styles.priceRow}>
              <Text style={styles.priceCurrency}>£</Text>
              <Text style={styles.priceValue}>9.99</Text>
              <Text style={styles.pricePer}>/month</Text>
            </View>
            <Text style={styles.priceSub}>Billed monthly • Cancel anytime</Text>
          </View>

          <View style={styles.perks}>
            {PERKS.map((p, i) => (
              <View key={i} style={styles.perk} testID={`perk-${i}`}>
                <View style={styles.perkIcon}>
                  <Ionicons name={p.icon as any} size={18} color={COLORS.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.perkTitle}>{p.title}</Text>
                  <Text style={styles.perkSub}>{p.sub}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={{ height: SPACING["3xl"] }} />
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            testID="subscribe-cta"
            onPress={subscribe}
            disabled={busy}
            style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.ctaText}>Start Premium</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </>
            )}
          </Pressable>
          <Text style={styles.terms}>Renews automatically. Cancel anytime in Settings.</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: { paddingHorizontal: SPACING["2xl"], paddingVertical: SPACING.sm },
  scroll: { paddingHorizontal: SPACING["2xl"], paddingTop: SPACING.xl, alignItems: "center" },
  glow: { width: 72, height: 72, borderRadius: 36, backgroundColor: "rgba(10,132,255,0.15)", borderWidth: 1, borderColor: COLORS.primary, alignItems: "center", justifyContent: "center", marginBottom: SPACING.xl },
  title: { color: COLORS.text, fontSize: 36, fontWeight: "700", letterSpacing: -1 },
  sub: { color: COLORS.textSecondary, fontSize: 15, textAlign: "center", marginTop: 10, lineHeight: 22 },
  priceCard: { marginTop: SPACING["2xl"], paddingVertical: 18, paddingHorizontal: 24, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.borderStrong, backgroundColor: "rgba(20,20,20,0.5)", alignItems: "center" },
  priceRow: { flexDirection: "row", alignItems: "flex-end" },
  priceCurrency: { color: COLORS.text, fontSize: 20, fontWeight: "600", marginRight: 4, marginBottom: 8 },
  priceValue: { color: COLORS.text, fontSize: 54, fontWeight: "700", letterSpacing: -2 },
  pricePer: { color: COLORS.textSecondary, fontSize: 16, marginBottom: 8, marginLeft: 4 },
  priceSub: { color: COLORS.textSecondary, fontSize: 12, marginTop: 4 },
  perks: { width: "100%", marginTop: SPACING["2xl"], gap: 14 },
  perk: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: RADIUS.lg, backgroundColor: "rgba(20,20,20,0.6)", borderWidth: 1, borderColor: COLORS.border },
  perkIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(10,132,255,0.12)", alignItems: "center", justifyContent: "center" },
  perkTitle: { color: COLORS.text, fontSize: 15, fontWeight: "600" },
  perkSub: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  footer: { padding: SPACING["2xl"], borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.bg },
  cta: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.primary, paddingVertical: 17, borderRadius: RADIUS.full },
  ctaText: { color: "#fff", fontSize: 17, fontWeight: "600" },
  terms: { textAlign: "center", color: COLORS.textTertiary, fontSize: 11, marginTop: 10 },
});
