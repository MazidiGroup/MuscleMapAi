import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";

import { useSemanticTokens } from "@/src/theme/semantic";
import { GlassSurface } from "@/src/ui/GlassSurface";
import { ScalePressable } from "@/src/ui/ScalePressable";
import { ActionButton } from "@/src/ui/state";

const VALUE_MOMENT_KEY = "mma.premium.value-moment.v1";

const BENEFITS = [
  { icon: "sparkles-outline" as const, label: "Plan-aware AI Coach" },
  { icon: "cube-outline" as const, label: "Interactive 3D anatomy" },
  { icon: "school-outline" as const, label: "Guided lessons & quizzes" },
];

export function PremiumDiscoveryCard({
  onPress,
  contextTitle,
  compact = false,
  testID = "premium-discovery",
}: {
  onPress: () => void;
  contextTitle?: string;
  compact?: boolean;
  testID?: string;
}) {
  const t = useSemanticTokens();
  const styles = useMemo(() => makeStyles(t), [t]);
  const title = contextTitle
    ? `Get coaching for ${contextTitle}`
    : "Make every workout easier to understand";

  return (
    <ScalePressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. Preview Muscle Map Premium`}
      accessibilityHint="Shows Premium benefits and App Store subscription options"
      testID={testID}
    >
      <GlassSurface style={[styles.card, compact && styles.cardCompact]} intensity={44} tone="accent">
        <View style={styles.topRow}>
          <View style={styles.brandMark}>
            <Ionicons name="diamond-outline" size={18} color={t.color.onAccent} />
          </View>
          <Text style={styles.eyebrow}>MUSCLE MAP PREMIUM</Text>
          <View style={styles.previewPill}>
            <Text style={styles.previewPillText}>PREVIEW</Text>
          </View>
        </View>

        <Text style={[styles.title, compact && styles.titleCompact]}>{title}</Text>
        <Text style={styles.body}>
          Ask why an exercise is in your plan, what to change when equipment is busy, and see the exact muscles in 3D.
        </Text>

        {!compact ? (
          <View style={styles.benefits}>
            {BENEFITS.slice(0, 2).map((benefit) => (
              <View key={benefit.label} style={styles.benefit}>
                <Ionicons name={benefit.icon} size={15} color={t.color.onAccent} />
                <Text style={styles.benefitText}>{benefit.label}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.ctaRow}>
          <Text style={styles.ctaText}>See what Premium adds</Text>
          <Ionicons name="arrow-forward" size={17} color={t.color.onAccent} />
        </View>
      </GlassSurface>
    </ScalePressable>
  );
}

/**
 * One respectful value-moment prompt after a plan exists. It is stored locally
 * and never repeats after either action, avoiding a nagging paywall loop.
 */
export function PremiumValueMoment({
  enabled,
  planName,
  onPreview,
}: {
  enabled: boolean;
  planName?: string;
  onPreview: () => void;
}) {
  const t = useSemanticTokens();
  const styles = useMemo(() => makeStyles(t), [t]);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (!enabled) return () => { active = false; };

    AsyncStorage.getItem(VALUE_MOMENT_KEY)
      .then((seen) => {
        if (!active || seen) return;
        timer = setTimeout(() => active && setVisible(true), 900);
      })
      .catch(() => {});

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [enabled]);

  const finish = (outcome: "previewed" | "continued-free") => {
    setVisible(false);
    AsyncStorage.setItem(VALUE_MOMENT_KEY, outcome).catch(() => {});
  };

  const preview = () => {
    finish("previewed");
    onPreview();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => finish("continued-free")}>
      <View style={styles.backdrop}>
        <GlassSurface style={styles.prompt} intensity={68} testID="premium-value-moment">
          <View style={styles.promptIcon}>
            <Ionicons name="sparkles" size={24} color={t.color.accentSoft} />
          </View>
          <Text style={styles.promptEyebrow}>YOUR PLAN IS READY</Text>
          <Text style={styles.promptTitle}>Now make it explain itself.</Text>
          <Text style={styles.promptBody}>
            {planName
              ? `Premium helps you understand and adapt ${planName}, instead of simply following it.`
              : "Premium helps you understand and adapt your training, instead of simply following it."}
          </Text>

          <View style={styles.promptBenefits}>
            {BENEFITS.map((benefit) => (
              <View key={benefit.label} style={styles.promptBenefit}>
                <View style={styles.check}>
                  <Ionicons name="checkmark" size={13} color={t.color.onAccent} />
                </View>
                <Text style={styles.promptBenefitText}>{benefit.label}</Text>
              </View>
            ))}
          </View>

          <ActionButton label="Preview Premium" onPress={preview} testID="premium-value-preview" />
          <ActionButton
            label="Continue with my free plan"
            variant="secondary"
            onPress={() => finish("continued-free")}
            testID="premium-value-dismiss"
          />
          <Text style={styles.promptNote}>You’ll see App Store pricing before any purchase.</Text>
        </GlassSurface>
      </View>
    </Modal>
  );
}

const makeStyles = (t: ReturnType<typeof useSemanticTokens>) =>
  StyleSheet.create({
    card: {
      borderRadius: t.radius.xxl,
      padding: t.space.lg,
      gap: t.space.sm,
      backgroundColor: t.mode === "day" ? "rgba(26,113,229,0.92)" : "rgba(56,145,255,0.88)",
    },
    cardCompact: { padding: t.space.md, borderRadius: t.radius.xl },
    topRow: { flexDirection: "row", alignItems: "center", gap: 7 },
    brandMark: {
      width: 30,
      height: 30,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(255,255,255,0.15)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.23)",
    },
    eyebrow: { color: t.color.onAccent, fontSize: 10, fontWeight: "900", letterSpacing: 1.05, flex: 1 },
    previewPill: {
      borderRadius: t.radius.pill,
      paddingHorizontal: 8,
      paddingVertical: 4,
      backgroundColor: "rgba(255,255,255,0.16)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.22)",
    },
    previewPillText: { color: t.color.onAccent, fontSize: 8.5, fontWeight: "900", letterSpacing: 0.65 },
    title: { color: t.color.onAccent, fontSize: 21, lineHeight: 26, fontWeight: "800", marginTop: 2 },
    titleCompact: { fontSize: 18, lineHeight: 23 },
    body: { color: t.color.onAccent, fontSize: 13, lineHeight: 19, opacity: 0.86 },
    benefits: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 2 },
    benefit: {
      minHeight: 34,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
      borderRadius: t.radius.pill,
      backgroundColor: "rgba(8,24,48,0.18)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.18)",
    },
    benefitText: { color: t.color.onAccent, fontSize: 10.5, fontWeight: "700" },
    ctaRow: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: "rgba(255,255,255,0.25)",
      marginTop: 3,
      paddingTop: 9,
    },
    ctaText: { color: t.color.onAccent, fontSize: 13, fontWeight: "800" },
    backdrop: {
      flex: 1,
      justifyContent: "center",
      padding: t.space.lg,
      backgroundColor: t.mode === "day" ? "rgba(20,31,48,0.48)" : "rgba(0,0,0,0.72)",
    },
    prompt: {
      width: "100%",
      maxWidth: 430,
      alignSelf: "center",
      borderRadius: 28,
      padding: t.space.xl,
      gap: t.space.md,
    },
    promptIcon: {
      width: 52,
      height: 52,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: t.color.surfaceAlt,
      borderWidth: 1,
      borderColor: t.color.border,
    },
    promptEyebrow: { color: t.color.accentSoft, fontSize: 10, fontWeight: "900", letterSpacing: 1.15 },
    promptTitle: { color: t.color.text, fontSize: 25, lineHeight: 30, fontWeight: "800" },
    promptBody: { color: t.color.textSecondary, fontSize: 14, lineHeight: 21 },
    promptBenefits: { gap: t.space.sm, marginVertical: 2 },
    promptBenefit: { flexDirection: "row", alignItems: "center", gap: t.space.sm },
    check: {
      width: 23,
      height: 23,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: t.color.accent,
    },
    promptBenefitText: { color: t.color.text, fontSize: 13, lineHeight: 18, fontWeight: "700", flex: 1 },
    promptNote: { color: t.color.textMuted, fontSize: 10.5, lineHeight: 15, textAlign: "center" },
  });
