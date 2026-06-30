import React, { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Animated, PanResponder, StyleSheet, View } from "react-native";
import { T } from "./ui";

export type SheetState = "collapsed" | "expanded";
export type DraggableSheetHandle = { snapTo: (s: SheetState) => void };

type Props = {
  peekHeight: number;
  maxHeight: number;
  initial?: SheetState;
  onSnap?: (s: SheetState) => void;
  children: React.ReactNode;
};

export const DraggableSheet = forwardRef<DraggableSheetHandle, Props>(function DraggableSheet(
  { peekHeight, maxHeight, initial = "collapsed", onSnap, children },
  ref,
) {
  const range = Math.max(1, maxHeight - peekHeight); // travel distance
  const translateY = useRef(new Animated.Value(initial === "expanded" ? 0 : range)).current;
  const currentY = useRef(initial === "expanded" ? 0 : range);
  const startY = useRef(currentY.current);

  useEffect(() => {
    const id = translateY.addListener(({ value }) => (currentY.current = value));
    return () => translateY.removeListener(id);
  }, [translateY]);

  const animateTo = (state: SheetState) => {
    const to = state === "expanded" ? 0 : range;
    Animated.spring(translateY, { toValue: to, useNativeDriver: true, bounciness: 2, speed: 14 }).start();
    onSnap?.(state);
  };

  useImperativeHandle(ref, () => ({ snapTo: animateTo }));

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 3,
      onPanResponderGrant: () => {
        startY.current = currentY.current;
      },
      onPanResponderMove: (_e, g) => {
        const v = Math.min(range, Math.max(0, startY.current + g.dy));
        translateY.setValue(v);
      },
      onPanResponderRelease: (_e, g) => {
        const v = currentY.current;
        let state: SheetState;
        if (g.vy < -0.5) state = "expanded";
        else if (g.vy > 0.5) state = "collapsed";
        else state = v < range / 2 ? "expanded" : "collapsed";
        animateTo(state);
      },
    }),
  ).current;

  return (
    <Animated.View style={[styles.sheet, { height: maxHeight, transform: [{ translateY }] }]}>
      <View style={styles.handleZone} {...pan.panHandlers}>
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
  handleZone: { paddingTop: 10, paddingBottom: 8, alignItems: "center" },
  handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: "rgba(120,160,220,0.35)" },
  content: { flex: 1 },
});
