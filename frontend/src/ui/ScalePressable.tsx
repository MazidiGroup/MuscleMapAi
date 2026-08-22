import React, { useRef } from "react";
import { Animated, Pressable, PressableProps, StyleProp, ViewStyle } from "react-native";

import { useReducedMotion } from "@/src/components/useReducedMotion";

/** Small native-driver micro-interaction shared by the deck and premium cards. */
export function ScalePressable({
  children,
  style,
  disabled,
  ...props
}: PressableProps & { style?: StyleProp<ViewStyle> }) {
  const scale = useRef(new Animated.Value(1)).current;
  const reduceMotion = useReducedMotion();

  const animate = (toValue: number) => {
    if (reduceMotion) return;
    Animated.spring(scale, {
      toValue,
      useNativeDriver: true,
      speed: 28,
      bounciness: 4,
    }).start();
  };

  return (
    <Animated.View style={[style, { transform: [{ scale }] }]}>
      <Pressable
        {...props}
        disabled={disabled}
        onPressIn={(event) => {
          animate(0.965);
          props.onPressIn?.(event);
        }}
        onPressOut={(event) => {
          animate(1);
          props.onPressOut?.(event);
        }}
        style={{ flex: 1 }}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
