import React from "react";
import {
  StyleSheet,
  TouchableOpacity as NativeTouchableOpacity,
  type TouchableOpacityProps,
} from "react-native";

import { GlassTone, LiquidSheen } from "./GlassSurface";

/**
 * Drop-in TouchableOpacity with the shared liquid highlight. It deliberately
 * avoids a BlurView, so dozens of controls can coexist in a scrolling list.
 */
export function LiquidTouchableOpacity({
  children,
  style,
  glassTone = "neutral",
  activeOpacity = 0.78,
  ...props
}: TouchableOpacityProps & { glassTone?: GlassTone }) {
  return (
    <NativeTouchableOpacity {...props} activeOpacity={activeOpacity} style={[styles.clip, style]}>
      <LiquidSheen tone={glassTone} />
      {children}
    </NativeTouchableOpacity>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: "hidden" },
});
