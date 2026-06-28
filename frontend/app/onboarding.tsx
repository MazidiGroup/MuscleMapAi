import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { COLORS, FONT, RADIUS, SPACING } from "@/src/theme";
import { apiPost } from "@/src/api";
import { useAuth } from "@/src/auth-context";

type Step = 0 | 1 | 2 | 3 | 4;

const GOALS = [
  { id: "build_muscle", label: "Build muscle", icon: "barbell-outline", desc: "Hypertrophy focused" },
  { id: "lose_fat", label: "Lose fat", icon: "flame-outline", desc: "Body recomp + cardio" },
  { id: "strength", label: "Get stronger", icon: "flash-outline", desc: "1-6 rep max focus" },
  { id: "general_fitness", label: "Stay fit", icon: "fitness-outline", desc: "Balanced overall health" },
];

const EXP = [
  { id: "beginner", label: "Beginner", desc: "< 1 year training" },
  { id: "intermediate", label: "Intermediate", desc: "1-3 years training" },
  { id: "advanced", label: "Advanced", desc: "3+ years training" },
];

const EQUIPMENT = [
  { id: "full_gym", label: "Full gym", icon: "business-outline" },
  { id: "barbell", label: "Barbell", icon: "barbell-outline" },
  { id: "dumbbell", label: "Dumbbells", icon: "fitness-outline" },
  { id: "machines", label: "Machines", icon: "cog-outline" },
  { id: "kettlebell", label: "Kettlebells", icon: "ellipse-outline" },
  { id: "bodyweight", label: "Bodyweight only", icon: "body-outline" },
];

export default function Onboarding() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [step, setStep] = useState<Step>(0);
  const [goal, setGoal] = useState<string>("");
  const [experience, setExperience] = useState<string>("");
  const [frequency, setFrequency] = useState<number>(4);
  const [equipment, setEquipment] = useState<string[]>([]);
  const [injuries, setInjuries] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const next = () => setStep((s) => Math.min(4, (s + 1) as Step));
  const back = () => setStep((s) => Math.max(0, (s - 1) as Step));

  const canNext =
    (step === 0 && !!goal) ||
    (step === 1 && !!experience) ||
    (step === 2 && frequency >= 2) ||
    (step === 3 && equipment.length > 0) ||
    step === 4;

  const toggleEquip = (id: string) =>
    setEquipment((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const submit = async () => {
    setSubmitting(true);
    try {
      await apiPost("/onboarding", {
        goal,
        experience,
        frequency,
        equipment,
        injuries,
        units: "kg",
      });
      await refresh();
      router.replace("/(tabs)");
    } catch (e) {
      console.warn(e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <LinearGradient
        colors={["rgba(10,132,255,0.12)", "transparent"]}
        style={styles.glow}
        pointerEvents="none"
      />
      <View style={styles.header}>
        <Pressable testID="onboarding-back" onPress={step === 0 ? () => router.back() : back} hitSlop={12}>
          <Ionicons name="chevron-back" color={COLORS.text} size={26} />
        </Pressable>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${((step + 1) / 5) * 100}%` }]} />
        </View>
      </View>

      <KeyboardAwareScrollView
        bottomOffset={120}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {step === 0 && (
          <View testID="step-goal">
            <Text style={styles.eyebrow}>STEP 1 OF 5</Text>
            <Text style={styles.h1}>{`What's your goal?`}</Text>
            <Text style={styles.sub}>{`I'll build your plan around this.`}</Text>
            <View style={{ height: SPACING["2xl"] }} />
            {GOALS.map((g) => (
              <Pressable
                key={g.id}
                testID={`goal-${g.id}`}
                onPress={() => setGoal(g.id)}
                style={[styles.card, goal === g.id && styles.cardSelected]}
              >
                <View style={[styles.iconWrap, goal === g.id && styles.iconWrapSelected]}>
                  <Ionicons name={g.icon as any} size={22} color={goal === g.id ? COLORS.primary : COLORS.text} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{g.label}</Text>
                  <Text style={styles.cardDesc}>{g.desc}</Text>
                </View>
                {goal === g.id && <Ionicons name="checkmark-circle" color={COLORS.primary} size={22} />}
              </Pressable>
            ))}
          </View>
        )}

        {step === 1 && (
          <View testID="step-experience">
            <Text style={styles.eyebrow}>STEP 2 OF 5</Text>
            <Text style={styles.h1}>Experience level?</Text>
            <Text style={styles.sub}>{`So I calibrate weights & volume properly.`}</Text>
            <View style={{ height: SPACING["2xl"] }} />
            {EXP.map((e) => (
              <Pressable
                key={e.id}
                testID={`exp-${e.id}`}
                onPress={() => setExperience(e.id)}
                style={[styles.card, experience === e.id && styles.cardSelected]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{e.label}</Text>
                  <Text style={styles.cardDesc}>{e.desc}</Text>
                </View>
                {experience === e.id && <Ionicons name="checkmark-circle" color={COLORS.primary} size={22} />}
              </Pressable>
            ))}
          </View>
        )}

        {step === 2 && (
          <View testID="step-frequency">
            <Text style={styles.eyebrow}>STEP 3 OF 5</Text>
            <Text style={styles.h1}>How many days{"\n"}per week?</Text>
            <Text style={styles.sub}>{`Be realistic — I'll adapt the split.`}</Text>
            <View style={{ height: SPACING["3xl"] }} />
            <View style={styles.freqRow}>
              {[2, 3, 4, 5, 6].map((n) => (
                <Pressable
                  key={n}
                  testID={`freq-${n}`}
                  onPress={() => setFrequency(n)}
                  style={[styles.freqChip, frequency === n && styles.freqChipSelected]}
                >
                  <Text style={[styles.freqText, frequency === n && styles.freqTextSelected]}>{n}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.freqHint}>
              {frequency <= 3 ? "Full-body split — great for beginners" : "Upper/Lower split — ideal for progression"}
            </Text>
          </View>
        )}

        {step === 3 && (
          <View testID="step-equipment">
            <Text style={styles.eyebrow}>STEP 4 OF 5</Text>
            <Text style={styles.h1}>Available equipment?</Text>
            <Text style={styles.sub}>Select all you have access to.</Text>
            <View style={{ height: SPACING["2xl"] }} />
            <View style={styles.equipGrid}>
              {EQUIPMENT.map((e) => (
                <Pressable
                  key={e.id}
                  testID={`equip-${e.id}`}
                  onPress={() => toggleEquip(e.id)}
                  style={[styles.equipCard, equipment.includes(e.id) && styles.equipCardSelected]}
                >
                  <Ionicons
                    name={e.icon as any}
                    size={22}
                    color={equipment.includes(e.id) ? COLORS.primary : COLORS.text}
                  />
                  <Text style={[styles.equipLabel, equipment.includes(e.id) && { color: COLORS.primary }]}>
                    {e.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {step === 4 && (
          <View testID="step-injuries">
            <Text style={styles.eyebrow}>STEP 5 OF 5</Text>
            <Text style={styles.h1}>Any injuries{"\n"}or limitations?</Text>
            <Text style={styles.sub}>{`Optional. I'll adapt around them.`}</Text>
            <View style={{ height: SPACING["2xl"] }} />
            <TextInput
              testID="injuries-input"
              value={injuries}
              onChangeText={setInjuries}
              placeholder="e.g. lower back tweak, dodgy shoulder…"
              placeholderTextColor={COLORS.textTertiary}
              multiline
              style={styles.textarea}
            />
            <Text style={styles.tip}>You can update this anytime from Profile.</Text>
          </View>
        )}
      </KeyboardAwareScrollView>

      <View style={styles.footer}>
        {step < 4 ? (
          <Pressable
            testID="onboarding-next"
            onPress={next}
            disabled={!canNext}
            style={[styles.cta, !canNext && styles.ctaDisabled]}
          >
            <Text style={styles.ctaText}>Continue</Text>
            <Ionicons name="arrow-forward" color="#fff" size={18} />
          </Pressable>
        ) : (
          <Pressable testID="onboarding-finish" onPress={submit} disabled={submitting} style={styles.cta}>
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>Generate my plan</Text>}
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  glow: { position: "absolute", top: 0, left: 0, right: 0, height: 280 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: SPACING["2xl"], paddingTop: SPACING.md, gap: 16 },
  progressTrack: { flex: 1, height: 3, backgroundColor: COLORS.surfaceElevated, borderRadius: 999, overflow: "hidden" },
  progressFill: { height: 3, backgroundColor: COLORS.primary, borderRadius: 999 },
  scroll: { padding: SPACING["2xl"], paddingBottom: 160 },
  eyebrow: { color: COLORS.primary, fontSize: 11, fontWeight: "700", letterSpacing: 3, marginBottom: 12 },
  h1: { color: COLORS.text, fontSize: 34, fontWeight: "700", lineHeight: 40, letterSpacing: -0.5 },
  sub: { color: COLORS.textSecondary, fontSize: 16, marginTop: 12, lineHeight: 22 },
  card: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.xl, padding: 18, marginBottom: 12 },
  cardSelected: { borderColor: COLORS.primary, backgroundColor: "rgba(10,132,255,0.08)" },
  iconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.surfaceElevated },
  iconWrapSelected: { backgroundColor: "rgba(10,132,255,0.18)" },
  cardTitle: { color: COLORS.text, fontSize: 17, fontWeight: "600" },
  cardDesc: { color: COLORS.textSecondary, fontSize: 13, marginTop: 2 },
  freqRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  freqChip: { flex: 1, height: 72, borderRadius: RADIUS.xl, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: "center", justifyContent: "center" },
  freqChipSelected: { borderColor: COLORS.primary, backgroundColor: "rgba(10,132,255,0.10)" },
  freqText: { color: COLORS.text, fontSize: 24, fontWeight: "700" },
  freqTextSelected: { color: COLORS.primary },
  freqHint: { color: COLORS.textSecondary, fontSize: 14, marginTop: SPACING.xl, textAlign: "center" },
  equipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  equipCard: { width: "47%", flexDirection: "column", gap: 10, padding: 16, borderRadius: RADIUS.xl, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  equipCardSelected: { borderColor: COLORS.primary, backgroundColor: "rgba(10,132,255,0.08)" },
  equipLabel: { color: COLORS.text, fontSize: 14, fontWeight: "600" },
  textarea: { backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: 16, color: COLORS.text, fontSize: 16, minHeight: 110, borderWidth: 1, borderColor: COLORS.border, textAlignVertical: "top" },
  tip: { color: COLORS.textTertiary, fontSize: 12, marginTop: 12 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: SPACING["2xl"], paddingBottom: SPACING["3xl"], backgroundColor: COLORS.bg, borderTopWidth: 1, borderTopColor: COLORS.border },
  cta: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.primary, paddingVertical: 16, borderRadius: RADIUS.full },
  ctaDisabled: { opacity: 0.35 },
  ctaText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
