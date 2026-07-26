// Welcome + fast onboarding + building screens for the Plan tab.
//
// Direction B, Phase 2:
//   · Welcome offers exactly TWO actions — "Build my free plan" (primary) and
//     "Already have an account?" (secondary). There is no separate guest CTA:
//     building a plan simply works, locally, for whoever is on this device.
//   · Onboarding asks exactly THREE questions — goal, training weekdays,
//     equipment — with a "1 of 3" step mapping. Session length is not asked.
//   · Loading and failure states are composed from the shared State System.
//
// Answers persist per step through the owner-scoped plan store.

import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSemanticTokens } from "@/src/theme/semantic";
import { ThemeToggle } from "@/src/theme/ThemeToggle";
import { ActionButton, LayoutSkeleton, RetryPanel, StatusAnnouncement } from "@/src/ui/state";

import { usePlanStore } from "./planStore";
import {
  ONBOARDING_STEP_COUNT,
  STEP_WELCOME,
  WEEKDAYS,
  daysSummary,
  isStepComplete,
  stepKey,
  stepLabel,
  toggleWeekday,
} from "./onboarding";
import type { Equipment, Goal } from "./exercises";

// ---- Question data -------------------------------------------------------
const GOAL_OPTS: { k: Goal; label: string; sub: string }[] = [
  { k: "muscle", label: "Build muscle", sub: "Grow size and definition" },
  { k: "strength", label: "Get stronger", sub: "Heavy compounds, low reps" },
  { k: "fatloss", label: "Lose fat", sub: "Higher reps + a finisher" },
  { k: "general", label: "General fitness", sub: "Feel and move better" },
];

const EQUIP_PRESETS: { k: string; label: string; sub: string; equip: Equipment[] }[] = [
  { k: "gym", label: "Full gym", sub: "Everything unlocked", equip: ["db", "bb", "kb", "band", "cable", "machine", "pullup"] },
  { k: "home", label: "Home setup", sub: "Dumbbells + bands + pull-up bar", equip: ["db", "band", "pullup"] },
  { k: "body", label: "Just my body", sub: "Bodyweight only", equip: [] },
];

const EQUIP_PILLS: { k: Equipment; label: string }[] = [
  { k: "db", label: "Dumbbells" },
  { k: "bb", label: "Barbell" },
  { k: "kb", label: "Kettlebells" },
  { k: "band", label: "Bands" },
  { k: "cable", label: "Cables" },
  { k: "machine", label: "Machines" },
  { k: "pullup", label: "Pull-up bar" },
];

// ---- Welcome -------------------------------------------------------------
export function Welcome({ onStart, onSignIn }: { onStart: () => void; onSignIn: () => void }) {
  const t = useSemanticTokens();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { backgroundColor: t.color.bg, paddingTop: insets.top }]} testID="welcome">
      <View style={styles.welcomeTop}>
        <ThemeToggle />
      </View>

      <View style={styles.center}>
        <Image source={require("../../assets/images/adaptive-icon.png")} style={styles.brandMark} resizeMode="contain" />
        <Text style={[t.type.title, { color: t.color.text, marginTop: t.space.xl, textAlign: "center" }]}>
          Muscle Map <Text style={{ color: t.color.accent }}>AI</Text>
        </Text>
        <Text style={[t.type.body, { color: t.color.textSecondary, marginTop: t.space.sm, textAlign: "center" }]}>
          Learn your body. Train it smarter.
        </Text>
      </View>

      <View style={[styles.welcomeActions, { paddingBottom: insets.bottom + t.space.xl }]}>
        <ActionButton label="Build my free plan" onPress={onStart} testID="cta-build-plan" />
        <Pressable
          onPress={onSignIn}
          accessibilityRole="button"
          style={[styles.secondaryLink, { minHeight: t.target.min }]}
          testID="cta-sign-in"
        >
          <Text style={[t.type.bodyStrong, { color: t.color.textSecondary, textDecorationLine: "underline" }]}>
            Already have an account?
          </Text>
        </Pressable>
        <Text style={[t.type.caption, { color: t.color.textMuted, textAlign: "center" }]}>
          Three questions. About a minute.
        </Text>
      </View>
    </View>
  );
}

// ---- Shared onboarding shell --------------------------------------------
function Shell({
  step,
  canContinue,
  onContinue,
  onBack,
  autoAdvance,
  children,
}: {
  step: number;
  canContinue?: boolean;
  onContinue?: () => void;
  onBack: () => void;
  autoAdvance?: boolean;
  children: React.ReactNode;
}) {
  const t = useSemanticTokens();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { backgroundColor: t.color.bg, paddingTop: insets.top }]}>
      <View style={[styles.shellHeader, { paddingHorizontal: t.space.lg }]}>
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
          testID="onb-back"
          style={[styles.iconBtn, { borderColor: t.color.border, width: t.target.min, height: t.target.min }]}
        >
          <Ionicons name="chevron-back" size={20} color={t.color.textSecondary} />
        </Pressable>
        <View style={styles.progressWrap}>
          {Array.from({ length: ONBOARDING_STEP_COUNT }, (_, i) => i + 1).map((i) => (
            <View
              key={i}
              style={[styles.progressBar, { backgroundColor: i <= step ? t.color.accent : t.color.border }]}
            />
          ))}
        </View>
        <Text style={[t.type.caption, { color: t.color.textMuted }]} testID="onb-step-label">
          {stepLabel(step)}
        </Text>
        <ThemeToggle />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: t.space.xl, paddingBottom: t.space.xl }}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>

      {!autoAdvance && (
        <View style={{ paddingHorizontal: t.space.xl, paddingBottom: insets.bottom + t.space.xl }}>
          <ActionButton label="Continue" onPress={onContinue} disabled={!canContinue} testID="onb-continue" />
        </View>
      )}
    </View>
  );
}

function OptionCard({
  label,
  sub,
  selected,
  onPress,
  testID,
}: {
  label: string;
  sub?: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const t = useSemanticTokens();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      testID={testID}
      style={[
        styles.optCard,
        {
          borderRadius: t.radius.lg,
          borderColor: selected ? t.color.accent : t.color.border,
          backgroundColor: selected ? t.color.accent + "22" : t.color.surfaceAlt,
          minHeight: t.target.comfortable,
          padding: t.space.lg,
        },
      ]}
    >
      <View style={[styles.radio, { borderColor: selected ? t.color.accent : t.color.border }]}>
        {selected && <View style={[styles.radioDot, { backgroundColor: t.color.accent }]} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[t.type.subheading, { color: t.color.text }]}>{label}</Text>
        {sub ? <Text style={[t.type.caption, { color: t.color.textMuted, marginTop: 2 }]}>{sub}</Text> : null}
      </View>
    </Pressable>
  );
}

function Pill({ label, on, onPress, testID }: { label: string; on: boolean; onPress: () => void; testID?: string }) {
  const t = useSemanticTokens();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      testID={testID}
      style={{
        paddingHorizontal: t.space.lg,
        minHeight: t.target.min,
        justifyContent: "center",
        borderRadius: t.radius.pill,
        borderWidth: 1,
        borderColor: on ? t.color.accent : t.color.border,
        backgroundColor: on ? t.color.accent + "22" : t.color.surfaceAlt,
      }}
    >
      <Text style={[t.type.label, { color: on ? t.color.accent : t.color.textSecondary }]}>{label}</Text>
    </Pressable>
  );
}

// ---- The three questions -------------------------------------------------
export function Onboarding({ onComplete }: { onComplete: () => void }) {
  const t = useSemanticTokens();
  const step = usePlanStore((s) => s.step);
  const answers = usePlanStore((s) => s.answers);
  const setAnswers = usePlanStore((s) => s.setAnswers);
  const setStep = usePlanStore((s) => s.setStep);

  const key = stepKey(step);
  const canContinue = isStepComplete(step, answers);
  const advance = () => (step >= ONBOARDING_STEP_COUNT ? onComplete() : setStep(step + 1));
  const back = () => setStep(step - 1 < STEP_WELCOME ? STEP_WELCOME : step - 1);

  if (key === "goal") {
    return (
      <Shell step={step} onBack={back} autoAdvance>
        <Text style={[t.type.title, { color: t.color.text, marginTop: t.space.md }]}>What&apos;s your main goal?</Text>
        <Text style={[t.type.body, { color: t.color.textMuted, marginTop: t.space.sm }]}>
          Pick one. We&apos;ll tune sets, reps and rest to match.
        </Text>
        <View style={{ gap: t.space.md, marginTop: t.space.xl }}>
          {GOAL_OPTS.map((o) => (
            <OptionCard
              key={o.k}
              label={o.label}
              sub={o.sub}
              selected={answers.goal === o.k}
              testID={`opt-${o.k}`}
              onPress={() => {
                setAnswers({ goal: o.k });
                setStep(2);
              }}
            />
          ))}
        </View>
      </Shell>
    );
  }

  if (key === "days") {
    const days = answers.days || [];
    return (
      <Shell step={step} onBack={back} canContinue={canContinue} onContinue={advance}>
        <Text style={[t.type.title, { color: t.color.text, marginTop: t.space.md }]}>Which days can you train?</Text>
        <Text style={[t.type.body, { color: t.color.textMuted, marginTop: t.space.sm }]}>
          Tap every day that works. We place your sessions on exactly those days.
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.space.md, marginTop: t.space.xl }}>
          {WEEKDAYS.map((d) => {
            const on = days.includes(d.index);
            return (
              <Pressable
                key={d.short}
                onPress={() => setAnswers({ days: toggleWeekday(days, d.index) })}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={d.long}
                testID={`day-${d.short}`}
                style={{
                  width: 68,
                  minHeight: t.target.comfortable,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: t.radius.md,
                  borderWidth: 1,
                  borderColor: on ? t.color.accent : t.color.border,
                  backgroundColor: on ? t.color.accent + "22" : t.color.surfaceAlt,
                }}
              >
                <Text style={[t.type.label, { color: on ? t.color.accent : t.color.textSecondary }]}>{d.short}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[t.type.bodyStrong, { color: t.color.accentSoft, marginTop: t.space.lg }]} testID="days-summary">
          {days.length === 0 ? "Pick at least one day." : daysSummary(days)}
        </Text>
      </Shell>
    );
  }

  // equipment
  const equip = answers.equip || [];
  const presetMatch = (list: Equipment[]) => JSON.stringify([...equip].sort()) === JSON.stringify([...list].sort());
  return (
    <Shell step={step} onBack={back} canContinue onContinue={advance}>
      <Text style={[t.type.title, { color: t.color.text, marginTop: t.space.md }]}>What can you train with?</Text>
      <Text style={[t.type.body, { color: t.color.textMuted, marginTop: t.space.sm }]}>
        Bodyweight is always included. Toggle anything else you can use.
      </Text>
      <View style={{ gap: t.space.md, marginTop: t.space.xl }}>
        {EQUIP_PRESETS.map((p) => (
          <OptionCard
            key={p.k}
            label={p.label}
            sub={p.sub}
            selected={presetMatch(p.equip)}
            testID={`preset-${p.k}`}
            onPress={() => setAnswers({ equip: p.equip })}
          />
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.space.sm, marginTop: t.space.xl }}>
        {EQUIP_PILLS.map((p) => (
          <Pill
            key={p.k}
            label={p.label}
            on={equip.includes(p.k)}
            testID={`equip-${p.k}`}
            onPress={() =>
              setAnswers({ equip: equip.includes(p.k) ? equip.filter((x) => x !== p.k) : [...equip, p.k] })
            }
          />
        ))}
      </View>
    </Shell>
  );
}

// ---- Building (local, no network) ---------------------------------------
const BUILD_LINES = [
  "Reading your muscle map…",
  "Choosing your training split…",
  "Picking exercises for your gear…",
  "Balancing work and recovery…",
];

export function Building() {
  const t = useSemanticTokens();
  const [i, setI] = useState(0);
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ).start();
    const timer = setInterval(() => setI((x) => (x + 1) % BUILD_LINES.length), 700);
    return () => clearInterval(timer);
  }, [pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1] });

  return (
    <View style={[styles.root, { backgroundColor: t.color.bg }]} testID="plan-building">
      <View style={styles.center}>
        <Animated.View style={{ transform: [{ scale }], opacity }}>
          <Image source={require("../../assets/images/adaptive-icon.png")} style={styles.brandMark} resizeMode="contain" />
        </Animated.View>
        <Text style={[t.type.heading, { color: t.color.text, marginTop: t.space.xl }]}>Building your plan…</Text>
        <StatusAnnouncement message={BUILD_LINES[i]} />
        <Text style={[t.type.body, { color: t.color.textSecondary, marginTop: t.space.sm }]}>{BUILD_LINES[i]}</Text>
      </View>
      <View style={{ paddingHorizontal: 24, paddingBottom: 32 }}>
        <LayoutSkeleton rows={3} />
      </View>
    </View>
  );
}

/** Build failed. Every answer the user gave is still stored. */
export function PlanBuildError({ onRetry, onEdit }: { onRetry: () => void; onEdit: () => void }) {
  const t = useSemanticTokens();
  return (
    <View style={[styles.root, { backgroundColor: t.color.bg, justifyContent: "center", padding: 24 }]}>
      <RetryPanel
        title="We couldn't build your plan"
        body="Nothing was lost — your answers are still saved on this device."
        preserved={["Your goal", "Your training days", "Your equipment"]}
        retry={{ label: "Try again", onPress: onRetry, testID: "plan-build-retry" }}
        secondary={{ label: "Change my answers", onPress: onEdit, testID: "plan-build-edit" }}
        testID="plan-build-error"
      />
    </View>
  );
}

// ---- Styles --------------------------------------------------------------
const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  welcomeTop: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 24, paddingTop: 8 },
  welcomeActions: { paddingHorizontal: 24, gap: 12 },
  secondaryLink: { alignItems: "center", justifyContent: "center" },
  brandMark: { width: 132, height: 132 },
  shellHeader: { paddingTop: 8, paddingBottom: 12, flexDirection: "row", alignItems: "center", gap: 12 },
  iconBtn: { borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  progressWrap: { flex: 1, flexDirection: "row", gap: 4 },
  progressBar: { flex: 1, height: 4, borderRadius: 2 },
  optCard: { flexDirection: "row", alignItems: "center", borderWidth: 1.5 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, marginRight: 12, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
});
