import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Image, StyleSheet, PanResponder, Text, Animated } from "react-native";

import { COLORS } from "@/src/theme";
import { MuscleMap, MuscleStatus } from "./BodyDiagram";

// Four pre-rendered photorealistic anatomy angles
const ANATOMY: { key: string; angleDeg: number; src: any }[] = [
  { key: "front", angleDeg: 0, src: require("../../assets/anatomy/front.jpg") },
  { key: "tquarter", angleDeg: 45, src: require("../../assets/anatomy/tquarter.jpg") },
  { key: "side", angleDeg: 90, src: require("../../assets/anatomy/side.jpg") },
  { key: "back", angleDeg: 180, src: require("../../assets/anatomy/back.jpg") },
];

const STATUS_COLOR: Record<MuscleStatus, string> = {
  green: "rgba(52, 211, 153, 0.55)",
  yellow: "rgba(245, 158, 11, 0.55)",
  red: "rgba(239, 68, 68, 0.6)",
  none: "transparent",
};

type Props = {
  muscles: MuscleMap;
  size?: number;
  viewSnap?: "front" | "back" | "side";
};

/**
 * Muscle region overlays per angle.
 * Coordinates are percent-of-image (0-100), works on any image size.
 * Each region is a soft circle drawn via a View with borderRadius + opacity tint.
 */
const OVERLAYS: Record<string, { group: keyof MuscleMap; top: number; left: number; w: number; h: number }[]> = {
  front: [
    { group: "chest",       top: 22, left: 35, w: 30, h: 10 },
    { group: "shoulders",   top: 20, left: 24, w: 12, h: 10 },
    { group: "shoulders",   top: 20, left: 64, w: 12, h: 10 },
    { group: "arms",        top: 30, left: 18, w: 10, h: 18 },
    { group: "arms",        top: 30, left: 72, w: 10, h: 18 },
    { group: "core",        top: 35, left: 38, w: 24, h: 18 },
    { group: "quads",       top: 56, left: 34, w: 12, h: 22 },
    { group: "quads",       top: 56, left: 54, w: 12, h: 22 },
    { group: "calves",      top: 82, left: 35, w: 10, h: 12 },
    { group: "calves",      top: 82, left: 55, w: 10, h: 12 },
  ],
  tquarter: [
    { group: "chest",       top: 23, left: 32, w: 22, h: 11 },
    { group: "shoulders",   top: 19, left: 22, w: 14, h: 11 },
    { group: "arms",        top: 30, left: 18, w: 11, h: 20 },
    { group: "core",        top: 36, left: 36, w: 20, h: 18 },
    { group: "back",        top: 24, left: 56, w: 16, h: 22 },
    { group: "quads",       top: 56, left: 32, w: 13, h: 22 },
    { group: "calves",      top: 82, left: 34, w: 11, h: 12 },
  ],
  side: [
    { group: "chest",       top: 24, left: 30, w: 12, h: 12 },
    { group: "shoulders",   top: 20, left: 38, w: 14, h: 10 },
    { group: "arms",        top: 30, left: 36, w: 12, h: 22 },
    { group: "back",        top: 24, left: 52, w: 14, h: 24 },
    { group: "core",        top: 38, left: 38, w: 14, h: 16 },
    { group: "glutes",      top: 54, left: 52, w: 14, h: 12 },
    { group: "quads",       top: 60, left: 38, w: 14, h: 20 },
    { group: "hamstrings",  top: 60, left: 52, w: 12, h: 20 },
    { group: "calves",      top: 82, left: 42, w: 12, h: 12 },
  ],
  back: [
    { group: "shoulders",   top: 20, left: 24, w: 12, h: 10 },
    { group: "shoulders",   top: 20, left: 64, w: 12, h: 10 },
    { group: "back",        top: 24, left: 30, w: 40, h: 26 },
    { group: "arms",        top: 30, left: 16, w: 11, h: 20 },
    { group: "arms",        top: 30, left: 73, w: 11, h: 20 },
    { group: "glutes",      top: 53, left: 34, w: 32, h: 12 },
    { group: "hamstrings",  top: 60, left: 35, w: 12, h: 20 },
    { group: "hamstrings",  top: 60, left: 53, w: 12, h: 20 },
    { group: "calves",      top: 82, left: 36, w: 10, h: 12 },
    { group: "calves",      top: 82, left: 54, w: 10, h: 12 },
  ],
};

function MuscleOverlay({ region, status, size }: { region: any; status: MuscleStatus; size: { w: number; h: number } }) {
  if (!status || status === "none") return null;
  return (
    <View
      style={{
        pointerEvents: "none",
        position: "absolute",
        top: `${region.top}%`,
        left: `${region.left}%`,
        width: `${region.w}%`,
        height: `${region.h}%`,
        backgroundColor: STATUS_COLOR[status],
        borderRadius: 999,
      }}
    />
  );
}

export function Body3D({ muscles, size = 280, viewSnap }: Props) {
  // index into ANATOMY (0..3)
  const [activeIdx, setActiveIdx] = useState(0);
  const baseIdxRef = useRef(0);
  const dragXRef = useRef(0);

  // Snap to view from toggle
  useEffect(() => {
    if (!viewSnap) return;
    if (viewSnap === "front") setActiveIdx(0);
    else if (viewSnap === "side") setActiveIdx(2);
    else if (viewSnap === "back") setActiveIdx(3);
  }, [viewSnap]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 4,
        onPanResponderGrant: () => {
          baseIdxRef.current = activeIdx;
          dragXRef.current = 0;
        },
        onPanResponderMove: (_, g) => {
          dragXRef.current = g.dx;
          // 60px of drag = 1 step
          const step = Math.round(-g.dx / 60);
          const next = Math.max(0, Math.min(ANATOMY.length - 1, baseIdxRef.current + step));
          if (next !== activeIdx) setActiveIdx(next);
        },
      }),
    [activeIdx],
  );

  const active = ANATOMY[activeIdx];
  const overlays = OVERLAYS[active.key] || [];

  return (
    <View
      style={[styles.container, { width: size, height: size * 1.85 }]}
      {...panResponder.panHandlers}
      testID="body-3d-canvas"
    >
      <Image
        source={active.src}
        style={[styles.image, { width: size, height: size * 1.85 }]}
        resizeMode="contain"
      />
      {/* Muscle highlight overlays */}
      <View style={[StyleSheet.absoluteFillObject, { pointerEvents: "none" }]}>
        {overlays.map((r, i) => (
          <MuscleOverlay key={i} region={r} status={muscles[r.group] || "none"} size={{ w: size, h: size * 1.85 }} />
        ))}
      </View>

      {/* Angle indicator dots */}
      <View style={styles.dotsRow}>
        {ANATOMY.map((a, i) => (
          <View
            key={a.key}
            style={[styles.dot, i === activeIdx && styles.dotActive]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignSelf: "center", borderRadius: 16, overflow: "hidden", backgroundColor: "#000" },
  image: { position: "absolute", top: 0, left: 0 },
  dotsRow: { position: "absolute", bottom: 8, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.25)" },
  dotActive: { backgroundColor: COLORS.primary, width: 18 },
});
