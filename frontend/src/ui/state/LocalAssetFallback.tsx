// State System component 11: local-asset fallback.
//
// STRICTLY for genuinely bundled assets that are missing or damaged on this
// device. It must never be used for a network resource and must never contain
// reconnect/offline wording. Phase 0 established that exercise posters and
// animations are currently served over the network, so those surfaces must NOT
// use this component until the media classification (D-10) is resolved.

import React from "react";
import { StyleProp, Text, View, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useSemanticTokens } from "@/src/theme/semantic";
import { LiquidSheen } from "@/src/ui/GlassSurface";

export type LocalAssetFallbackProps = {
  /** What the person can still rely on, e.g. "Your logged sets are unaffected." */
  reassurance?: string;
  height?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const TITLE = "Image unavailable on this device";

export function LocalAssetFallback({
  reassurance = "Your logged performance is complete and unaffected.",
  height = 150,
  style,
  testID,
}: LocalAssetFallbackProps) {
  const t = useSemanticTokens();
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={`${TITLE}. ${reassurance}`}
      style={[
        {
          width: "100%",
          height,
          borderRadius: t.radius.md + 1,
          backgroundColor: t.color.surfaceAlt,
          
          
          
          alignItems: "center",
          justifyContent: "center",
          gap: t.space.sm - 1,
          padding: t.space.md,
          overflow: "hidden",
        },
        style,
      ]}
    >
      <LiquidSheen tone="subtle" />
      <Ionicons name="image-outline" size={24} color={t.color.textFaint} />
      <Text style={{ ...t.type.caption, fontWeight: "700", color: t.color.textSecondary }}>{TITLE}</Text>
      <Text style={{ ...t.type.caption, color: t.color.textMuted, textAlign: "center", maxWidth: 250 }}>
        {reassurance}
      </Text>
    </View>
  );
}
