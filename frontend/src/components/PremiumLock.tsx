import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { COLORS, RADIUS, SPACING } from "@/src/theme";

type Props = {
  title?: string;
  subtitle?: string;
  testID?: string;
};

export function PremiumLock({ title = "Premium feature", subtitle = "Unlock with Apex Premium", testID = "premium-lock" }: Props) {
  const router = useRouter();
  return (
    <Pressable
      testID={testID}
      onPress={() => router.push("/subscribe")}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.iconWrap}>
        <Ionicons name="diamond" size={20} color={COLORS.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.sub}>{subtitle}</Text>
      </View>
      <View style={styles.cta}>
        <Text style={styles.ctaText}>Unlock</Text>
        <Ionicons name="arrow-forward" size={14} color="#fff" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: "rgba(10,132,255,0.06)",
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(10,132,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: COLORS.text, fontSize: 15, fontWeight: "600" },
  sub: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  cta: { flexDirection: "row", gap: 6, alignItems: "center", backgroundColor: COLORS.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  ctaText: { color: "#fff", fontSize: 12, fontWeight: "700" },
});
