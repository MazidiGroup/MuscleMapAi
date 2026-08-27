import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle as SvgCircle } from "react-native-svg";

import { useSemanticTokens } from "@/src/theme/semantic";
import { GlassSurface } from "@/src/ui/GlassSurface";
import { ScalePressable } from "@/src/ui/ScalePressable";
import { ActionButton } from "@/src/ui/state";

const VALUE_MOMENT_KEY = "mma.premium.value-moment.v1";

/** The set loop the watch owns, in the order the wrist performs it. */
const WATCH_STEPS = ["Adjust weight", "Log reps", "Track rest"];

const BENEFITS = [
  { icon: "sparkles-outline" as const, label: "Plan-aware AI Coach" },
  { icon: "cube-outline" as const, label: "Interactive 3D anatomy" },
  { icon: "school-outline" as const, label: "Guided lessons & quizzes" },
];

/**
 * The watch, drawn rather than photographed: a rounded case with a crown, and
 * inside it the real logging face — weight dial, rep stepper, Log set. Vector
 * so it stays sharp at any size and needs no image asset.
 */
function WatchMock({ accent }: { accent: string }) {
  const styles = watchStyles;
  const R = 25;
  const C = 2 * Math.PI * R;
  return (
    <View style={styles.case} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.crown, { backgroundColor: "#3A3634" }]} />
      <View style={styles.screen}>
        <Text style={styles.time}>13:53</Text>
        <Text style={styles.title} numberOfLines={1}>Cable Side Bend</Text>
        <Text style={styles.sub} numberOfLines={1}>Set 3 of 4 · Target 8</Text>

        <View style={styles.dialWrap}>
          <Svg width={64} height={64} viewBox="0 0 64 64">
            <SvgCircle cx={32} cy={32} r={R} stroke="rgba(255,255,255,0.12)" strokeWidth={4} fill="none" />
            {/* ~78% of the ring, opened at the bottom like the watch dial */}
            <SvgCircle
              cx={32}
              cy={32}
              r={R}
              stroke={accent}
              strokeWidth={4}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${C * 0.78} ${C}`}
              transform="rotate(115 32 32)"
            />
          </Svg>
          <View style={styles.dialCenter}>
            <Text style={styles.dialCaps}>WEIGHT</Text>
            <Text style={styles.dialValue}>12.5</Text>
            <Text style={styles.dialUnit}>kg</Text>
          </View>
          <View style={[styles.nub, styles.nubLeft]}><Text style={styles.nubText}>−</Text></View>
          <View style={[styles.nub, styles.nubRight]}><Text style={styles.nubText}>+</Text></View>
        </View>

        <View style={styles.reps}>
          <Text style={styles.repsSign}>−</Text>
          <Text style={styles.repsText}>8 reps</Text>
          <Text style={styles.repsSign}>+</Text>
        </View>
        <View style={[styles.logBtn, { backgroundColor: accent }]}>
          <Text style={styles.logText}>✓ Log set</Text>
        </View>
      </View>
    </View>
  );
}

const watchStyles = StyleSheet.create({
  case: {
    width: 116, height: 158, borderRadius: 30, backgroundColor: "#1C1A19",
    borderWidth: 1, borderColor: "rgba(247,243,239,0.16)", padding: 7, justifyContent: "center",
  },
  crown: { position: "absolute", right: -3, top: 52, width: 4, height: 17, borderRadius: 2 },
  screen: { flex: 1, borderRadius: 24, backgroundColor: "#000", paddingHorizontal: 7, paddingVertical: 7, alignItems: "center" },
  time: { color: "rgba(255,255,255,0.85)", fontSize: 6.5, fontWeight: "700", alignSelf: "flex-end" },
  title: { color: "#fff", fontSize: 7.5, fontWeight: "800", marginTop: 1 },
  sub: { color: "rgba(255,255,255,0.5)", fontSize: 5.5, marginTop: 0.5 },
  dialWrap: { width: 64, height: 64, alignItems: "center", justifyContent: "center", marginTop: 2 },
  dialCenter: { position: "absolute", alignItems: "center" },
  dialCaps: { color: "rgba(255,255,255,0.55)", fontSize: 4.5, fontWeight: "800", letterSpacing: 0.3 },
  dialValue: { color: "#fff", fontSize: 15, fontWeight: "800", lineHeight: 17 },
  dialUnit: { color: "rgba(255,255,255,0.6)", fontSize: 5.5, fontWeight: "700" },
  nub: {
    position: "absolute", width: 15, height: 15, borderRadius: 8,
    backgroundColor: "#2A2725", alignItems: "center", justifyContent: "center",
  },
  nubLeft: { left: -5 },
  nubRight: { right: -5 },
  nubText: { color: "rgba(255,255,255,0.9)", fontSize: 9, fontWeight: "700", lineHeight: 10 },
  reps: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    width: "100%", backgroundColor: "#1A1817", borderRadius: 9, paddingHorizontal: 6, paddingVertical: 3, marginTop: 4,
  },
  repsSign: { color: "rgba(255,255,255,0.75)", fontSize: 7.5, fontWeight: "700" },
  repsText: { color: "#fff", fontSize: 7, fontWeight: "700" },
  logBtn: { width: "100%", borderRadius: 9, paddingVertical: 4, alignItems: "center", marginTop: 3 },
  logText: { color: "#17100a", fontSize: 7.5, fontWeight: "800" },
});

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
      accessibilityLabel={`${title}. Adjust weight, log reps and track rest on Apple Watch. Preview Muscle Map Premium`}
      accessibilityHint="Shows Premium benefits and App Store subscription options"
      testID={testID}
    >
      <View style={[styles.card, compact && styles.cardCompact]}>
        {/* The warm corner glow the promo art carries. Decorative only. */}
        <LinearGradient
          colors={[t.color.accent + "4D", t.color.accent + "14", "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          locations={[0, 0.42, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        <View style={styles.topRow}>
          <View style={styles.brandMark}>
            <Ionicons name="diamond-outline" size={15} color={t.color.accent} />
          </View>
          <Text style={styles.eyebrow}>MUSCLE MAP PREMIUM</Text>
          <View style={styles.previewPill}>
            <Text style={styles.previewPillText}>PREVIEW</Text>
          </View>
        </View>

        <Text style={styles.headline}>
          Adjust. <Text style={{ color: t.color.accent }}>Log.</Text> Rest.
        </Text>
        <Text style={styles.body}>Your full set flow, right on Apple Watch.</Text>

        {!compact ? (
          <View style={styles.showcase}>
            {/* The loop, stacked so it sits beside the watch rather than
                competing with it for the card's width. */}
            <View style={styles.steps}>
              {WATCH_STEPS.map((label, i) => (
                <View key={label} style={styles.step}>
                  <View style={styles.stepNum}>
                    <Text style={styles.stepNumText}>{i + 1}</Text>
                  </View>
                  <Text style={styles.stepLabel}>{label}</Text>
                </View>
              ))}
            </View>
            <WatchMock accent={t.color.accent} />
          </View>
        ) : null}

        <View style={styles.rhythmRow}>
          <View style={styles.rhythmIcon}>
            <Ionicons name="pulse" size={13} color={t.color.accent} />
          </View>
          <Text style={styles.rhythmText}>Stay in rhythm without your phone.</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.ctaRow}>
          <Text style={styles.ctaText}>Train from your wrist</Text>
          <Ionicons name="arrow-forward" size={19} color={t.color.accent} />
        </View>
      </View>
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
    // A deliberately dark promotional surface in every theme, matching the
    // Premium promo art. The blue fill this replaced was the one colour in the
    // app that belonged to no role — it read as a system banner, not as us.
    card: {
      borderRadius: t.radius.xxl,
      padding: t.space.lg,
      gap: 10,
      overflow: "hidden",
      backgroundColor: "#141210",
      borderWidth: 1,
      borderColor: t.color.accent + "3D",
    },
    cardCompact: { padding: t.space.md, borderRadius: t.radius.xl },
    headline: { color: "#F7F3EF", fontSize: 27, fontWeight: "800", letterSpacing: -0.5, marginTop: 4 },
    body: { color: "rgba(247,243,239,0.72)", fontSize: 14.5, lineHeight: 20 },
    showcase: { flexDirection: "row", alignItems: "center", gap: t.space.md, marginTop: 8 },
    steps: { flex: 1, gap: 12 },
    step: { flexDirection: "row", alignItems: "center", gap: 10 },
    stepNum: {
      width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center",
      borderWidth: 1.5, borderColor: t.color.accent + "8A",
    },
    stepNumText: { color: t.color.accent, fontSize: 15, fontWeight: "800" },
    stepLabel: { color: "#F7F3EF", fontSize: 14, fontWeight: "700", flex: 1 },
    rhythmRow: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 4 },
    rhythmIcon: {
      width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center",
      borderWidth: 1, borderColor: t.color.accent + "6E",
    },
    rhythmText: { color: "rgba(247,243,239,0.62)", fontSize: 13.5, flex: 1 },
    divider: { height: 1, backgroundColor: "rgba(247,243,239,0.12)", marginTop: 6 },
    ctaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 },
    ctaText: { color: t.color.accent, fontSize: 17, fontWeight: "800" },
    topRow: { flexDirection: "row", alignItems: "center", gap: 7 },
    // Outlined, not filled: the card is dark in every theme, so `onAccent`
    // (which is near-black at night) would have disappeared here.
    brandMark: {
      width: 30,
      height: 30,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1.5,
      borderColor: t.color.accent + "9C",
    },
    eyebrow: { color: "#F7F3EF", fontSize: 11, fontWeight: "900", letterSpacing: 1.15, flex: 1 },
    previewPill: {
      borderRadius: t.radius.pill,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderWidth: 1.5,
      borderColor: t.color.accent + "9C",
    },
    previewPillText: { color: t.color.accent, fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
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
