// State System component 10: partial-success panel.
// Names exactly what succeeded and exactly what was omitted; valid content
// stays usable while this is on screen.

import React from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useSemanticTokens } from "@/src/theme/semantic";
import { LiquidSheen } from "@/src/ui/GlassSurface";

import { ActionButton } from "./ActionButton";

export type PartialSuccessPanelProps = {
  title: string;
  body: string;
  /** What is definitely there. */
  succeeded: string[];
  /** What is definitely not there — never vague. */
  omitted: string[];
  action?: { label: string; onPress: () => void; testID?: string };
  testID?: string;
};

export function PartialSuccessPanel({
  title,
  body,
  succeeded,
  omitted,
  action,
  testID,
}: PartialSuccessPanelProps) {
  const t = useSemanticTokens();
  return (
    <View
      testID={testID}
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
      style={{
        borderRadius: t.radius.lg,
        backgroundColor: t.status.warning.bg,
        borderWidth: 1,
        borderColor: t.status.warning.border,
        padding: t.space.lg,
        gap: t.space.md - 2,
        overflow: "hidden",
      }}
    >
      <LiquidSheen tone="subtle" />
      <View style={{ flexDirection: "row", gap: t.space.sm + 1, alignItems: "flex-start" }}>
        <Ionicons name="alert-circle-outline" size={19} color={t.status.warning.fg} style={{ marginTop: 1 }} />
        <View style={{ flex: 1 }}>
          <Text style={{ ...t.type.subheading, color: t.color.text }}>{title}</Text>
          <Text style={{ ...t.type.body, color: t.status.warning.text, marginTop: t.space.xs }}>{body}</Text>
        </View>
      </View>

      <View
        style={{
          gap: t.space.sm - 1,
          paddingTop: t.space.sm + 1,
          borderTopWidth: 1,
          borderTopColor: t.status.warning.border,
        }}
      >
        {succeeded.map((x) => (
          <View key={`ok-${x}`} style={{ flexDirection: "row", gap: t.space.sm - 1, alignItems: "flex-start" }}>
            <Ionicons name="checkmark-circle" size={14} color={t.status.success.fg} style={{ marginTop: 1 }} />
            <Text style={{ ...t.type.caption, fontWeight: "600", color: t.color.textSecondary, flex: 1 }}>{x}</Text>
          </View>
        ))}
        {omitted.map((x) => (
          <View key={`miss-${x}`} style={{ flexDirection: "row", gap: t.space.sm - 1, alignItems: "flex-start" }}>
            <Ionicons name="remove-circle-outline" size={14} color={t.status.warning.fg} style={{ marginTop: 1 }} />
            <Text style={{ ...t.type.caption, fontWeight: "600", color: t.status.warning.text, flex: 1 }}>{x}</Text>
          </View>
        ))}
      </View>

      {action ? (
        <ActionButton label={action.label} onPress={action.onPress} variant="secondary" testID={action.testID} />
      ) : null}
    </View>
  );
}
