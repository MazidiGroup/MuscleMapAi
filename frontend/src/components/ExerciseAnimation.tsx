// Exercise animation player (July 2026 MP4 pack).
//
// Playback rules:
//  - hero (exercise detail): **always autoplay silently on mount**, loop, still
//    respects the parent's pause button. Exercise demonstrations are
//    essential media, not gratuitous animation — `prefers-reduced-motion` does
//    NOT block them (the user explicitly navigated here to see the movement).
//  - thumb (library rows): static poster only, never plays.
//  - card (best-exercise cards): poster by default, plays on tap; parent
//    coordinates so only one card animates at a time.
//  - workout (active session): autoplays like hero — the athlete needs the
//    demo playing without extra taps.
//
// Under the hood the video player is ALWAYS mounted when a mapped MP4 exists,
// which primes the source and gives us a valid `player` handle for
// play()/pause() control. The poster is drawn as a background layer so there
// is never a black flash while the video buffers.
import React, { useEffect, useMemo, useState } from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { Ionicons } from "@expo/vector-icons";

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

const AUTOPLAY_VARIANTS: Variant[] = ["hero", "workout"];

export function ExerciseAnimation({ exerciseId, variant, playing, onTogglePlay, size = 40, fallback = null }: Props) {
  const media = useExerciseMedia(exerciseId);
  const defaultPlaying = AUTOPLAY_VARIANTS.includes(variant);
  const [userPlaying, setUserPlaying] = useState<boolean | null>(null); // null = variant default

  if (!FLAGS.exerciseAnimations) return <>{fallback}</>;
  // While the manifest is being fetched we don't know yet whether this
  // exercise has media — render the fallback (usually null) so the layout
  // doesn't jump when the video slot appears.
  if (!media.loaded) return <>{fallback}</>;
  if (!media.hasAnimation && !media.hasPoster) return <>{fallback}</>;

  const controlledPlaying = variant === "card" ? !!playing : (userPlaying ?? defaultPlaying);
  const shouldPlay = media.hasAnimation && controlledPlaying;

  // ---- Thumb variant: static poster only, no video ----
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

  // ---- Card variant: poster + inline MP4 when tapped ----
  if (variant === "card") {
    return (
      <TouchableOpacity
        onPress={onTogglePlay}
        accessibilityRole="button"
        accessibilityLabel={shouldPlay ? "Pause exercise animation" : "Play exercise animation"}
        testID={`anim-card-${exerciseId}`}
      >
        <View style={[styles.thumb, { width: size, height: size, overflow: "hidden" }]}>
          {media.hasPoster && (
            <Image source={{ uri: posterUrl(exerciseId) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={100} />
          )}
          {media.hasAnimation && (
            <AnimationPlayer exerciseId={exerciseId} playing={shouldPlay} contentFit="cover" />
          )}
          {!shouldPlay && media.hasAnimation && (
            <View style={styles.playBadge}>
              <Ionicons name="play" size={10} color={T.text} />
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  // ---- Hero + Workout: large block, autoplay by default ----
  const toggle = () => setUserPlaying((prev) => !(prev ?? defaultPlaying));

  return (
    <View style={[styles.large, variant === "workout" && styles.largeWorkout]} testID={`anim-${variant}-${exerciseId}`}>
      {media.hasPoster && (
        <Image source={{ uri: posterUrl(exerciseId) }} style={StyleSheet.absoluteFill} contentFit="contain" transition={120} />
      )}
      {media.hasAnimation && (
        <AnimationPlayer exerciseId={exerciseId} playing={shouldPlay} contentFit="contain" />
      )}
      {media.hasAnimation && (
        <View style={styles.controls} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.ctrlBtn}
            onPress={toggle}
            accessibilityRole="button"
            accessibilityLabel={shouldPlay ? "Pause" : "Play"}
            testID={`anim-toggle-${exerciseId}`}
          >
            <Ionicons name={shouldPlay ? "pause" : "play"} size={16} color={T.text} />
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
  contentFit: "cover" | "contain";
};

const AnimationPlayer = React.memo(function AnimationPlayer({ exerciseId, playing, contentFit }: PlayerProps) {
  const uri = useMemo(() => animationUrl(exerciseId), [exerciseId]);
  // Configure the player at construction so `.play()` fires as soon as the
  // media element receives the source — no waiting on a second effect tick.
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    if (playing) {
      try {
        p.play();
      } catch {
        /* iOS may reject the very first synchronous play; the effect below retries */
      }
    }
  });

  // Keep play/pause in sync with the `playing` prop across the component's life.
  useEffect(() => {
    if (!player) return;
    try {
      player.muted = true;
      player.loop = true;
      if (playing) player.play();
      else player.pause();
    } catch {
      /* player may be transitioning */
    }
  }, [player, playing]);

  // Pause on unmount so the audio session releases and other videos can autoplay.
  useEffect(() => {
    return () => {
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
