import React, { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Animated, PanResponder, StyleSheet, View } from "react-native";
import { T } from "./ui";

export type SheetState = "collapsed" | "expanded";
export type DraggableSheetHandle = { snapTo: (s: SheetState) => void };

type Props = {
  /** Minimum visible height when collapsed — the sheet is always grabbable. */
  peekHeight: number;
  /**
   * Fully-expanded height of the sheet. This defines the TOP boundary:
   * when expanded, the top of the sheet sits `maxHeight` above the bottom.
   * Callers must size this so the sheet never rises above the header row.
   */
  maxHeight: number;
  /** "half" starts the sheet resting midway between collapsed and expanded. */
  initial?: SheetState | "half";
  onSnap?: (s: SheetState) => void;
  children: React.ReactNode;
};

export const DraggableSheet = forwardRef<DraggableSheetHandle, Props>(function DraggableSheet(
  { peekHeight, maxHeight, initial = "collapsed", onSnap, children },
  ref,
) {
  // translateY travels between 0 (fully expanded, top at maxHeight) and `range`
  // (collapsed, only `peekHeight` visible). Free dragging rests anywhere in between.
  const range = Math.max(1, maxHeight - peekHeight);
  const initialY = initial === "expanded" ? 0 : initial === "half" ? range / 2 : range;
  const translateY = useRef(new Animated.Value(initialY)).current;
  const currentY = useRef(initialY);
  const startY = useRef(currentY.current);

  useEffect(() => {
    const id = translateY.addListener(({ value }) => (currentY.current = value));
    return () => translateY.removeListener(id);
  }, [translateY]);

  const clamp = (v: number) => Math.min(range, Math.max(0, v));

  // Settle smoothly to a freely-chosen resting position (with a little momentum).
  const settleTo = (to: number) => {
    Animated.spring(translateY, {
      toValue: clamp(to),
      useNativeDriver: true,
      bounciness: 0,
      speed: 18,
    }).start();
  };

  const animateTo = (state: SheetState) => {
    const to = state === "expanded" ? 0 : range;
    Animated.spring(translateY, { toValue: to, useNativeDriver: true, bounciness: 2, speed: 14 }).start();
    onSnap?.(state);
  };

  useImperativeHandle(ref, () => ({ snapTo: animateTo }));

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 2,
      onPanResponderGrant: () => {
        translateY.stopAnimation((v) => (startY.current = v));
        startY.current = currentY.current;
      },
      onPanResponderMove: (_e, g) => {
        translateY.setValue(clamp(startY.current + g.dy));
      },
      onPanResponderRelease: (_e, g) => {
        // Free rest: keep wherever released, adding a small momentum from the fling.
        const momentum = g.vy * 90; // px of carry based on release velocity
        settleTo(currentY.current + momentum);
      },
      onPanResponderTerminate: () => {
        settleTo(currentY.current);
      },
    }),
  ).current;

  return (
    <Animated.View style={[styles.sheet, { height: maxHeight, transform: [{ translateY }] }]}>
      <View
        style={styles.handleZone}
        {...pan.panHandlers}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Panel size"
        accessibilityHint="Drag up or down to resize the panel"
        accessibilityActions={[
          { name: "increment", label: "Expand panel" },
          { name: "decrement", label: "Collapse panel" },
        ]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === "increment") animateTo("expanded");
          else if (e.nativeEvent.actionName === "decrement") animateTo("collapsed");
        }}
      >
        <View style={styles.handle} />
      </View>
      <View style={styles.content}>{children}</View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: T.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: T.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 16,
  },
  handleZone: { paddingTop: 14, paddingBottom: 16, alignItems: "center" },
  handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: "rgba(120,160,220,0.4)" },
  content: { flex: 1 },
});
