// Onboarding + welcome + building screens for the Plan tab.
//
// Single-select steps auto-advance ~300 ms after tap; multi-select steps
// (days, equipment) use a Continue button. All copy and colours come from the
// design hand-off. Answers persist per-step in the store.

import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Animated, Easing, Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "@/src/theme/ThemeContext";
import { ThemeToggle } from "@/src/theme/ThemeToggle";
import { S, R } from "@/src/theme/tokens"; // eslint-disable-line @typescript-eslint/no-unused-vars
import { usePlanStore } from "./planStore";
import type { Answers, Goal, Experience, Equipment, Region } from "./exercises";

// ---- Data ----------------------------------------------------------------
const GOAL_OPTS: { k: Goal; label: string; sub: string }[] = [
  { k: "muscle",   label: "Build muscle",     sub: "Grow size and definition" },
  { k: "strength", label: "Get stronger",     sub: "Heavy compounds, low reps" },
  { k: "fatloss",  label: "Lose fat",         sub: "Higher reps + a finisher" },
  { k: "general",  label: "General fitness",  sub: "Feel and move better" },
];
const EXP_OPTS: { k: Experience; label: string; sub: string }[] = [
  { k: "beginner",     label: "New to lifting",   sub: "Less than 6 months" },
  { k: "intermediate", label: "Some experience",  sub: "6 months – 2 years" },
  { k: "advanced",     label: "Experienced",      sub: "2+ years training" },
];
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const EQUIP_PRESETS = [
  { k: "gym",  label: "Full gym",     sub: "Everything unlocked",
    equip: ["db","bb","kb","band","cable","machine","pullup"] as Equipment[] },
  { k: "home", label: "Home setup",   sub: "Dumbbells + bands + pull-up bar",
    equip: ["db","band","pullup"] as Equipment[] },
  { k: "body", label: "Just my body", sub: "Bodyweight only",
    equip: [] as Equipment[] },
];
const EQUIP_PILLS: { k: Equipment; label: string }[] = [
  { k: "db",     label: "Dumbbells" },
  { k: "bb",     label: "Barbell" },
  { k: "kb",     label: "Kettlebells" },
  { k: "band",   label: "Bands" },
  { k: "cable",  label: "Cables" },
  { k: "machine",label: "Machines" },
  { k: "pullup", label: "Pull-up bar" },
];
const REGION_OPTS: { k: Region; label: string }[] = [
  { k: "chest",     label: "Chest" },
  { k: "shoulders", label: "Shoulders" },
  { k: "arms",      label: "Arms" },
  { k: "back",      label: "Back" },
  { k: "core",      label: "Core" },
  { k: "glutes",    label: "Glutes" },
  { k: "legs",      label: "Legs" },
];

// ---- Welcome -------------------------------------------------------------
export function Welcome() {
  const { T, mode, toggleTheme } = useTheme();
  const setStep = usePlanStore(s => s.setStep);

  return (
    <View style={[styles.root, { backgroundColor: T.bg }]}>
      <TouchableOpacity
        style={[styles.themeBtn, { borderColor: T.border, backgroundColor: T.card }]}
        onPress={toggleTheme}
        testID="theme-toggle"
        accessibilityRole="button"
        accessibilityLabel="Toggle day and night mode"
      >
        <Ionicons name={mode === "night" ? "sunny" : "moon"} size={18} color={T.text2} />
      </TouchableOpacity>

      <View style={styles.center}>
        <Image
          source={require("../../assets/images/adaptive-icon.png")}
          style={styles.brandMark}
          resizeMode="contain"
        />
        <Text style={[styles.brandName, { color: T.text }]}>Muscle Map <Text style={{ color: T.accent }}>AI</Text></Text>
        <Text style={[styles.brandTag, { color: T.text2 }]}>Learn your body. Train it smarter.</Text>

        <TouchableOpacity
          style={[styles.ctaBtn, { backgroundColor: T.accent }]}
          onPress={() => setStep(1)}
          testID="cta-build-plan"
        >
          <Text style={[styles.ctaText, { color: T.ctaText }]}>Build my plan</Text>
        </TouchableOpacity>

        <Text style={[styles.brandFoot, { color: T.textMuted }]}>Takes about a minute</Text>
      </View>
    </View>
  );
}

// ---- Shared onboarding shell --------------------------------------------
function Shell({ step, canContinue, onContinue, onBack, autoAdvance, children }: {
  step: number;
  canContinue?: boolean;
  onContinue?: () => void;
  onBack?: () => void;
  autoAdvance?: boolean;
  children: React.ReactNode;
}) {
  const { T } = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: T.bg }]}>
      <View style={styles.shellHeader}>
        {onBack ? (
          <TouchableOpacity
            style={[styles.backBtn, { borderColor: T.border }]}
            onPress={onBack}
            accessibilityLabel="Back"
            testID="onb-back"
          >
            <Ionicons name="chevron-back" size={20} color={T.text2} />
          </TouchableOpacity>
        ) : <View style={styles.backBtn} />}
        <View style={styles.progressWrap}>
          {[1,2,3,4,5,6].map(i => (
            <View
              key={i}
              style={[
                styles.progressBar,
                { backgroundColor: i <= step ? T.accent : T.border },
              ]}
            />
          ))}
        </View>
        <Text style={[styles.stepCount, { color: T.textMuted }]}>{step}/6</Text>
        <ThemeToggle />
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.stepScroll} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      {!autoAdvance && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.ctaBtn,
              { backgroundColor: canContinue ? T.accent : T.border, opacity: canContinue ? 1 : 0.6 },
            ]}
            disabled={!canContinue}
            onPress={onContinue}
            testID="onb-continue"
          >
            <Text style={[styles.ctaText, { color: canContinue ? T.ctaText : T.textFaint }]}>Continue</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ---- Option card (reused across steps) -----------------------------------
function OptionCard<T extends string>({ k, label, sub, selected, onPress, testID }: {
  k: T; label: string; sub?: string; selected: boolean; onPress: () => void; testID?: string;
}) {
  const { T: theme } = useTheme();
  return (
    <TouchableOpacity
      style={[
        styles.optCard,
        {
          borderColor: selected ? theme.accent : theme.border,
          backgroundColor: selected ? theme.accent + "22" : theme.cardAlt,
        },
      ]}
      onPress={onPress}
      testID={testID || `opt-${k}`}
    >
      <View style={[styles.radio, { borderColor: selected ? theme.accent : theme.border }]}>
        {selected && <View style={[styles.radioDot, { backgroundColor: theme.accent }]} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.optLabel, { color: theme.text }]}>{label}</Text>
        {sub && <Text style={[styles.optSub, { color: theme.textMuted }]}>{sub}</Text>}
      </View>
    </TouchableOpacity>
  );
}

// ---- Step 1: Goal --------------------------------------------------------
export function StepGoal() {
  const { answers, setAnswers, setStep } = usePlanStore();
  const { T } = useTheme();
  return (
    <Shell step={1} onBack={() => setStep(0)} autoAdvance>
      <Text style={[styles.stepTitle, { color: T.text }]}>What&apos;s your main goal?</Text>
      <Text style={[styles.stepSub, { color: T.textMuted }]}>Pick one. We&apos;ll tune sets, reps, and rest to match.</Text>
      <View style={{ gap: 10, marginTop: 20 }}>
        {GOAL_OPTS.map(o => (
          <OptionCard
            key={o.k}
            k={o.k}
            label={o.label}
            sub={o.sub}
            selected={answers.goal === o.k}
            onPress={() => {
              setAnswers({ goal: o.k });
              setTimeout(() => setStep(2), 300);
            }}
          />
        ))}
      </View>
    </Shell>
  );
}

// ---- Step 2: Experience --------------------------------------------------
export function StepExp() {
  const { answers, setAnswers, setStep } = usePlanStore();
  const { T } = useTheme();
  return (
    <Shell step={2} onBack={() => setStep(1)} autoAdvance>
      <Text style={[styles.stepTitle, { color: T.text }]}>How much experience do you have?</Text>
      <Text style={[styles.stepSub, { color: T.textMuted }]}>This tunes the difficulty of the moves we pick.</Text>
      <View style={{ gap: 10, marginTop: 20 }}>
        {EXP_OPTS.map(o => (
          <OptionCard
            key={o.k}
            k={o.k}
            label={o.label}
            sub={o.sub}
            selected={answers.exp === o.k}
            onPress={() => {
              setAnswers({ exp: o.k });
              setTimeout(() => setStep(3), 300);
            }}
          />
        ))}
      </View>
    </Shell>
  );
}

// ---- Step 3: Training days -----------------------------------------------
export function StepDays() {
  const { answers, setAnswers, setStep } = usePlanStore();
  const { T } = useTheme();
  const days = answers.days || [];
  const toggle = (i: number) => {
    const next = days.includes(i) ? days.filter(x => x !== i) : [...days, i].sort();
    setAnswers({ days: next });
  };
  const coach =
    days.length === 0 ? "Pick the days you can realistically train." :
    days.length === 1 ? "Once a week is a solid start — every week counts." :
    days.length === 2 ? "Two days — full-body sessions will hit everything." :
    days.length === 3 ? "Three days — the sweet spot for most people." :
    days.length === 4 ? "Four days — enough room for an Upper/Lower split." :
    days.length === 5 ? "Five days — hybrid PPL gives you variety." :
    days.length === 6 ? "Six days — full PPL twice a week, high frequency." :
    "Seven days — hit that hard? We'll pace the recovery.";
  return (
    <Shell
      step={3}
      onBack={() => setStep(2)}
      canContinue={days.length >= 1}
      onContinue={() => setStep(4)}
    >
      <Text style={[styles.stepTitle, { color: T.text }]}>How many days a week can you train?</Text>
      <Text style={[styles.stepSub, { color: T.textMuted }]}>Tap all the days that work — we&apos;ll place your sessions on them.</Text>
      <View style={styles.dayGrid}>
        {DAY_LABELS.map((d, i) => {
          const selected = days.includes(i);
          return (
            <TouchableOpacity
              key={d}
              style={[
                styles.dayChip,
                {
                  borderColor: selected ? T.accent : T.border,
                  backgroundColor: selected ? T.accent + "22" : T.cardAlt,
                },
              ]}
              onPress={() => toggle(i)}
              testID={`day-${d}`}
            >
              <Text style={[styles.dayChipText, { color: selected ? T.accent : T.text2 }]}>{d}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={[styles.coachLine, { color: T.accentText }]}>{coach}</Text>
    </Shell>
  );
}

// ---- Step 4: Equipment ---------------------------------------------------
export function StepEquip() {
  const { answers, setAnswers, setStep } = usePlanStore();
  const { T } = useTheme();
  const equip = answers.equip || [];
  const togglePill = (k: Equipment) => {
    const next = equip.includes(k) ? equip.filter(x => x !== k) : [...equip, k];
    setAnswers({ equip: next });
  };
  const applyPreset = (list: Equipment[]) => setAnswers({ equip: list });

  return (
    <Shell
      step={4}
      onBack={() => setStep(3)}
      canContinue
      onContinue={() => setStep(5)}
    >
      <Text style={[styles.stepTitle, { color: T.text }]}>What do you have available?</Text>
      <Text style={[styles.stepSub, { color: T.textMuted }]}>Bodyweight is always included. Toggle anything else you can use.</Text>

      <View style={{ gap: 10, marginTop: 18 }}>
        {EQUIP_PRESETS.map(p => (
          <OptionCard
            key={p.k}
            k={p.k}
            label={p.label}
            sub={p.sub}
            selected={JSON.stringify([...equip].sort()) === JSON.stringify([...p.equip].sort())}
            onPress={() => applyPreset(p.equip)}
            testID={`preset-${p.k}`}
          />
        ))}
      </View>

      <View style={styles.pillWrap}>
        {EQUIP_PILLS.map(p => {
          const on = equip.includes(p.k);
          return (
            <TouchableOpacity
              key={p.k}
              style={[
                styles.pill,
                { borderColor: on ? T.accent : T.border, backgroundColor: on ? T.accent + "22" : T.cardAlt },
              ]}
              onPress={() => togglePill(p.k)}
              testID={`equip-${p.k}`}
            >
              <Text style={[styles.pillText, { color: on ? T.accent : T.text2 }]}>{p.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </Shell>
  );
}

// ---- Step 5: Focus muscles (max 3) --------------------------------------
export function StepFocus() {
  const { answers, setAnswers, setStep } = usePlanStore();
  const { T } = useTheme();
  const focus = answers.focus || [];
  const toggle = (k: Region) => {
    if (focus.includes(k)) setAnswers({ focus: focus.filter(x => x !== k) });
    else if (focus.length < 3) setAnswers({ focus: [...focus, k] });
  };
  return (
    <Shell
      step={5}
      onBack={() => setStep(4)}
      canContinue
      onContinue={() => setStep(6)}
    >
      <Text style={[styles.stepTitle, { color: T.text }]}>Any regions you want to focus on?</Text>
      <Text style={[styles.stepSub, { color: T.textMuted }]}>Pick up to three. Or tap the balanced option to skip.</Text>
      <TouchableOpacity
        style={[styles.balancedBtn, { borderColor: T.border, backgroundColor: focus.length === 0 ? T.accent + "22" : T.cardAlt }]}
        onPress={() => setAnswers({ focus: [] })}
        testID="focus-balanced"
      >
        <Ionicons name="scale-outline" size={18} color={T.text2} />
        <Text style={[styles.optLabel, { color: T.text, marginLeft: 10 }]}>Keep it balanced — no focus</Text>
      </TouchableOpacity>
      <View style={styles.pillWrap}>
        {REGION_OPTS.map(r => {
          const on = focus.includes(r.k);
          return (
            <TouchableOpacity
              key={r.k}
              style={[
                styles.pill,
                { borderColor: on ? T.accent : T.border, backgroundColor: on ? T.accent + "22" : T.cardAlt },
              ]}
              onPress={() => toggle(r.k)}
              testID={`focus-${r.k}`}
            >
              <Text style={[styles.pillText, { color: on ? T.accent : T.text2 }]}>{r.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {focus.length > 0 && (
        <Text style={[styles.hint, { color: T.textMuted }]}>
          Focus: {focus.map(f => REGION_OPTS.find(o => o.k === f)?.label).join(" · ")}
        </Text>
      )}
    </Shell>
  );
}

// ---- Step 6: Posture -----------------------------------------------------
export function StepPosture() {
  const { answers, setAnswers, setStep, rebuildFromAnswers } = usePlanStore();
  const { T } = useTheme();

  const finish = (posture: boolean) => {
    const final: Answers = {
      goal: (answers.goal || "general") as Goal,
      exp: (answers.exp || "beginner") as Experience,
      days: answers.days && answers.days.length ? answers.days : [1, 3, 5],
      equip: answers.equip || [],
      focus: answers.focus || [],
      posture,
    };
    setAnswers({ posture });
    setStep(7);
    setTimeout(() => {
      try {
        rebuildFromAnswers(final);
      } catch (e) {
        // Keep the user on the Building screen and log; a shipping error boundary
        // in the tab shell recovers to Welcome on next open.
        // eslint-disable-next-line no-console
        console.error("[Plan] buildPlan failed:", e);
        setStep(0);
      }
    }, 2400);
  };

  return (
    <Shell step={6} onBack={() => setStep(5)} autoAdvance>
      <Text style={[styles.stepTitle, { color: T.text }]}>Want to work on your posture?</Text>
      <Text style={[styles.stepSub, { color: T.textMuted }]}>We&apos;ll add one posture-focused move per session (face-pulls, glute activations, etc).</Text>
      <View style={{ gap: 12, marginTop: 18 }}>
        <OptionCard k="yes" label="Yes, add posture work" sub="One extra exercise per training day" selected={answers.posture === true} onPress={() => finish(true)} />
        <OptionCard k="no" label="No thanks" sub="Skip posture, focus on my goal" selected={answers.posture === false} onPress={() => finish(false)} />
      </View>
    </Shell>
  );
}

// ---- Building (transition) -----------------------------------------------
const BUILD_LINES = [
  "Reading your muscle map…",
  "Choosing your training split…",
  "Picking exercises for your gear…",
  "Balancing work and recovery…",
];

export function Building() {
  const { T } = useTheme();
  const [i, setI] = useState(0);
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ).start();
    const t = setInterval(() => setI(x => (x + 1) % BUILD_LINES.length), 600);
    return () => clearInterval(t);
  }, [pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1] });

  return (
    <View style={[styles.root, { backgroundColor: T.bg, alignItems: "center", justifyContent: "center" }]}>
      <Animated.View style={{ transform: [{ scale }], opacity }}>
        <Image
          source={require("../../assets/images/adaptive-icon.png")}
          style={styles.brandMark}
          resizeMode="contain"
        />
      </Animated.View>
      <Text style={[styles.brandName, { color: T.text, marginTop: 22 }]}>Building your plan…</Text>
      <Text style={[styles.brandTag, { color: T.text2, marginTop: 8 }]}>{BUILD_LINES[i]}</Text>
    </View>
  );
}

// ---- Styles --------------------------------------------------------------
const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  themeBtn: {
    position: "absolute", top: 60, right: 24, width: 36, height: 36, borderRadius: 18,
    borderWidth: 1, alignItems: "center", justifyContent: "center", zIndex: 10,
  },
  brandMark: { width: 132, height: 132 },
  brandName: { fontSize: 29, fontWeight: "700", marginTop: 22, letterSpacing: 0.2 },
  brandTag: { fontSize: 15, marginTop: 8, textAlign: "center" },
  brandFoot: { fontSize: 12, marginTop: 14 },
  ctaBtn: { paddingHorizontal: 28, paddingVertical: 14, borderRadius: R.lg, marginTop: 34 },
  ctaText: { fontSize: 16, fontWeight: "800", letterSpacing: 0.2 },

  shellHeader: {
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12,
    flexDirection: "row", alignItems: "center", gap: 12,
  },
  backBtn: { width: 34, height: 34, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  progressWrap: { flex: 1, flexDirection: "row", gap: 4 },
  progressBar: { flex: 1, height: 4, borderRadius: 2 },
  stepCount: { fontSize: 12, width: 26, textAlign: "right", fontVariant: ["tabular-nums"] },

  stepScroll: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24 },
  stepTitle: { fontSize: 24, fontWeight: "700", marginTop: 12 },
  stepSub: { fontSize: 14, marginTop: 8, lineHeight: 20 },
  coachLine: { fontSize: 13, marginTop: 14, fontStyle: "italic" },
  hint: { fontSize: 13, marginTop: 14 },

  optCard: {
    flexDirection: "row", alignItems: "center", padding: 16, borderRadius: R.lg, borderWidth: 1.5,
  },
  radio: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 2, marginRight: 12,
    alignItems: "center", justifyContent: "center",
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  optLabel: { fontSize: 15, fontWeight: "700" },
  optSub: { fontSize: 12, marginTop: 3 },

  dayGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 20 },
  dayChip: { width: 66, paddingVertical: 12, borderRadius: 12, borderWidth: 1, alignItems: "center" },
  dayChipText: { fontSize: 13, fontWeight: "700" },

  pillWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 20 },
  pill: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: R.pill, borderWidth: 1 },
  pillText: { fontSize: 13, fontWeight: "700" },

  balancedBtn: {
    flexDirection: "row", alignItems: "center", padding: 14, borderRadius: R.lg,
    borderWidth: 1, marginTop: 18,
  },

  footer: { paddingHorizontal: 24, paddingBottom: 32, paddingTop: 8 },
});
