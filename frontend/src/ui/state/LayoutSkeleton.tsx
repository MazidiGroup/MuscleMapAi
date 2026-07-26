// State System component 07: layout skeleton.
// Matches the real layout (never a full-tab spinner where structure is known)
// and is hidden from accessibility APIs on both platforms.

import React from "react";
import { DimensionValue, StyleProp, View, ViewStyle } from "react-native";

import { useSemanticTokens } from "@/src/theme/semantic";

const HIDDEN = {
  accessibilityElementsHidden: true, // iOS
  importantForAccessibility: "no-hide-descendants" as const, // Android
};

export function SkeletonLine({
  width = "100%",
  height = 13,
  radius = 7,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useSemanticTokens();
  return (
    <View
      {...HIDDEN}
      style={[{ width, height, borderRadius: radius, backgroundColor: t.color.skeletonBase }, style]}
    />
  );
}

export function SkeletonCard() {
  const t = useSemanticTokens();
  return (
    <View
      {...HIDDEN}
      style={{
        padding: t.space.lg - 2,
        borderRadius: t.radius.lg,
        backgroundColor: t.color.surface,
        borderWidth: 1,
        borderColor: t.color.border,
        gap: t.space.sm + 1,
      }}
    >
      <SkeletonLine width="58%" height={13} />
      <SkeletonLine width="40%" height={10} />
      <View style={{ flexDirection: "row", gap: t.space.sm }}>
        <SkeletonLine width={78} height={10} />
        <SkeletonLine width={96} height={10} />
        <SkeletonLine width={64} height={10} />
      </View>
    </View>
  );
}

/**
 * Layout-matched loading placeholder. `label` is not rendered visually — the
 * accompanying StatusAnnouncement owns the spoken "what is loading" message so
 * the skeleton itself stays invisible to assistive technology.
 */
export function LayoutSkeleton({ rows = 3, style }: { rows?: number; style?: StyleProp<ViewStyle> }) {
  const t = useSemanticTokens();
  return (
    <View {...HIDDEN} style={[{ gap: t.space.md }, style]}>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </View>
  );
}
