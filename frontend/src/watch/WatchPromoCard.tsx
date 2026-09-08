// A small Apple Watch prompt on Today — the one screen every subscriber lands on.
//
// It says the one thing a person with a watch needs to hear (open Muscle Map on
// the wrist during a session and the sets log themselves) and shows the actual
// logging face, drawn rather than photographed so it is sharp at any size and
// needs no image asset. It steps aside on its own once the watch app is
// installed on a paired watch, and a person without a watch can dismiss it for
// good. iOS only: the companion exists nowhere else.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { WatchMock } from "@/src/premium/PremiumDiscovery";
import { useSemanticTokens } from "@/src/theme/semantic";
import { LiquidSheen } from "@/src/ui/GlassSurface";
import { ScalePressable } from "@/src/ui/ScalePressable";
import { useWatchLinkState } from "@/src/watch/WatchLink";

/** A device-level UI preference, not owner data: dismissed stays dismissed. */
const DISMISSED_KEY = "mma.watch.promo.dismissed.v1";

/** WatchMock draws at a fixed 116×158; it is shown scaled, centred in a box of the scaled size. */
const MOCK_W = 116;
const MOCK_H = 158;
const MOCK_SCALE = 0.62;

export const WATCH_PROMO_COPY = {
  eyebrow: "Apple Watch",
  title: "Log sets from your wrist",
  body: "Open Muscle Map on your watch during a session — say the reps or turn the crown, and every set lands here.",
  a11y: "Log sets from your Apple Watch. Say the reps or turn the crown and every set lands here. Learn how.",
  dismiss: "Dismiss the Apple Watch tip",
} as const;

export function WatchPromoCard({ style }: { style?: object }) {
  const t = useSemanticTokens();
  const styles = useMemo(() => makeStyles(t), [t]);
  const router = useRouter();
  const link = useWatchLinkState();
  // null until the stored preference is read, so the card never flashes in
  // for a person who dismissed it.
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(DISMISSED_KEY)
      .then((v) => active && setDismissed(!!v))
      .catch(() => active && setDismissed(false));
    return () => {
      active = false;
    };
  }, []);

  if (Platform.OS !== "ios" || dismissed !== false) return null;
  // Already on the wrist: there is nothing left to prompt.
  if (link.paired && link.watchAppInstalled) return null;

  const dismiss = () => {
    setDismissed(true);
    AsyncStorage.setItem(DISMISSED_KEY, "1").catch(() => {});
  };

  return (
    <View style={style} testID="today-watch-promo">
      <ScalePressable
        onPress={() => router.push("/watch")}
        accessibilityRole="button"
        accessibilityLabel={WATCH_PROMO_COPY.a11y}
        testID="today-watch-promo-open"
      >
        <View style={styles.card}>
          <LiquidSheen tone="neutral" />
          <View style={styles.mock} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <View style={{ transform: [{ scale: MOCK_SCALE }] }}>
              <WatchMock accent={t.color.accent} />
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>{WATCH_PROMO_COPY.eyebrow.toUpperCase()}</Text>
            <Text style={styles.title}>{WATCH_PROMO_COPY.title}</Text>
            <Text style={styles.body}>{WATCH_PROMO_COPY.body}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={t.color.textFaint} />
        </View>
      </ScalePressable>
      <Pressable
        onPress={dismiss}
        hitSlop={10}
        style={styles.dismiss}
        accessibilityRole="button"
        accessibilityLabel={WATCH_PROMO_COPY.dismiss}
        testID="today-watch-promo-dismiss"
      >
        <Ionicons name="close" size={14} color={t.color.textFaint} />
      </Pressable>
    </View>
  );
}

const makeStyles = (t: ReturnType<typeof useSemanticTokens>) =>
  StyleSheet.create({
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: t.space.md,
      backgroundColor: t.color.surface,
      borderRadius: t.radius.xl,
      borderWidth: 1,
      borderColor: t.color.border,
      padding: t.space.md,
      paddingRight: t.space.lg,
      overflow: "hidden",
    },
    mock: { width: MOCK_W * MOCK_SCALE, height: MOCK_H * MOCK_SCALE, alignItems: "center", justifyContent: "center" },
    eyebrow: { color: t.color.accent, fontSize: 10.5, fontWeight: "800", letterSpacing: 0.8 },
    title: { ...t.type.bodyStrong, color: t.color.text, marginTop: 2 },
    body: { ...t.type.caption, color: t.color.textSecondary, marginTop: 3 },
    dismiss: {
      position: "absolute",
      top: 6,
      right: 6,
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
    },
  });
