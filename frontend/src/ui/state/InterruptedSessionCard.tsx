// State System component 12: interrupted-session recovery card.
// Resume is labelled with what it resumes and always continues the existing
// verified session — it can never create a duplicate.

import React from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useSemanticTokens } from "@/src/theme/semantic";
import { LiquidSheen } from "@/src/ui/GlassSurface";

import { ActionButton } from "./ActionButton";

export type InterruptedSessionCardProps = {
  title: string;
  body: string;
  /** [label, value] pairs, e.g. ["Sets logged", "6"]. */
  facts: [string, string][];
  resume: { label: string; onPress: () => void; busy?: boolean; testID?: string };
  discard?: { label: string; onPress: () => void; testID?: string };
  testID?: string;
};

export function InterruptedSessionCard({
  title,
  body,
  facts,
  resume,
  discard,
  testID,
}: InterruptedSessionCardProps) {
  const t = useSemanticTokens();
  return (
    <View
      testID={testID}
      style={{
        borderRadius: t.radius.lg,
        backgroundColor: t.color.surface,
        borderWidth: 1,
        borderColor: t.color.accent,
        padding: t.space.lg,
        gap: t.space.md - 1,
        overflow: "hidden",
      }}
    >
      <LiquidSheen tone="neutral" />
      <View style={{ flexDirection: "row", gap: t.space.sm + 1, alignItems: "flex-start" }}>
        <Ionicons name="play-circle" size={20} color={t.color.accentSoft} style={{ marginTop: 1 }} />
        <View style={{ flex: 1 }}>
          <Text style={{ ...t.type.subheading, color: t.color.text }}>{title}</Text>
          <Text style={{ ...t.type.body, color: t.color.textMuted, marginTop: t.space.xs }}>{body}</Text>
        </View>
      </View>

      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: t.space.md,
          paddingVertical: t.space.sm + 2,
          borderTopWidth: 1,
          borderBottomWidth: 1,
          
        }}
      >
        {facts.map(([label, value]) => (
          <View key={label} accessible accessibilityLabel={`${label}: ${value}`}>
            <Text style={{ ...t.type.subheading, color: t.color.text }}>{value}</Text>
            <Text style={{ ...t.type.caption, color: t.color.textMuted }}>{label}</Text>
          </View>
        ))}
      </View>

      <View style={{ gap: t.space.sm }}>
        <ActionButton label={resume.label} onPress={resume.onPress} busy={resume.busy} testID={resume.testID} />
        {discard ? (
          <ActionButton
            label={discard.label}
            onPress={discard.onPress}
            variant="secondary"
            testID={discard.testID}
          />
        ) : null}
      </View>
    </View>
  );
}
