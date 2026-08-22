// State System component 15: accessible status announcement.
// Exactly one announcement per state change, using the same wording as the
// visible UI. Polite for progress, assertive for failure.

import React, { useEffect, useRef } from "react";
import { AccessibilityInfo, StyleProp, Text, View, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useSemanticTokens } from "@/src/theme/semantic";
import { LiquidSheen } from "@/src/ui/GlassSurface";

export type StatusAnnouncementProps = {
  /** Same wording as the visible UI. */
  message: string;
  assertive?: boolean;
  /** When false the message is announced but not drawn. */
  visible?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function StatusAnnouncement({
  message,
  assertive = false,
  visible = true,
  style,
  testID,
}: StatusAnnouncementProps) {
  const t = useSemanticTokens();
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (!message || message === last.current) return; // one announcement per change
    last.current = message;
    try {
      AccessibilityInfo.announceForAccessibility(message);
    } catch {
      /* not supported on all platforms */
    }
  }, [message]);

  if (!visible) {
    return (
      <View
        testID={testID}
        accessible
        accessibilityLiveRegion={assertive ? "assertive" : "polite"}
        accessibilityLabel={message}
        style={{ width: 0, height: 0, overflow: "hidden" }}
      />
    );
  }

  return (
    <View
      testID={testID}
      accessible
      accessibilityLiveRegion={assertive ? "assertive" : "polite"}
      accessibilityLabel={message}
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: t.space.sm,
          paddingVertical: t.space.sm + 1,
          paddingHorizontal: t.space.md,
          borderRadius: t.radius.md,
          backgroundColor: t.color.surfaceAlt,
          borderWidth: 1,
          borderColor: t.color.border,
          overflow: "hidden",
        },
        style,
      ]}
    >
      <LiquidSheen tone={assertive ? "danger" : "subtle"} />
      <Ionicons
        name={assertive ? "alert-circle" : "information-circle-outline"}
        size={15}
        color={assertive ? t.status.error.fg : t.color.accentSoft}
      />
      <Text style={{ ...t.type.caption, fontWeight: "600", color: t.color.textSecondary, flex: 1 }}>{message}</Text>
    </View>
  );
}
