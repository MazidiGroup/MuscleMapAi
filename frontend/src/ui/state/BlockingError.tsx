// State System component 06: full-page blocking error.
// Plain-language dependency, local data explicitly named as intact, one safe
// exit. Technical codes live in `detail`, never in the main copy.

import React from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useSemanticTokens } from "@/src/theme/semantic";

import { ActionButton } from "./ActionButton";

export type BlockingErrorProps = {
  title: string;
  /** What happened, what was preserved, what still works. */
  body: string;
  primary: { label: string; onPress: () => void; testID?: string };
  secondary?: { label: string; onPress: () => void; testID?: string };
  /** Optional low-emphasis technical detail. Never the main message. */
  detail?: string;
  testID?: string;
};

export function BlockingError({ title, body, primary, secondary, detail, testID }: BlockingErrorProps) {
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
          backgroundColor: t.status.error.bg,
          borderWidth: 1,
          borderColor: t.status.error.border,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="alert-circle" size={27} color={t.status.error.fg} />
      </View>
      <Text
        accessibilityRole="alert"
        accessibilityLiveRegion="assertive"
        style={{ ...t.type.heading, color: t.color.text, textAlign: "center" }}
      >
        {title}
      </Text>
      <Text style={{ ...t.type.body, color: t.color.textMuted, textAlign: "center", maxWidth: 300 }}>{body}</Text>
      <View style={{ width: "100%", maxWidth: 300, gap: t.space.sm + 1, marginTop: t.space.xs }}>
        <ActionButton label={primary.label} onPress={primary.onPress} testID={primary.testID} />
        {secondary ? (
          <ActionButton
            label={secondary.label}
            onPress={secondary.onPress}
            variant="secondary"
            testID={secondary.testID}
          />
        ) : null}
      </View>
      {detail ? (
        <Text style={{ ...t.type.caption, color: t.color.textFaint, textAlign: "center", maxWidth: 300 }}>
          {detail}
        </Text>
      ) : null}
    </View>
  );
}
