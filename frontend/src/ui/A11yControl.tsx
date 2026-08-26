// One accessible control.
//
// Every interactive element built on this carries an explicit role and accessible
// name, is operable by Enter and Space, and shows a visible focus ring — react
// native web strips the browser default, so the ring is drawn from the semantic
// focus colour. The ring is an outline, so revealing it never shifts layout.

import React, { useState } from "react";
import { AccessibilityRole, Platform, Pressable, StyleProp, ViewStyle } from "react-native";

import { useSemanticTokens } from "@/src/theme/semantic";

export function A11yControl({
  label,
  onPress,
  onLongPress,
  role = "button",
  checked,
  selected,
  disabled,
  busy,
  hint,
  style,
  testID,
  children,
}: {
  label: string;
  onPress: () => void;
  /** Optional secondary action; announce it through `hint` so it is not silent. */
  onLongPress?: () => void;
  role?: AccessibilityRole;
  checked?: boolean;
  selected?: boolean;
  disabled?: boolean;
  busy?: boolean;
  hint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  children: React.ReactNode;
}) {
  const t = useSemanticTokens();
  const [focused, setFocused] = useState(false);

  // A `button` role maps to a real button element on web, which already handles
  // Enter and Space. Any other role lands on a focusable div, which does not.
  const keyboard =
    Platform.OS === "web" && role !== "button"
      ? {
          onKeyDown: (e: any) => {
            if (e?.key === "Enter" || e?.key === " " || e?.key === "Spacebar") {
              e.preventDefault?.();
              if (!disabled) onPress();
            }
          },
        }
      : null;

  const ring =
    Platform.OS === "web"
      ? ({
          outlineStyle: "solid",
          outlineWidth: t.state.focusRingWidth,
          outlineColor: t.color.focusRing,
          outlineOffset: 2,
        } as unknown as ViewStyle)
      : null;

  // react-native-web no longer derives aria-checked from accessibilityState, so a
  // checkbox states itself explicitly. Native keeps reading accessibilityState.
  const aria = Platform.OS === "web" && checked !== undefined ? { "aria-checked": checked } : null;

  return (
    <Pressable
      accessible
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ checked, selected, disabled: !!disabled, busy: !!busy }}
      disabled={disabled}
      onPress={onPress}
      onLongPress={onLongPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      testID={testID}
      style={[style, focused ? ring : null]}
      {...(aria as any)}
      {...keyboard}
    >
      {children}
    </Pressable>
  );
}
