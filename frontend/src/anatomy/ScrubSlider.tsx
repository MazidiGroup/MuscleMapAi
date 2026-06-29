import React, { useRef, useState } from "react";
import { View, StyleSheet, PanResponder, LayoutChangeEvent } from "react-native";
import { T } from "./ui";

type Props = {
  value: number; // 0..1
  onChange: (v: number) => void;
};

export function ScrubSlider({ value, onChange }: Props) {
  const widthRef = useRef(1);
  const [w, setW] = useState(1);

  const set = (x: number) => {
    const v = Math.max(0, Math.min(1, x / widthRef.current));
    onChange(v);
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => set(e.nativeEvent.locationX),
      onPanResponderMove: (e) => set(e.nativeEvent.locationX),
    }),
  ).current;

  const onLayout = (e: LayoutChangeEvent) => {
    widthRef.current = e.nativeEvent.layout.width;
    setW(e.nativeEvent.layout.width);
  };

  return (
    <View style={styles.wrap} onLayout={onLayout} {...pan.panHandlers} testID="shrink-slider">
      <View style={styles.track} />
      <View style={[styles.fill, { width: Math.max(0, value * w) }]} />
      <View style={[styles.thumb, { left: Math.max(0, value * w - 12) }]} />
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
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 3,
    borderColor: T.accent,
    top: 6,
  },
});
