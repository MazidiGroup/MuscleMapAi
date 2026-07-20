// Exercise animation player (new MP4 pack, July 2026).
// Playback rules (per product spec):
//  - hero (exercise detail): autoplay silently, loop, pause when screen loses focus
//  - thumb (library rows): static poster only, never autoplays
//  - card (best-exercise cards): poster by default, animates on tap, parent ensures one at a time
//  - workout (active session): paused poster by default with play/pause + replay controls
//  - reduced-motion: never autoplay; explicit play still works
//
// Media is served from the backend at /api/exercise-media/<id>/animation (mp4)
// with a matching /api/exercise-media/<id>/poster (webp). Exercises without a
// mapped animation fall back to the provided `fallback` node (neutral icon).
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
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

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  if (!FLAGS.exerciseAnimations) return <>{fallback}</>;
  if (!media.loaded) return <>{fallback}</>;
  if (!media.hasAnimation && !media.hasPoster) return <>{fallback}</>;

  const defaultPlaying = variant === "hero" ? !reduced : false;
  const isPlaying =
    media.hasAnimation &&
    focused &&
    (variant === "card" ? !!playing : (userPlaying ?? defaultPlaying));

  // ---- Thumb variant: static poster image only, never plays video ----
  if (variant === "thumb") {
    const src = media.hasPoster ? { uri: posterUrl(exerciseId) } : null;
    if (!src) return <>{fallback}</>;
    return (
      <Image
        source={src}
        style={[styles.thumb, { width: size, height: size }]}
        contentFit="cover"
        transition={100}
        accessibilityLabel="Exercise preview"
      />
    );
  }

  // ---- Card variant: poster overlay + optional MP4 when playing ----
  if (variant === "card") {
    return (
      <TouchableOpacity
        onPress={onTogglePlay}
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? "Pause exercise animation" : "Play exercise animation"}
        testID={`anim-card-${exerciseId}`}
      >
        <View style={[styles.thumb, { width: size, height: size, overflow: "hidden" }]}>
          {media.hasPoster && (
            <Image source={{ uri: posterUrl(exerciseId) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={100} />
          )}
          {isPlaying && (
            <AnimationPlayer exerciseId={exerciseId} playing loop muted contentFit="cover" />
          )}
          {!isPlaying && media.hasAnimation && (
            <View style={styles.playBadge}>
              <Ionicons name="play" size={10} color={T.text} />
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  // ---- Hero + workout: large 16:9 block with controls ----
  const toggle = () => setUserPlaying((p) => !(p ?? defaultPlaying));

  return (
    <View style={[styles.large, variant === "workout" && styles.largeWorkout]} testID={`anim-${variant}-${exerciseId}`}>
      {media.hasPoster && (
        <Image source={{ uri: posterUrl(exerciseId) }} style={StyleSheet.absoluteFill} contentFit="contain" transition={120} />
      )}
      {isPlaying && (
        <AnimationPlayer exerciseId={exerciseId} playing loop muted contentFit="contain" />
      )}
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
              onPress={() => setUserPlaying(true)}
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

// ---------------- Internal MP4 player (expo-video) ----------------
type PlayerProps = {
  exerciseId: string;
  playing: boolean;
  loop?: boolean;
  muted?: boolean;
  contentFit: "cover" | "contain";
};

const AnimationPlayer = React.memo(function AnimationPlayer({ exerciseId, playing, loop = true, muted = true, contentFit }: PlayerProps) {
  const uri = useMemo(() => animationUrl(exerciseId), [exerciseId]);
  const player = useVideoPlayer(uri, (p) => {
    p.loop = loop;
    p.muted = muted;
    if (playing) p.play();
  });
  const mountedRef = useRef(true);

  useEffect(() => {
    if (!player) return;
    try {
      player.muted = muted;
      player.loop = loop;
      if (playing) player.play();
      else player.pause();
    } catch {
      /* player may be transitioning */
    }
  }, [player, playing, loop, muted]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      try {
        player?.pause();
      } catch {
        /* ignore */
      }
    };
  }, [player]);

  return (
    <VideoView
      style={StyleSheet.absoluteFill}
      player={player}
      contentFit={contentFit}
      nativeControls={false}
      allowsFullscreen={false}
      allowsPictureInPicture={false}
    />
  );
});

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
