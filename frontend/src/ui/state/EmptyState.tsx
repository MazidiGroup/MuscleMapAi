// State System component 05: full-page empty state.
// A valid absence, one primary route and at most one secondary route.

import React from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useSemanticTokens } from "@/src/theme/semantic";

import { ActionButton } from "./ActionButton";

export type EmptyStateProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  /** Extra line used by the owner-namespace variant to explain local-only privacy. */
  note?: string;
  primary?: { label: string; onPress: () => void; testID?: string };
  secondary?: { label: string; onPress: () => void; testID?: string };
  testID?: string;
};

export function EmptyState({ icon, title, body, note, primary, secondary, testID }: EmptyStateProps) {
  const t = useSemanticTokens();
  return (
    <View
      testID={testID}
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: t.space.md + 1,
        paddingHorizontal: t.space.xl - 2,
        paddingVertical: t.space.xl,
      }}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 64,
          height: 64,
          borderRadius: t.radius.xl,
          backgroundColor: t.color.surface,
          borderWidth: 1,
          borderColor: t.color.border,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={icon} size={27} color={t.color.accentSoft} />
      </View>
      <Text accessibilityRole="header" style={{ ...t.type.heading, color: t.color.text, textAlign: "center" }}>
        {title}
      </Text>
      <Text style={{ ...t.type.body, color: t.color.textMuted, textAlign: "center", maxWidth: 290 }}>{body}</Text>
      {note ? (
        <Text style={{ ...t.type.caption, color: t.color.textFaint, textAlign: "center", maxWidth: 290 }}>
          {note}
        </Text>
      ) : null}
      <View style={{ width: "100%", maxWidth: 300, gap: t.space.sm + 1, marginTop: t.space.xs }}>
        {primary ? (
          <ActionButton label={primary.label} onPress={primary.onPress} testID={primary.testID} />
        ) : null}
        {secondary ? (
          <ActionButton
            label={secondary.label}
            onPress={secondary.onPress}
            variant="secondary"
            testID={secondary.testID}
          />
        ) : null}
      </View>
    </View>
  );
}
