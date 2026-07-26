// State System component 09: retry panel.
// States what failed, lists what was preserved, offers only safe next actions
// and escalates the explanation on repeated failure. An unsafe retry is simply
// not rendered — pass `retry: undefined` and supply safe alternatives instead.

import React, { useEffect, useRef } from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useSemanticTokens } from "@/src/theme/semantic";

import { ActionButton } from "./ActionButton";
import { focusAccessibility } from "./a11yFocus";

export type RetryPanelProps = {
  title: string;
  /** What happened and what still works. */
  body: string;
  /** Explicit "this was kept" list. */
  preserved?: string[];
  /** Omit entirely when retry safety is not proven. */
  retry?: { label?: string; onPress: () => void; busy?: boolean; busyLabel?: string; testID?: string };
  secondary?: { label: string; onPress: () => void; testID?: string };
  tertiary?: { label: string; onPress: () => void; testID?: string };
  /** How many times the same action has already failed — drives escalation copy. */
  attempt?: number;
  /** Low-emphasis note, e.g. why automatic retry is not offered. */
  note?: string;
  testID?: string;
};

export function RetryPanel({
  title,
  body,
  preserved,
  retry,
  secondary,
  tertiary,
  attempt = 1,
  note,
  testID,
}: RetryPanelProps) {
  const t = useSemanticTokens();
  const titleRef = useRef<Text>(null);

  // One announcement per state change, focus lands on the message.
  useEffect(() => {
    focusAccessibility(titleRef);
  }, [title, attempt]);

  const escalated = attempt >= 2;

  return (
    <View
      testID={testID}
      style={{
        borderRadius: t.radius.lg,
        backgroundColor: t.status.error.bg,
        borderWidth: 1,
        borderColor: t.status.error.border,
        padding: t.space.lg,
        gap: t.space.md - 1,
      }}
    >
      <View style={{ flexDirection: "row", gap: t.space.sm + 1, alignItems: "flex-start" }}>
        <Ionicons name="alert-circle" size={19} color={t.status.error.fg} style={{ marginTop: 1 }} />
        <View style={{ flex: 1 }}>
          <Text
            ref={titleRef}
            accessible
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
            style={{ ...t.type.subheading, color: t.color.text }}
          >
            {title}
          </Text>
          <Text style={{ ...t.type.body, color: t.color.textSecondary, marginTop: t.space.xs }}>
            {escalated ? `${body} This has now failed ${attempt} times, so something on this device or connection is still blocking it.` : body}
          </Text>
        </View>
      </View>

      {preserved?.length ? (
        <View style={{ gap: t.space.sm - 2 }}>
          {preserved.map((p) => (
            <View key={p} style={{ flexDirection: "row", gap: t.space.sm - 1, alignItems: "flex-start" }}>
              <Ionicons name="lock-closed-outline" size={13} color={t.status.success.fg} style={{ marginTop: 2 }} />
              <Text style={{ ...t.type.caption, fontWeight: "600", color: t.color.textSecondary, flex: 1 }}>{p}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={{ gap: t.space.sm }}>
        {retry ? (
          <ActionButton
            label={retry.label ?? "Try again"}
            onPress={retry.onPress}
            busy={retry.busy}
            busyLabel={retry.busyLabel}
            testID={retry.testID}
          />
        ) : null}
        {secondary ? (
          <ActionButton
            label={secondary.label}
            onPress={secondary.onPress}
            variant="secondary"
            testID={secondary.testID}
          />
        ) : null}
        {tertiary ? (
          <ActionButton
            label={tertiary.label}
            onPress={tertiary.onPress}
            variant="secondary"
            testID={tertiary.testID}
          />
        ) : null}
      </View>

      {note ? <Text style={{ ...t.type.caption, color: t.color.textFaint }}>{note}</Text> : null}
    </View>
  );
}
