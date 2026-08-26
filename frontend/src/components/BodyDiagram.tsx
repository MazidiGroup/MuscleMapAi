import React from "react";
import { View } from "react-native";
import Svg, { Path, Defs, LinearGradient, Stop, G, Circle } from "react-native-svg";

import { COLORS } from "@/src/theme";

export type MuscleStatus = "green" | "yellow" | "red" | "highlight" | "none";

export type MuscleMap = Partial<Record<
  | "chest" | "shoulders" | "arms" | "core" | "quads" | "calves"
  | "back" | "glutes" | "hamstrings",
  MuscleStatus
>>;

const COLOR_FOR_STATUS: Record<MuscleStatus, string> = {
  green: "#34D399",
  yellow: "#F59E0B",
  red: "#EF4444",
  /**
   * "This is the muscle you are looking at" — the atlas's selection colour,
   * carrying no recovery or fatigue meaning. It is deliberately warm rather
   * than one of the three status colours, so a browsing screen can never be
   * misread as a readiness readout.
   */
  highlight: "#E08A6B",
  none: "#2A2A30",
};

type Props = {
  view: "front" | "back" | "side";
  muscles: MuscleMap;
  onPressMuscle?: (group: string) => void;
  size?: number;
};

const Pressable = ({ children, onPress }: any) => children; // Placeholder for SVG-level press

function fill(status: MuscleStatus | undefined) {
  return COLOR_FOR_STATUS[status || "none"];
}

export function BodyDiagram({ view, muscles, onPressMuscle, size = 280 }: Props) {
  const w = size;
  const h = size * 1.85;

  if (view === "front") {
    return (
      <View>
        <Svg width={w} height={h} viewBox="0 0 200 370">
          <Defs>
            <LinearGradient id="bgShade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#0F0F14" />
              <Stop offset="1" stopColor="#080810" />
            </LinearGradient>
            {/* Alpha belongs in stopOpacity, not inside stopColor: react-native-svg
                ignores the alpha channel of an rgba() stop and paints it opaque,
                which turned this shading pass into a solid white wash over
                whatever colour the muscle underneath was meant to be. */}
            <LinearGradient id="muscleShade" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.25} />
              <Stop offset="1" stopColor="#000000" stopOpacity={0.25} />
            </LinearGradient>
          </Defs>
          {/* Background silhouette / skeleton hint */}
          <G opacity={0.92}>
            {/* Head */}
            <Circle cx="100" cy="28" r="20" fill="#1B1B22" stroke="#2A2A32" strokeWidth="0.8" />
            {/* Neck */}
            <Path d="M88 46 L112 46 L114 60 L86 60 Z" fill="#1B1B22" stroke="#2A2A32" strokeWidth="0.6" />
            {/* Torso silhouette */}
            <Path d="M62 60 L138 60 L150 200 L120 290 L80 290 L50 200 Z" fill="#13131A" stroke="#26262E" strokeWidth="0.6" />
            {/* Arm silhouettes */}
            <Path d="M50 65 L36 200 L48 220 L62 95 Z" fill="#13131A" stroke="#26262E" strokeWidth="0.6" />
            <Path d="M150 65 L164 200 L152 220 L138 95 Z" fill="#13131A" stroke="#26262E" strokeWidth="0.6" />
            {/* Forearms */}
            <Path d="M36 200 L30 285 L46 295 L48 220 Z" fill="#13131A" stroke="#26262E" strokeWidth="0.6" />
            <Path d="M164 200 L170 285 L154 295 L152 220 Z" fill="#13131A" stroke="#26262E" strokeWidth="0.6" />
            {/* Legs silhouette */}
            <Path d="M80 290 L72 360 L92 360 L98 290 Z" fill="#13131A" stroke="#26262E" strokeWidth="0.6" />
            <Path d="M120 290 L128 360 L108 360 L102 290 Z" fill="#13131A" stroke="#26262E" strokeWidth="0.6" />
          </G>

          {/* MUSCLES — front */}
          {/* Pecs (chest) — two lobes */}
          <G onPress={() => onPressMuscle?.("chest")}>
            <Path d="M70 72 Q98 76 98 100 Q88 110 72 108 Q62 100 64 86 Z" fill={fill(muscles.chest)} stroke="#000" strokeOpacity={0.35} strokeWidth="0.5" />
            <Path d="M130 72 Q102 76 102 100 Q112 110 128 108 Q138 100 136 86 Z" fill={fill(muscles.chest)} stroke="#000" strokeOpacity={0.35} strokeWidth="0.5" />
            <Path d="M70 72 Q98 76 98 100 Q88 110 72 108 Q62 100 64 86 Z" fill="url(#muscleShade)" />
            <Path d="M130 72 Q102 76 102 100 Q112 110 128 108 Q138 100 136 86 Z" fill="url(#muscleShade)" />
          </G>

          {/* Shoulders (delts) */}
          <G onPress={() => onPressMuscle?.("shoulders")}>
            <Path d="M52 64 Q68 60 70 80 Q66 92 56 96 Q46 88 50 74 Z" fill={fill(muscles.shoulders)} stroke="#000" strokeOpacity={0.35} strokeWidth="0.5" />
            <Path d="M148 64 Q132 60 130 80 Q134 92 144 96 Q154 88 150 74 Z" fill={fill(muscles.shoulders)} stroke="#000" strokeOpacity={0.35} strokeWidth="0.5" />
          </G>

          {/* Biceps (arms) */}
          <G onPress={() => onPressMuscle?.("arms")}>
            <Path d="M46 98 Q56 110 56 150 Q46 168 38 158 Q36 132 42 108 Z" fill={fill(muscles.arms)} stroke="#000" strokeOpacity={0.35} strokeWidth="0.5" />
            <Path d="M154 98 Q144 110 144 150 Q154 168 162 158 Q164 132 158 108 Z" fill={fill(muscles.arms)} stroke="#000" strokeOpacity={0.35} strokeWidth="0.5" />
            {/* Forearms */}
            <Path d="M38 175 Q40 215 38 270 Q34 280 32 268 Q32 220 32 180 Z" fill={fill(muscles.arms)} opacity={0.85} stroke="#000" strokeOpacity={0.35} strokeWidth="0.5" />
            <Path d="M162 175 Q160 215 162 270 Q166 280 168 268 Q168 220 168 180 Z" fill={fill(muscles.arms)} opacity={0.85} stroke="#000" strokeOpacity={0.35} strokeWidth="0.5" />
          </G>

          {/* Abs (core) — six-pack */}
          <G onPress={() => onPressMuscle?.("core")}>
            <Path d="M84 115 L116 115 L118 200 L82 200 Z" fill={fill(muscles.core)} stroke="#000" strokeOpacity={0.35} strokeWidth="0.5" />
            {/* Ab segmentation lines for detail */}
            <Path d="M84 138 L116 138 M84 158 L116 158 M84 178 L116 178 M100 115 L100 198" stroke="#000" strokeOpacity={0.25} strokeWidth="1" fill="none" />
          </G>

          {/* Obliques (also core, side) */}
          <Path d="M76 130 Q70 160 78 195 L82 200 L82 130 Z" fill={fill(muscles.core)} opacity={0.85} stroke="#000" strokeOpacity={0.3} strokeWidth="0.4" />
          <Path d="M124 130 Q130 160 122 195 L118 200 L118 130 Z" fill={fill(muscles.core)} opacity={0.85} stroke="#000" strokeOpacity={0.3} strokeWidth="0.4" />

          {/* Quads — two parts each leg */}
          <G onPress={() => onPressMuscle?.("quads")}>
            <Path d="M80 295 Q70 320 75 355 L85 355 Q86 320 88 295 Z" fill={fill(muscles.quads)} stroke="#000" strokeOpacity={0.35} strokeWidth="0.5" />
            <Path d="M91 295 Q92 320 92 355 L98 355 L98 295 Z" fill={fill(muscles.quads)} opacity={0.85} stroke="#000" strokeOpacity={0.3} strokeWidth="0.4" />
            <Path d="M120 295 Q130 320 125 355 L115 355 Q114 320 112 295 Z" fill={fill(muscles.quads)} stroke="#000" strokeOpacity={0.35} strokeWidth="0.5" />
            <Path d="M109 295 Q108 320 108 355 L102 355 L102 295 Z" fill={fill(muscles.quads)} opacity={0.85} stroke="#000" strokeOpacity={0.3} strokeWidth="0.4" />
          </G>

          {/* Calves visible on front lower */}
          <G onPress={() => onPressMuscle?.("calves")}>
            <Path d="M76 358 L94 358 L92 368 L78 368 Z" fill={fill(muscles.calves)} stroke="#000" strokeOpacity={0.35} strokeWidth="0.4" />
            <Path d="M106 358 L124 358 L122 368 L108 368 Z" fill={fill(muscles.calves)} stroke="#000" strokeOpacity={0.35} strokeWidth="0.4" />
          </G>
        </Svg>
      </View>
    );
  }

  if (view === "back") {
    return (
      <View>
        <Svg width={w} height={h} viewBox="0 0 200 370">
          <Defs>
            <LinearGradient id="muscleShadeBack" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.25} />
              <Stop offset="1" stopColor="#000000" stopOpacity={0.25} />
            </LinearGradient>
          </Defs>
          <G opacity={0.92}>
            <Circle cx="100" cy="28" r="20" fill="#1B1B22" stroke="#2A2A32" strokeWidth="0.8" />
            <Path d="M88 46 L112 46 L114 60 L86 60 Z" fill="#1B1B22" />
            <Path d="M62 60 L138 60 L150 200 L120 290 L80 290 L50 200 Z" fill="#13131A" stroke="#26262E" strokeWidth="0.6" />
            <Path d="M50 65 L36 200 L48 220 L62 95 Z" fill="#13131A" stroke="#26262E" strokeWidth="0.6" />
            <Path d="M150 65 L164 200 L152 220 L138 95 Z" fill="#13131A" stroke="#26262E" strokeWidth="0.6" />
            <Path d="M36 200 L30 285 L46 295 L48 220 Z" fill="#13131A" stroke="#26262E" strokeWidth="0.6" />
            <Path d="M164 200 L170 285 L154 295 L152 220 Z" fill="#13131A" stroke="#26262E" strokeWidth="0.6" />
            <Path d="M80 290 L72 360 L92 360 L98 290 Z" fill="#13131A" stroke="#26262E" strokeWidth="0.6" />
            <Path d="M120 290 L128 360 L108 360 L102 290 Z" fill="#13131A" stroke="#26262E" strokeWidth="0.6" />
          </G>

          {/* Traps */}
          <G onPress={() => onPressMuscle?.("back")}>
            <Path d="M82 60 Q100 64 118 60 Q116 78 100 84 Q84 78 82 60 Z" fill={fill(muscles.back)} stroke="#000" strokeOpacity={0.35} strokeWidth="0.5" />
            {/* Lats (wide back) */}
            <Path d="M62 90 Q74 105 70 165 Q80 175 95 165 L95 90 Z" fill={fill(muscles.back)} stroke="#000" strokeOpacity={0.35} strokeWidth="0.5" />
            <Path d="M138 90 Q126 105 130 165 Q120 175 105 165 L105 90 Z" fill={fill(muscles.back)} stroke="#000" strokeOpacity={0.35} strokeWidth="0.5" />
            {/* Lower back */}
            <Path d="M82 170 L118 170 L115 200 L85 200 Z" fill={fill(muscles.back)} opacity={0.9} stroke="#000" strokeOpacity={0.3} strokeWidth="0.4" />
          </G>

          {/* Rear delts */}
          <G onPress={() => onPressMuscle?.("shoulders")}>
            <Path d="M52 64 Q66 62 70 80 Q66 92 56 96 Q46 88 50 74 Z" fill={fill(muscles.shoulders)} stroke="#000" strokeOpacity={0.35} strokeWidth="0.5" />
            <Path d="M148 64 Q134 62 130 80 Q134 92 144 96 Q154 88 150 74 Z" fill={fill(muscles.shoulders)} stroke="#000" strokeOpacity={0.35} strokeWidth="0.5" />
          </G>

          {/* Triceps */}
          <G onPress={() => onPressMuscle?.("arms")}>
            <Path d="M46 98 Q56 110 56 150 Q46 168 38 158 Q36 132 42 108 Z" fill={fill(muscles.arms)} stroke="#000" strokeOpacity={0.35} strokeWidth="0.5" />
            <Path d="M154 98 Q144 110 144 150 Q154 168 162 158 Q164 132 158 108 Z" fill={fill(muscles.arms)} stroke="#000" strokeOpacity={0.35} strokeWidth="0.5" />
          </G>

          {/* Glutes */}
          <G onPress={() => onPressMuscle?.("glutes")}>
            <Path d="M70 205 Q88 195 99 215 Q99 248 78 248 Q66 240 70 205 Z" fill={fill(muscles.glutes)} stroke="#000" strokeOpacity={0.35} strokeWidth="0.5" />
            <Path d="M130 205 Q112 195 101 215 Q101 248 122 248 Q134 240 130 205 Z" fill={fill(muscles.glutes)} stroke="#000" strokeOpacity={0.35} strokeWidth="0.5" />
          </G>

          {/* Hamstrings */}
          <G onPress={() => onPressMuscle?.("hamstrings")}>
            <Path d="M76 250 Q70 280 76 320 L92 320 Q94 285 90 250 Z" fill={fill(muscles.hamstrings)} stroke="#000" strokeOpacity={0.35} strokeWidth="0.5" />
            <Path d="M124 250 Q130 280 124 320 L108 320 Q106 285 110 250 Z" fill={fill(muscles.hamstrings)} stroke="#000" strokeOpacity={0.35} strokeWidth="0.5" />
          </G>

          {/* Calves */}
          <G onPress={() => onPressMuscle?.("calves")}>
            <Path d="M72 322 Q70 345 76 360 L88 360 Q92 340 92 322 Z" fill={fill(muscles.calves)} stroke="#000" strokeOpacity={0.35} strokeWidth="0.5" />
            <Path d="M128 322 Q130 345 124 360 L112 360 Q108 340 108 322 Z" fill={fill(muscles.calves)} stroke="#000" strokeOpacity={0.35} strokeWidth="0.5" />
          </G>
        </Svg>
      </View>
    );
  }

  // SIDE view (simplified)
  return (
    <View>
      <Svg width={w} height={h} viewBox="0 0 200 370">
        <G opacity={0.92}>
          <Circle cx="100" cy="28" r="20" fill="#1B1B22" />
          <Path d="M85 50 L115 50 L120 60 L80 60 Z" fill="#1B1B22" />
          <Path d="M75 60 L125 60 L130 200 L110 290 L90 290 L70 200 Z" fill="#13131A" stroke="#26262E" strokeWidth="0.6" />
          <Path d="M120 70 L155 200 L140 220 L125 110 Z" fill="#13131A" stroke="#26262E" strokeWidth="0.6" />
          <Path d="M90 290 L80 360 L120 360 L110 290 Z" fill="#13131A" stroke="#26262E" strokeWidth="0.6" />
        </G>
        {/* Chest (side angle) */}
        <Path d="M75 70 Q92 75 92 105 Q80 112 75 105 Z" fill={fill(muscles.chest)} onPress={() => onPressMuscle?.("chest")} />
        {/* Shoulders */}
        <Path d="M115 65 Q130 70 128 88 Q115 92 110 85 Z" fill={fill(muscles.shoulders)} onPress={() => onPressMuscle?.("shoulders")} />
        {/* Back (lats side) */}
        <Path d="M125 110 Q132 145 128 175 Q116 178 116 145 Z" fill={fill(muscles.back)} onPress={() => onPressMuscle?.("back")} />
        {/* Core */}
        <Path d="M88 115 Q96 145 92 195 L82 200 L80 130 Z" fill={fill(muscles.core)} onPress={() => onPressMuscle?.("core")} />
        {/* Arms */}
        <Path d="M125 105 Q145 145 140 175 Q130 175 130 145 Z" fill={fill(muscles.arms)} onPress={() => onPressMuscle?.("arms")} />
        {/* Glutes */}
        <Path d="M118 205 Q132 215 130 245 Q120 250 115 240 Z" fill={fill(muscles.glutes)} onPress={() => onPressMuscle?.("glutes")} />
        {/* Quads */}
        <Path d="M90 295 Q86 325 88 355 L100 355 Q102 325 100 295 Z" fill={fill(muscles.quads)} onPress={() => onPressMuscle?.("quads")} />
        {/* Hamstrings */}
        <Path d="M102 295 Q106 325 110 355 L118 355 Q112 325 110 295 Z" fill={fill(muscles.hamstrings)} onPress={() => onPressMuscle?.("hamstrings")} />
      </Svg>
    </View>
  );
}
