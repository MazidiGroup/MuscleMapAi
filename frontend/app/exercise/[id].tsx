import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, ImageBackground } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import { COLORS, IMAGES, RADIUS, SPACING } from "@/src/theme";
import { apiGet } from "@/src/api";

export default function ExerciseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [ex, setEx] = useState<any>(null);

  useEffect(() => {
    apiGet(`/exercises/${id}`).then(setEx).catch(console.warn);
  }, [id]);

  if (!ex) return <View style={styles.loader}><ActivityIndicator color={COLORS.primary} /></View>;

  return (
    <SafeAreaView style={styles.root} edges={["bottom"]} testID="exercise-detail-screen">
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <ImageBackground source={{ uri: IMAGES.barbell }} style={styles.hero} imageStyle={{ borderBottomLeftRadius: RADIUS["2xl"], borderBottomRightRadius: RADIUS["2xl"] }}>
          <LinearGradient
            colors={["rgba(10,10,10,0.5)", "rgba(10,10,10,0.95)"]}
            style={StyleSheet.absoluteFillObject}
          />
          <SafeAreaView edges={["top"]}>
            <Pressable onPress={() => router.back()} style={styles.closeBtn} testID="exercise-back" hitSlop={12}>
              <Ionicons name="chevron-back" size={24} color="#fff" />
            </Pressable>
          </SafeAreaView>
          <View style={styles.heroContent}>
            <Text style={styles.eyebrow}>{ex.category?.toUpperCase()}</Text>
            <Text style={styles.title}>{ex.name}</Text>
            <View style={styles.musclesRow}>
              {ex.muscles.map((m: string) => (
                <View key={m} style={styles.muscleChip}>
                  <Text style={styles.muscleText}>{m}</Text>
                </View>
              ))}
            </View>
          </View>
        </ImageBackground>

        <View style={styles.body}>
          <Text style={styles.sectionTitle}>Coach Tips</Text>
          {ex.tips.map((tip: string, i: number) => (
            <View key={i} style={styles.tipRow} testID={`tip-${i}`}>
              <View style={styles.tipDot}><Ionicons name="checkmark" size={12} color={COLORS.primary} /></View>
              <Text style={styles.tipText}>{tip}</Text>
            </View>
          ))}

          <Text style={[styles.sectionTitle, { marginTop: SPACING.xl }]}>Common Mistakes</Text>
          {ex.mistakes.map((m: string, i: number) => (
            <View key={i} style={styles.tipRow} testID={`mistake-${i}`}>
              <View style={[styles.tipDot, { backgroundColor: "rgba(239,68,68,0.15)" }]}>
                <Ionicons name="close" size={12} color={COLORS.danger} />
              </View>
              <Text style={styles.tipText}>{m}</Text>
            </View>
          ))}

          <View style={styles.aiCard}>
            <View style={styles.aiHeader}>
              <View style={styles.aiDot} />
              <Text style={styles.aiLabel}>APEX TIP</Text>
            </View>
            <Text style={styles.aiText}>
              Master the eccentric (lowering) phase — control it for 2-3 seconds. Most strength gains come from the eccentric, not the concentric.
            </Text>
          </View>

          <View style={styles.metaCard}>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Equipment</Text>
              <Text style={styles.metaValue}>{ex.equipment}</Text>
            </View>
            <View style={[styles.metaRow, { borderBottomWidth: 0 }]}>
              <Text style={styles.metaLabel}>Category</Text>
              <Text style={styles.metaValue}>{ex.category}</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  loader: { flex: 1, backgroundColor: COLORS.bg, alignItems: "center", justifyContent: "center" },
  scroll: { paddingBottom: SPACING["4xl"] },
  hero: { height: 320, justifyContent: "space-between" },
  closeBtn: { margin: SPACING.lg, width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center" },
  heroContent: { padding: 24 },
  eyebrow: { color: COLORS.primary, fontSize: 11, fontWeight: "700", letterSpacing: 3 },
  title: { color: "#fff", fontSize: 30, fontWeight: "700", marginTop: 6, letterSpacing: -0.5 },
  musclesRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 14 },
  muscleChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.10)", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" },
  muscleText: { color: "#fff", fontSize: 12, fontWeight: "500" },
  body: { padding: SPACING["2xl"], gap: 4 },
  sectionTitle: { color: COLORS.text, fontSize: 18, fontWeight: "600", marginBottom: 12, marginTop: 10 },
  tipRow: { flexDirection: "row", gap: 12, alignItems: "flex-start", marginBottom: 12 },
  tipDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(10,132,255,0.15)", alignItems: "center", justifyContent: "center", marginTop: 1 },
  tipText: { flex: 1, color: COLORS.text, fontSize: 14, lineHeight: 21 },
  aiCard: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.primary, borderRadius: RADIUS.xl, padding: 16, marginTop: SPACING.xl },
  aiHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  aiDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary },
  aiLabel: { color: COLORS.primary, fontSize: 10, fontWeight: "700", letterSpacing: 2 },
  aiText: { color: COLORS.text, fontSize: 14, lineHeight: 21 },
  metaCard: { marginTop: SPACING.xl, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.xl, overflow: "hidden" },
  metaRow: { flexDirection: "row", justifyContent: "space-between", padding: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  metaLabel: { color: COLORS.textSecondary, fontSize: 14, textTransform: "capitalize" },
  metaValue: { color: COLORS.text, fontSize: 14, fontWeight: "600", textTransform: "capitalize" },
});
