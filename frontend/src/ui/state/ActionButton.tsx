// State System component 08: button loading state.
// The original action stays identifiable, the control locks against double
// submission, and no fabricated percentage is ever shown.

import React, { useCallback, useRef } from "react";
import { ActivityIndicator, Pressable, StyleProp, Text, View, ViewStyle } from "react-native";

import { useSemanticTokens } from "@/src/theme/semantic";
import { LiquidSheen, liquidShadow } from "@/src/ui/GlassSurface";

export type ActionButtonProps = {
  label: string;
  onPress?: () => void | Promise<void>;
  /** Shows the spinner, locks the control and appends ", working" to the label. */
  busy?: boolean;
  busyLabel?: string;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "destructive";
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityHint?: string;
};

export function ActionButton({
  label,
  onPress,
  busy = false,
  busyLabel,
  disabled = false,
  variant = "primary",
  style,
  testID,
  accessibilityHint,
}: ActionButtonProps) {
  const t = useSemanticTokens();
  const locked = busy || disabled;
  // Second guard against double submission: even if a caller forgets to flip
  // `busy` synchronously, one in-flight press cannot start a second one.
  const inFlight = useRef(false);

  const handlePress = useCallback(() => {
    if (locked || inFlight.current || !onPress) return;
    inFlight.current = true;
    Promise.resolve(onPress()).finally(() => {
      inFlight.current = false;
    });
  }, [locked, onPress]);

  const bg =
    variant === "primary" ? t.color.accent : variant === "destructive" ? t.status.error.bg : t.color.surface;
  const fg =
    variant === "primary" ? t.color.onAccent : variant === "destructive" ? t.status.error.fg : t.color.textSecondary;

  return (
    <Pressable
      testID={testID}
      onPress={handlePress}
      disabled={locked}
      accessibilityRole="button"
      accessibilityLabel={busy ? `${label}, working` : label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: locked, busy }}
      style={({ pressed }) => [
        {
          minHeight: t.target.comfortable,
          borderRadius: t.radius.lg,
          backgroundColor: bg,
          opacity: locked ? t.state.disabledOpacity : pressed ? t.state.pressedOpacity : 1,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: t.space.sm,
          paddingHorizontal: t.space.lg,
          borderWidth: 1,
          borderColor: variant === "primary"
            ? "rgba(255,255,255,0.28)"
            : variant === "destructive" ? t.status.error.border : "transparent",
          overflow: "hidden",
          ...liquidShadow(t.mode),
        },
        style,
      ]}
    >
      <LiquidSheen tone={variant === "primary" ? "accent" : variant === "destructive" ? "danger" : "neutral"} />
      {busy ? <ActivityIndicator size="small" color={fg} /> : null}
      <View style={{ flexShrink: 1 }}>
        <Text style={{ ...t.type.subheading, color: fg, textAlign: "center" }}>
          {busy && busyLabel ? busyLabel : label}
        </Text>
      </View>
    </Pressable>
  );
}
