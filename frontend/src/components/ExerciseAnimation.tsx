// Exercise animation player (RepDB licensed pack).
// Playback rules (per product spec):
//  - hero (exercise detail): autoplay silently, loop, pause when screen loses focus
//  - thumb (library rows): static poster only, never autoplays
//  - card (best-exercise cards): poster by default, animates on tap, parent ensures one at a time
//  - workout (active session): paused poster by default with play/pause + replay controls
//  - reduced-motion: never autoplay; explicit play still works
import React, { useCallback, useState } from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useReducedMotion } from "react-native-reanimated";

import { useExerciseMedia, animationUrl, posterUrl } from "@/src/anatomy/media";
import { T } from "@/src/anatomy/ui";
import { FLAGS } from "@/src/config/featureFlags";

type Variant = "hero" | "thumb" | "card" | "workout";

type Props = {
  exerciseId: string;
  variant: Variant;
  /** Controlled play state (card variant — parent keeps one card animating at a time). */
  playing?: boolean;
  onTogglePlay?: () => void;
  /** Square size for thumb/card variants. */
  size?: number;
  /** Rendered instead when this exercise has no media (e.g. the old icon). */
  fallback?: React.ReactNode;
};

export function ExerciseAnimation({ exerciseId, variant, playing, onTogglePlay, size = 40, fallback = null }: Props) {
  const media = useExerciseMedia(exerciseId);
  const reduced = useReducedMotion();
  const [userPlaying, setUserPlaying] = useState<boolean | null>(null); // null = use variant default
  const [focused, setFocused] = useState(true);
  const [replayKey, setReplayKey] = useState(0);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  if (!FLAGS.exerciseAnimations) return <>{fallback}</>;
  if (!media.hasAnimation && !media.hasPoster) return <>{fallback}</>;

  const defaultPlaying = variant === "hero" ? !reduced : false;
  const isPlaying =
    media.hasAnimation &&
    focused &&
    (variant === "card" ? !!playing : (userPlaying ?? defaultPlaying));

  // Poster fallback: if no dedicated poster file, show the animation's first frame (autoplay off).
  const source = isPlaying
    ? { uri: animationUrl(exerciseId) }
    : media.hasPoster
      ? { uri: posterUrl(exerciseId) }
      : { uri: animationUrl(exerciseId) };
  const autoplay = isPlaying;

  if (variant === "thumb") {
    return (
      <Image
        source={source}
        autoplay={false}
        style={[styles.thumb, { width: size, height: size }]}
        contentFit="cover"
        transition={100}
        accessibilityLabel="Exercise preview"
      />
    );
  }

  if (variant === "card") {
    return (
      <TouchableOpacity
        onPress={onTogglePlay}
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? "Pause exercise animation" : "Play exercise animation"}
        testID={`anim-card-${exerciseId}`}
      >
        <View>
          <Image
            key={replayKey}
            source={source}
            autoplay={autoplay}
            style={[styles.thumb, { width: size, height: size }]}
            contentFit="cover"
            transition={100}
          />
          {!isPlaying && media.hasAnimation && (
            <View style={styles.playBadge}>
              <Ionicons name="play" size={10} color={T.text} />
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  // hero + workout: large 16:9-ish block
  const toggle = () => setUserPlaying((p) => !(p ?? defaultPlaying));
  const replay = () => {
    setReplayKey((k) => k + 1);
    setUserPlaying(true);
  };

  return (
    <View style={[styles.large, variant === "workout" && styles.largeWorkout]} testID={`anim-${variant}-${exerciseId}`}>
      <Image
        key={replayKey}
        source={source}
        autoplay={autoplay}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        transition={150}
        accessibilityLabel="Exercise animation"
      />
      {media.hasAnimation && (
        <View style={styles.controls}>
          <TouchableOpacity
            style={styles.ctrlBtn}
            onPress={toggle}
            accessibilityRole="button"
            accessibilityLabel={isPlaying ? "Pause" : "Play"}
            testID={`anim-toggle-${exerciseId}`}
          >
            <Ionicons name={isPlaying ? "pause" : "play"} size={16} color={T.text} />
          </TouchableOpacity>
          {variant === "workout" && (
            <TouchableOpacity
              style={styles.ctrlBtn}
              onPress={replay}
              accessibilityRole="button"
              accessibilityLabel="Replay"
              testID={`anim-replay-${exerciseId}`}
            >
              <Ionicons name="refresh" size={16} color={T.text} />
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  thumb: { borderRadius: 10, backgroundColor: T.surfaceHi },
  playBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(7,10,15,0.85)",
    borderWidth: 1,
    borderColor: T.borderHi,
    alignItems: "center",
    justifyContent: "center",
  },
  large: {
    aspectRatio: 16 / 10,
    borderRadius: 16,
    backgroundColor: T.bg2,
    borderWidth: 1,
    borderColor: T.border,
    overflow: "hidden",
    marginTop: 12,
  },
  largeWorkout: { aspectRatio: 16 / 9, marginTop: 0, marginBottom: 10 },
  controls: { position: "absolute", right: 8, bottom: 8, flexDirection: "row", gap: 8 },
  ctrlBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(7,10,15,0.72)",
    borderWidth: 1,
    borderColor: T.border,
    alignItems: "center",
    justifyContent: "center",
  },
});
