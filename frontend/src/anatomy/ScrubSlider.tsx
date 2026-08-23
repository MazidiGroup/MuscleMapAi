import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, StyleSheet, PanResponder, LayoutChangeEvent, Platform } from "react-native";
import { T } from "./ui";

type Props = {
  value: number; // 0..1
  onChange: (v: number) => void;
};

// Smooth 1D slider used for the "Shrunken muscle view" percentage.
//
// Fixes over the earlier version (which glitched on real devices):
//  - Uses page-relative geometry (`measureInWindow`) so the value stays anchored
//    regardless of which sub-child the finger crosses. Previously we relied on
//    `nativeEvent.locationX`, which snaps between the wrapping View and the
//    thumb child and produces the "jumping" artifact.
//  - style.pointerEvents "none" on fill/thumb so touches never re-target them.
//  - Values are pushed via rAF, coalescing multiple move events into one JS
//    dispatch per frame — keeps the 3D shrink update in lock-step with the
//    finger and avoids ordered/dropped updates on iOS.
//  - Vertical `hitSlop` widens the touch band without visually thickening it.
export function ScrubSlider({ value, onChange }: Props) {
  const wrapRef = useRef<View>(null);
  const wrapXRef = useRef(0);
  const widthRef = useRef(1);
  const [w, setW] = useState(1);
  const rafRef = useRef<number | null>(null);
  const latestRef = useRef(value);

  const flush = useCallback(() => {
    rafRef.current = null;
    onChange(latestRef.current);
  }, [onChange]);

  const schedule = useCallback(
    (v: number) => {
      latestRef.current = v;
      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(flush);
      }
    },
    [flush],
  );

  const setFromPageX = useCallback(
    (pageX: number) => {
      const width = widthRef.current || 1;
      const raw = (pageX - wrapXRef.current) / width;
      const clamped = raw < 0 ? 0 : raw > 1 ? 1 : raw;
      schedule(clamped);
    },
    [schedule],
  );

  const measure = useCallback(() => {
    wrapRef.current?.measureInWindow((x, _y, width) => {
      wrapXRef.current = x;
      if (width > 0) {
        widthRef.current = width;
        setW(width);
      }
    });
  }, []);

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      widthRef.current = e.nativeEvent.layout.width;
      setW(e.nativeEvent.layout.width);
      // Re-read absolute page X after the view is on screen.
      // On web the layout callback fires before geometry stabilizes; a
      // rAF tick gives the browser one frame to place the element.
      requestAnimationFrame(measure);
    },
    [measure],
  );

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        // Re-measure at gesture start so scroll/keyboard shifts are accounted for.
        wrapRef.current?.measureInWindow((x, _y, width) => {
          wrapXRef.current = x;
          if (width > 0) {
            widthRef.current = width;
          }
          setFromPageX(e.nativeEvent.pageX);
        });
      },
      onPanResponderMove: (e) => setFromPageX(e.nativeEvent.pageX),
      onPanResponderRelease: (e) => setFromPageX(e.nativeEvent.pageX),
    }),
  ).current;

  const thumbLeft = Math.max(0, Math.min(w - 24, value * w - 12));

  return (
    <View
      ref={wrapRef}
      style={styles.wrap}
      onLayout={onLayout}
      hitSlop={{ top: 12, bottom: 12, left: 0, right: 0 }}
      {...pan.panHandlers}
      testID="shrink-slider"
      // On web, prevent the browser from turning drags into text selection.
      // @ts-ignore RN Web extension
      dataSet={Platform.OS === "web" ? { userSelect: "none" } : undefined}
    >
      <View style={[styles.track, { pointerEvents: "none" }]} />
      <View style={[styles.fill, { width: Math.max(0, value * w), pointerEvents: "none" }]} />
      <View style={[styles.thumb, { left: thumbLeft, pointerEvents: "none" }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 36, justifyContent: "center" },
  track: { height: 6, borderRadius: 3, backgroundColor: "rgba(120,160,220,0.2)" },
  fill: { position: "absolute", height: 6, borderRadius: 3, backgroundColor: T.accent },
  thumb: {
    position: "absolute",
    width: 24,
    height: 24,
    borderRadius: 22,
    backgroundColor: "#fff",
    borderWidth: 3,
    borderColor: T.accent,
    top: 6,
  },
});
