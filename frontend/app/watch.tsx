// Apple Watch — onboarding, status and the Premium entry point on the iPhone.
//
// Three jobs, in this order:
//   · explain what the watch does, to everyone, including people who have not
//     subscribed — a locked screen that only refuses teaches nothing;
//   · say honestly whether the watch is paired, installed and reachable, so
//     "why is nothing syncing?" has an answer here rather than in a support
//     email;
//   · route a purchase to the iPhone paywall, which is where purchases happen.
//
// The gate itself is NOT this screen. Access is decided in the command path on
// both devices, so nothing here is load-bearing for entitlement — it only
// decides what to show.

import React, { useMemo } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { legacyPalette, LegacyPalette } from "@/src/anatomy/ui";
import { LiquidTouchableOpacity as TouchableOpacity } from "@/src/ui/LiquidTouchableOpacity";
import { LiquidSheen } from "@/src/ui/GlassSurface";
import { useTheme } from "@/src/theme/ThemeContext";
import { usePremium } from "@/src/premium/PremiumContext";
import { PREMIUM_ENTRY_COPY, gate } from "@/src/premium/entitlement";
import { useWatchLinkState } from "@/src/watch/WatchLink";

/**
 * The phrases Siri is set up to recognise. Listed verbatim because a voice
 * feature the user has to guess the wording of is a voice feature they stop
 * using after the second failure.
 */
const PHRASES: { say: string; does: string }[] = [
  { say: "Start my workout in Muscle Map", does: "Begins a session you can log from your wrist" },
  { say: "Log 8 reps in Muscle Map", does: "Uses the exercise and weight already on screen" },
  { say: "Log 8 reps at 85 kilograms", does: "Changes the weight and logs the set together" },
  { say: "Change the weight to 85 kilograms", does: "Sets what the next set will use" },
  { say: "Next exercise in Muscle Map", does: "Moves through the workout" },
  { say: "Undo my last set in Muscle Map", does: "Asks first, then removes it" },
  { say: "End my workout in Muscle Map", does: "Finishes and saves it to your iPhone" },
];

const CONTROLS: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
  { icon: "hand-left-outline", text: "Every command has a button on the watch — voice is a shortcut, not the only way." },
  { icon: "sync-outline", text: "Turn the Digital Crown to set the weight." },
  { icon: "cloud-offline-outline", text: "Sets are saved on your watch first and reach your iPhone when they reconnect." },
  { icon: "shield-checkmark-outline", text: "Nothing you say is recorded or stored — Siri passes the numbers straight to the app." },
];

export default function WatchScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { mode } = useTheme();
  const T = useMemo(() => legacyPalette(mode), [mode]);
  const styles = useMemo(() => makeStyles(T), [T]);
  const { resolution } = usePremium();
  const link = useWatchLinkState();

  const decision = gate("watch.session", resolution);
  const entry = PREMIUM_ENTRY_COPY["watch.session"];

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable style={styles.back} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" testID="watch-back">
          <Ionicons name="chevron-back" size={24} color={T.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Apple Watch</Text>
        <View style={styles.backPlaceholder} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.lede}>{entry.title}</Text>
        <Text style={styles.blurb}>{entry.body}</Text>

        {decision === "loading" ? (
          <View style={styles.statusCard} testID="watch-checking">
            <LiquidSheen tone="subtle" />
            <Ionicons name="hourglass-outline" size={18} color={T.accent} />
            <Text style={styles.statusText}>Checking your Premium access…</Text>
          </View>
        ) : decision === "locked" ? (
          <TouchableOpacity
            style={styles.upgradeCard}
            onPress={() => router.push("/(tabs)/coach")}
            accessibilityRole="button"
            accessibilityLabel="Apple Watch logging is part of Premium. See what Premium includes."
            testID="watch-premium-entry"
          >
            <LiquidSheen tone="subtle" />
            <Ionicons name="lock-closed-outline" size={18} color={T.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.upgradeTitle}>Part of Premium</Text>
              <Text style={styles.upgradeBody}>
                Your Plan, workouts, History and Insights on iPhone stay free.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={T.textFaint} />
          </TouchableOpacity>
        ) : (
          <StatusPanel styles={styles} T={T} link={link} />
        )}

        <Text style={styles.h2}>What you can say</Text>
        <View style={styles.list}>
          {PHRASES.map((p) => (
            <View key={p.say} style={styles.phraseRow}>
              <LiquidSheen tone="neutral" />
              <Ionicons name="mic-outline" size={18} color={T.accent} />
              <View style={{ flex: 1 }}>
                <Text style={styles.phraseSay}>&ldquo;{p.say}&rdquo;</Text>
                <Text style={styles.phraseDoes}>{p.does}</Text>
              </View>
            </View>
          ))}
        </View>

        <Text style={styles.h2}>How it behaves</Text>
        <View style={styles.list}>
          {CONTROLS.map((c) => (
            <View key={c.text} style={styles.phraseRow}>
              <LiquidSheen tone="neutral" />
              <Ionicons name={c.icon} size={18} color={T.accent} />
              <Text style={[styles.phraseDoes, { flex: 1 }]}>{c.text}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.footer}>
          Sets logged on your watch appear in your iPhone History like any other set, in the unit you
          use there. A workout already in progress is never interrupted, even if your watch loses
          contact with your iPhone.
        </Text>
      </ScrollView>
    </View>
  );
}

/**
 * The honest answer to "is this working?". Each line is a fact the phone can
 * actually check, so nothing here can claim a link that does not exist.
 */
function StatusPanel({
  styles,
  T,
  link,
}: {
  styles: ReturnType<typeof makeStyles>;
  T: LegacyPalette;
  link: ReturnType<typeof useWatchLinkState>;
}) {
  if (Platform.OS !== "ios" || !link.supported) {
    return (
      <View style={styles.statusCard} testID="watch-unsupported">
        <LiquidSheen tone="subtle" />
        <Ionicons name="information-circle-outline" size={18} color={T.accent} />
        <Text style={styles.statusText}>
          Apple Watch logging works from the Muscle Map app on an iPhone with a paired watch.
        </Text>
      </View>
    );
  }

  const rows: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; ok: boolean }[] = [
    { icon: "watch-outline", label: "Apple Watch paired", value: link.paired ? "Yes" : "Not paired", ok: link.paired },
    {
      icon: "download-outline",
      label: "Muscle Map installed on watch",
      value: link.watchAppInstalled ? "Installed" : "Not installed",
      ok: link.watchAppInstalled,
    },
    {
      icon: "wifi-outline",
      label: "Connected right now",
      value: link.reachable ? "Connected" : "Will sync later",
      ok: link.reachable,
    },
  ];

  return (
    <View style={styles.list} testID="watch-status">
      {rows.map((r) => (
        <View key={r.label} style={styles.phraseRow} accessibilityLabel={`${r.label}: ${r.value}`}>
          <LiquidSheen tone="neutral" />
          <Ionicons name={r.icon} size={18} color={r.ok ? T.accent : T.textFaint} />
          <Text style={[styles.phraseSay, { flex: 1 }]}>{r.label}</Text>
          <Text style={[styles.phraseDoes, { flex: 0, color: r.ok ? T.text : T.textDim }]}>{r.value}</Text>
        </View>
      ))}
      {!link.watchAppInstalled && link.paired ? (
        <Text style={styles.hint}>
          Open the Watch app on your iPhone, find Muscle Map in the list and turn it on.
        </Text>
      ) : null}
    </View>
  );
}

const makeStyles = (T: LegacyPalette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: T.bg },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 12,
      paddingBottom: 10,
    },
    back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
    backPlaceholder: { width: 40 },
    headerTitle: { color: T.text, fontSize: 17, fontWeight: "700" },
    lede: { color: T.text, fontSize: 24, fontWeight: "800", marginBottom: 8 },
    blurb: { color: T.textDim, fontSize: 14, lineHeight: 21, marginBottom: 18 },
    h2: { color: T.textDim, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 24, marginBottom: 12 },
    list: { gap: 10 },
    // Rounded containers hosting a LiquidSheen must clip it — the gradient is a
    // square at absoluteFill and otherwise squares off the corners.
    statusCard: {
      flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: T.surface,
      borderRadius: 22, paddingHorizontal: 14, paddingVertical: 13, overflow: "hidden",
    },
    statusText: { color: T.textDim, fontSize: 13, flex: 1, lineHeight: 19 },
    upgradeCard: {
      flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: T.surface,
      borderRadius: 22, paddingHorizontal: 14, paddingVertical: 14, overflow: "hidden",
    },
    upgradeTitle: { color: T.text, fontSize: 15, fontWeight: "700" },
    upgradeBody: { color: T.textDim, fontSize: 12, lineHeight: 18, marginTop: 2 },
    phraseRow: {
      flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: T.surface,
      borderRadius: 22, paddingHorizontal: 14, paddingVertical: 13, overflow: "hidden",
    },
    phraseSay: { color: T.text, fontSize: 14, fontWeight: "600" },
    phraseDoes: { color: T.textDim, fontSize: 12, lineHeight: 18, marginTop: 2 },
    hint: { color: T.textDim, fontSize: 12, lineHeight: 18, paddingHorizontal: 4, marginTop: 2 },
    footer: { color: T.textFaint, fontSize: 12, lineHeight: 19, marginTop: 26 },
  });
