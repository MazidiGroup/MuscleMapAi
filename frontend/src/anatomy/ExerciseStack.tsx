// Stacked exercise carousel for the live session.
//
// Ported from the "carousel-07" stacked-card reference: cards sit on one
// another with the exercise in hand in front and its neighbours peeking out
// behind it, offset, dropped, scaled and tilted by their distance from the
// front. A horizontal drag moves through the stack and momentum carries at
// most two cards further. Exactly three cards are visible at rest — the front
// and one either side — and the card two steps back fades in only mid-drag.
//
// Only the front card takes touches, so the set inputs inside it behave
// exactly as they would in a list. The pan activates only on a clearly
// horizontal movement, so taps and vertical scrolling pass straight through
// to the card and the page. The stack never loops: an exercise list has a
// first and a last, and the arrows beneath it give the same movement to
// anyone who cannot swipe.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { liquidShadow } from "@/src/ui/GlassSurface";
import { useTheme } from "@/src/theme/ThemeContext";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

/** Sideways peek per step back, in px. */
const X = 26;
/** Drop per step back, in px. */
const Y = 12;
/** Tilt per step back, in degrees. */
const ROT = 4;
/** Scale lost per step back. */
const SCALE = 0.06;
/** Drag distance that moves the stack one card. */
const SENSITIVITY = 220;
const DISTANCE_DIVISOR = 140;
const VELOCITY_DIVISOR = 600;
/** How far past either end a drag can stretch before it springs back. */
const OVERSCROLL = 0.3;
const SPRING = { stiffness: 200, damping: 30, mass: 1 };
/** Height used before any card has reported its own. */
const FALLBACK_HEIGHT = 260;
/** Cards kept mounted either side of the front one. */
const WINDOW = 2;

export function ExerciseStack<T>({
  items,
  keyOf,
  index,
  onIndexChange,
  renderCard,
  reduceMotion = false,
  testID,
}: {
  items: T[];
  keyOf: (item: T) => string;
  /** The card in front. Controlled, so arrows and removals can move it too. */
  index: number;
  onIndexChange: (index: number) => void;
  renderCard: (item: T, index: number, isFront: boolean) => React.ReactNode;
  reduceMotion?: boolean;
  testID?: string;
}) {
  const total = items.length;
  // `index` is clamped HERE, at the moment of use, not only by the caller: a
  // parent's clamp runs in an effect after render, and the render that used the
  // stale index has already indexed past the end by then. A session that shrank
  // (an exercise removed, a different workout resumed) while this stack held an
  // older index used to render `items[undefined]` — a blank screen.
  const safeIndex = total > 0 ? Math.min(Math.max(0, index), total - 1) : 0;
  const { mode } = useTheme();
  // Every card carries the same opaque fill, so depth has to come from the
  // shadow: without it, overlapping cards of one colour read as a single blob.
  const cardShadow = useMemo(() => liquidShadow(mode, true), [mode]);
  const progress = useSharedValue(safeIndex);
  const start = useSharedValue(safeIndex);
  const [heights, setHeights] = useState<Record<string, number>>({});

  // Index changes from outside (the arrows, a removed exercise) animate the
  // stack the same way a swipe does. Reduce Motion settles instantly.
  useEffect(() => {
    progress.value = reduceMotion ? withTiming(safeIndex, { duration: 0 }) : withSpring(safeIndex, SPRING);
  }, [safeIndex, reduceMotion, progress]);

  const settle = useCallback((target: number) => onIndexChange(target), [onIndexChange]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-14, 14])
        .failOffsetY([-10, 10])
        .onStart(() => {
          start.value = progress.value;
        })
        .onUpdate((e) => {
          const next = start.value - e.translationX / SENSITIVITY;
          progress.value = Math.min(Math.max(next, -OVERSCROLL), total - 1 + OVERSCROLL);
        })
        .onEnd((e) => {
          const shift = Math.round(-e.translationX / DISTANCE_DIVISOR - e.velocityX / VELOCITY_DIVISOR);
          const bounded = Math.max(-2, Math.min(2, shift));
          const target = Math.max(0, Math.min(total - 1, Math.round(start.value) + bounded));
          progress.value = reduceMotion ? withTiming(target, { duration: 0 }) : withSpring(target, SPRING);
          runOnJS(settle)(target);
        }),
    [total, reduceMotion, settle, progress, start],
  );

  // The stage is as tall as the tallest card in the visible neighbourhood,
  // plus the drop of the cards behind, so nothing pokes out of the bottom and
  // the page does not jump as the front card changes.
  const height = useMemo(() => {
    let max = 0;
    for (let i = Math.max(0, safeIndex - 1); i <= Math.min(total - 1, safeIndex + 1); i++) {
      const item = items[i];
      if (!item) continue;
      const h = heights[keyOf(item)];
      if (h && h > max) max = h;
    }
    return (max || FALLBACK_HEIGHT) + Y;
  }, [heights, safeIndex, items, keyOf, total]);

  const onHeight = useCallback((key: string, h: number) => {
    setHeights((prev) => (prev[key] === h ? prev : { ...prev, [key]: h }));
  }, []);

  // Only the neighbourhood is rendered. Three cards are visible at rest and a
  // fourth fades in mid-drag, so anything past WINDOW is mounted for nothing —
  // and a session card is not cheap: each one scans the whole history for its
  // own target and records. At seven exercises this was doing that work seven
  // times to show three cards.
  //
  // Render order puts the front card last, so it is on top even where an
  // animated zIndex alone would not reorder siblings.
  const order = useMemo(
    () =>
      items
        .map((_, i) => i)
        .filter((i) => Math.abs(i - safeIndex) <= WINDOW)
        .sort((a, b) => Math.abs(b - safeIndex) - Math.abs(a - safeIndex)),
    [items, safeIndex],
  );

  return (
    <GestureDetector gesture={pan}>
      <View style={[styles.stage, { height }]} testID={testID}>
        {order.map((i) => {
          const item = items[i];
          if (!item) return null;
          const key = keyOf(item);
          const isFront = i === safeIndex;
          return (
            <StackCard key={key} i={i} progress={progress} isFront={isFront} shadow={cardShadow} onHeight={(h) => onHeight(key, h)}>
              {renderCard(item, i, isFront)}
            </StackCard>
          );
        })}
      </View>
    </GestureDetector>
  );
}

function StackCard({
  i,
  progress,
  isFront,
  shadow,
  onHeight,
  children,
}: {
  i: number;
  progress: SharedValue<number>;
  isFront: boolean;
  shadow: object;
  onHeight: (height: number) => void;
  children: React.ReactNode;
}) {
  const style = useAnimatedStyle(() => {
    const o = i - progress.value;
    const a = Math.abs(o);
    return {
      transform: [
        { translateX: o * X },
        { translateY: a * Y },
        { scale: 1 - a * SCALE },
        { rotate: `${o * ROT}deg` },
      ],
      opacity: interpolate(a, [0, 1, 2], [1, 1, 0], Extrapolation.CLAMP),
      zIndex: Math.round(100 - a * 10),
    };
  });

  return (
    <Animated.View
      style={[styles.card, shadow, style]}
      pointerEvents={isFront ? "auto" : "none"}
      accessibilityElementsHidden={!isFront}
      importantForAccessibility={isFront ? "auto" : "no-hide-descendants"}
      onLayout={(e) => onHeight(e.nativeEvent.layout.height)}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stage: { width: "100%" },
  card: { position: "absolute", left: 0, right: 0, top: 0 },
});
