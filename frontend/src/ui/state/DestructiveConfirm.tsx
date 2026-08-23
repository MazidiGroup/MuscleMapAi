// State System component 13: destructive confirmation.
// Names what is kept before what is lost, defaults to the safe action, moves
// focus into the dialog and restores it to the opener on dismiss.

import React, { useCallback, useEffect, useRef } from "react";
import { Modal, Text, View } from "react-native";

import { useSemanticTokens } from "@/src/theme/semantic";
import { LiquidSheen } from "@/src/ui/GlassSurface";

import { ActionButton } from "./ActionButton";
import { focusAccessibility } from "./a11yFocus";

export type DestructiveConfirmProps = {
  visible: boolean;
  title: string;
  /** What is kept, then what is lost, then what happens next. */
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  /** Node handle of the control that opened the dialog, for focus restoration. */
  restoreFocusTo?: number | null;
  testID?: string;
};

export function DestructiveConfirm({
  visible,
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  busy,
  restoreFocusTo,
  testID,
}: DestructiveConfirmProps) {
  const t = useSemanticTokens();
  const titleRef = useRef<Text>(null);

  useEffect(() => {
    if (!visible) return;
    focusAccessibility(titleRef);
  }, [visible]);

  const restoreFocus = useCallback(() => {
    focusAccessibility(restoreFocusTo);
  }, [restoreFocusTo]);

  const handleCancel = useCallback(() => {
    onCancel();
    restoreFocus();
  }, [onCancel, restoreFocus]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleCancel}>
      <View style={{ flex: 1, backgroundColor: t.color.scrim, justifyContent: "flex-end" }}>
        <View
          testID={testID}
          accessibilityViewIsModal
          accessibilityRole="alert"
          accessibilityLabel={title}
          style={{
            backgroundColor: t.color.surface,
            borderTopLeftRadius: t.radius.xxl,
            borderTopRightRadius: t.radius.xxl,
            borderBottomWidth: 0,
            padding: t.space.xl - 4,
            paddingBottom: t.space.xxl - 4,
            gap: t.space.md,
            overflow: "hidden",
          }}
        >
          <LiquidSheen tone="neutral" />
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{ width: 38, height: 4, borderRadius: 3, backgroundColor: t.color.border, alignSelf: "center" }}
          />
          <Text ref={titleRef} accessible accessibilityRole="header" style={{ ...t.type.heading, color: t.color.text }}>
            {title}
          </Text>
          <Text style={{ ...t.type.body, color: t.color.textSecondary }}>{body}</Text>
          <View style={{ gap: t.space.sm }}>
            {/* Safe action first in the reading order; destructive is explicit. */}
            <ActionButton label={cancelLabel} onPress={handleCancel} variant="secondary" testID="confirm-cancel" />
            <ActionButton
              label={confirmLabel}
              onPress={() => {
                onConfirm();
                restoreFocus();
              }}
              busy={busy}
              variant="destructive"
              testID="confirm-destructive"
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
