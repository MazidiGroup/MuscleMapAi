// Post-workout share sheet: previews the exact 9:16 card that will be shared,
// then shares it as an image (react-native-view-shot → expo-sharing), with the
// existing text share kept as the fallback.
//
// The card is always drawn in the Night palette — it is a brand object that
// leaves the app, so it looks the same whichever appearance the sharer uses.
// It carries only what the summary already shows: routine, date, sets,
// volume, duration, PRs and which muscle groups took working sets.

import React, { useMemo, useRef, useState } from "react";
import { Modal, PixelRatio, Pressable, Share, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Sharing from "expo-sharing";
import { captureRef } from "react-native-view-shot";

import { BodyMap2D } from "@/src/anatomy/BodyMap2D";
import { GYM_GROUPS } from "@/src/anatomy/groups";
import { sessionSetsByGroup } from "@/src/anatomy/sessionGroups";
import { COPPER_RAMP, copperForCount } from "@/src/anatomy/ui";
import type { Workout } from "@/src/anatomy/workoutScope";
import { useTheme } from "@/src/theme/ThemeContext";
import { PALETTES } from "@/src/theme/tokens";
import { BrandMark } from "@/src/ui/BrandMark";

import { absoluteDate, routineName, workoutTotals } from "./metrics";

const N = PALETTES.night;
/** Output size of the shared image, in pixels: a 9:16 story card. */
const OUT_W = 1080;
const OUT_H = 1920;

type Props = {
  visible: boolean;
  onClose: () => void;
  workout: Workout;
  unit: string;
  newPRs: string[];
  /** "48:10" — the summary's own duration format, so the two always agree. */
  duration: string;
  /** The existing plain-text share, offered as the fallback. */
  textMessage: string;
};

export function ShareCardSheet({ visible, onClose, workout, unit, newPRs, duration, textMessage }: Props) {
  const { T } = useTheme();
  const { width: screenW } = useWindowDimensions();
  const cardRef = useRef<View>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const stats = workoutTotals(workout.exercises);
  const sets = useMemo(() => sessionSetsByGroup(workout.exercises), [workout]);
  const max = Math.max(0, ...Object.values(sets));
  const fills = useMemo(() => {
    const out: Record<string, string> = {};
    for (const g of Object.keys(GYM_GROUPS)) out[g] = copperForCount(sets[g] || 0, max);
    return out;
  }, [sets, max]);
  const worked = Object.keys(GYM_GROUPS).filter((g) => (sets[g] || 0) > 0).map((g) => GYM_GROUPS[g].label);

  const cardW = Math.min(screenW - 64, 300);
  const cardH = Math.round((cardW * 16) / 9);
  const bodyW = Math.floor((cardW - 56) / 2);

  const shareImage = async () => {
    if (!cardRef.current || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      // view-shot sizes in points and multiplies by the screen scale, so divide
      // it out to get exactly 1080 × 1920 pixels.
      const scale = PixelRatio.get();
      const uri = await captureRef(cardRef, {
        format: "png",
        quality: 1,
        result: "tmpfile",
        width: OUT_W / scale,
        height: OUT_H / scale,
      });
      if (!(await Sharing.isAvailableAsync())) throw new Error("sharing unavailable");
      await Sharing.shareAsync(uri, { mimeType: "image/png", UTI: "public.png", dialogTitle: "Share your workout" });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const shareText = () => {
    Share.share({ message: textMessage }).catch(() => {});
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close share" accessibilityRole="button" />
      <View style={[styles.sheet, { backgroundColor: T.cardSolid }]} testID="share-sheet">
        <View style={styles.sheetHead}>
          <Text style={[styles.sheetTitle, { color: T.text }]}>Share your workout</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} style={styles.close}>
            <Ionicons name="close" size={22} color={T.text} />
          </Pressable>
        </View>

        {/* The card itself. Exactly 9:16, so the captured image is never stretched. */}
        <View
          ref={cardRef}
          collapsable={false}
          style={[styles.card, { width: cardW, height: cardH }]}
          accessible
          accessibilityLabel={
            `${routineName(workout)}, ${absoluteDate(workout.date)}. ` +
            `${stats.completedSets} of ${stats.totalSets} sets, ${stats.volume} ${unit}, ${duration}.` +
            (worked.length ? ` Trained ${worked.join(", ")}.` : "") +
            (newPRs.length ? ` ${newPRs.length} new personal record${newPRs.length === 1 ? "" : "s"}.` : "")
          }
          testID="share-card"
        >
          <BrandMark size={18} color={N.text} />
          <View style={{ alignItems: "center", gap: 2 }}>
            <Text style={styles.cardTitle} numberOfLines={2}>{routineName(workout)}</Text>
            <Text style={styles.cardDate}>{absoluteDate(workout.date)}</Text>
          </View>
          <View style={styles.bodies}>
            <BodyMap2D view="front" fills={fills} idle={COPPER_RAMP[0]} gap={N.cardSolid} width={bodyW} />
            <BodyMap2D view="back" fills={fills} idle={COPPER_RAMP[0]} gap={N.cardSolid} width={bodyW} />
          </View>
          <View style={styles.metrics}>
            <Metric value={`${stats.completedSets}/${stats.totalSets}`} label="SETS" />
            <Metric value={stats.volume.toLocaleString()} label={unit.toUpperCase()} />
            <Metric value={duration} label="TIME" />
          </View>
          {newPRs.length > 0 ? (
            <View style={styles.prChip}>
              <Ionicons name="trophy" size={12} color={N.pr} />
              <Text style={styles.prText}>{newPRs.length === 1 ? "New PR" : `${newPRs.length} new PRs`}</Text>
            </View>
          ) : null}
        </View>

        {failed ? (
          <Text style={[styles.error, { color: T.textMuted }]} accessibilityLiveRegion="polite">
            The image couldn’t be created. Share as text instead — your workout is saved either way.
          </Text>
        ) : null}

        <Pressable
          onPress={shareImage}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Share image"
          accessibilityState={{ disabled: busy, busy }}
          style={[styles.primary, { backgroundColor: T.accent }, busy && { opacity: 0.6 }]}
          testID="share-image"
        >
          <Ionicons name="image-outline" size={18} color={T.ctaText} />
          <Text style={[styles.primaryText, { color: T.ctaText }]}>{busy ? "Preparing…" : "Share image"}</Text>
        </Pressable>
        <Pressable
          onPress={shareText}
          accessibilityRole="button"
          accessibilityLabel="Share as text"
          style={styles.secondary}
          testID="share-text"
        >
          <Text style={[styles.secondaryText, { color: T.accentText }]}>Share as text</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 34, alignItems: "center", gap: 14,
  },
  sheetHead: { flexDirection: "row", alignItems: "center", alignSelf: "stretch" },
  sheetTitle: { flex: 1, fontSize: 17, fontWeight: "800" },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginRight: -10 },
  card: {
    backgroundColor: N.cardSolid, borderRadius: 22, overflow: "hidden",
    paddingHorizontal: 18, paddingVertical: 20, alignItems: "center", justifyContent: "space-between",
  },
  cardTitle: { color: N.text, fontSize: 20, fontWeight: "800", textAlign: "center" },
  cardDate: { color: N.textMuted, fontSize: 12, fontWeight: "600" },
  bodies: { flexDirection: "row", gap: 12, justifyContent: "center" },
  metrics: { flexDirection: "row", alignSelf: "stretch" },
  metricValue: { color: N.text, fontSize: 20, fontWeight: "800", fontVariant: ["tabular-nums"] },
  metricLabel: { color: N.accentText, fontSize: 9.5, fontWeight: "800", letterSpacing: 1, marginTop: 2 },
  prChip: {
    flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 999, backgroundColor: N.pr + "22", borderWidth: 1, borderColor: N.pr + "66",
  },
  prText: { color: N.pr, fontSize: 11.5, fontWeight: "800" },
  error: { fontSize: 13, textAlign: "center" },
  primary: {
    alignSelf: "stretch", minHeight: 52, borderRadius: 26, flexDirection: "row",
    alignItems: "center", justifyContent: "center", gap: 8,
  },
  primaryText: { fontSize: 16, fontWeight: "800" },
  secondary: { minHeight: 44, justifyContent: "center", paddingHorizontal: 16 },
  secondaryText: { fontSize: 14.5, fontWeight: "700" },
});
