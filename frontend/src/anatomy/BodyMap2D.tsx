// BodyMap2D — a lightweight front/back body in react-native-svg. No WebGL.
//
// One region per gym group (chest, back, …): the 3D model's muscle nodes are
// reduced to these groups by the same node → group mapping the recovery engine
// uses (see bodyMap.ts), so this body and the Insights heat map always agree.
//
// Two ways to colour it:
//   · `states` — the five recovery states, in the Insights heat-map colours.
//   · `fills`  — an explicit colour per group (the finish card's copper ramp).
//
// With `reveal`, the listed groups fill from `from` to their final colour one
// after another (~60 ms apart) on mount; under Reduce Motion they simply
// appear in their final colour.
//
// Fatigued and recovering regions get a soft glow: a blurred duplicate layer
// under the body at ~0.6 opacity. It breathes slowly, unless Reduce Motion is
// on, when it holds still. There is no premium check anywhere in here — the
// Today body is free.

import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import Svg, { Defs, Ellipse, FeGaussianBlur, Filter, G, Path } from "react-native-svg";

import { useReducedMotion } from "@/src/components/useReducedMotion";
import { useTheme } from "@/src/theme/ThemeContext";
import type { BodyState } from "./bodyMap";
import { RECOVERY_COLORS, RECOVERY_LEGEND, type RecoveryState } from "./workoutStore";

export type { BodyState } from "./bodyMap";
export type BodyView = "front" | "back";

/** The body's state name → the heat map's state name (only the empty state differs). */
const HEAT_STATE: Record<BodyState, RecoveryState> = {
  fatigued: "fatigued",
  recovering: "recovering",
  ready: "ready",
  undertrained: "undertrained",
  untracked: "untrained",
};

export const BODY_STATE_COLORS: Record<BodyState, string> = {
  fatigued: RECOVERY_COLORS.fatigued,
  recovering: RECOVERY_COLORS.recovering,
  ready: RECOVERY_COLORS.ready,
  undertrained: RECOVERY_COLORS.undertrained,
  untracked: RECOVERY_COLORS.untrained,
};

const AnimatedPath = Animated.createAnimatedComponent(Path);

const GLOW_STATES: ReadonlySet<BodyState> = new Set(["fatigued", "recovering"]);

// ---- geometry ---------------------------------------------------------------
// viewBox 0 0 200 380. Paths are the figure's LEFT half (x ≤ 100) and are
// mirrored about x = 100, so the body is symmetric by construction.

type Region = { group: string; d: string };

const SHOULDER = "M76 60 C64 58 53 64 50 78 C49 84 50 88 52 92 C58 86 64 82 70 80 C72 72 74 66 76 60 Z";
const UPPER_ARM = "M51 96 C57 90 64 86 70 84 C70 100 66 118 62 132 L50 134 C47 120 48 106 51 96 Z";
const FOREARM = "M49 138 L62 136 C60 154 56 170 52 186 L42 186 C42 168 45 152 49 138 Z";

const FRONT: Region[] = [
  { group: "shoulders", d: SHOULDER },
  { group: "chest", d: "M79 60 C86 59 93 60 98 62 L98 94 C90 99 80 98 73 92 C70 86 70 80 72 76 C74 70 76 64 79 60 Z" },
  { group: "arms", d: UPPER_ARM },
  { group: "forearms", d: FOREARM },
  { group: "core", d: "M74 98 C82 102 91 102 98 100 L98 172 C90 172 82 168 77 162 C73 142 72 120 74 98 Z" },
  { group: "quads", d: "M75 176 C80 186 84 192 86 196 C86 222 86 246 88 268 L74 268 C68 246 66 216 70 194 C71 186 73 180 75 176 Z" },
  { group: "adductors", d: "M88 196 L98 196 L98 214 C96 230 93 244 90 254 C88 236 88 214 88 196 Z" },
  { group: "calves", d: "M75 292 L87 292 C90 308 89 326 86 344 L78 344 C74 326 73 308 75 292 Z" },
];

const BACK: Region[] = [
  { group: "shoulders", d: SHOULDER },
  { group: "back", d: "M92 56 L98 52 L98 140 C90 136 82 128 76 116 C72 104 70 90 72 80 C74 70 80 62 92 56 Z" },
  { group: "back", d: "M78 122 C84 132 91 140 98 144 L98 166 L80 166 C78 152 77 136 78 122 Z" },
  { group: "arms", d: UPPER_ARM },
  { group: "forearms", d: FOREARM },
  { group: "glutes", d: "M78 168 L98 168 L98 204 C90 206 82 204 76 198 C73 188 74 176 78 168 Z" },
  { group: "hamstrings", d: "M75 204 C82 208 90 210 97 208 C96 230 92 250 88 268 L74 268 C70 248 70 226 75 204 Z" },
  { group: "calves", d: "M74 292 L88 292 C92 306 92 322 86 338 L78 338 C72 322 71 306 74 292 Z" },
];

/** Joints, hands and feet — drawn in the idle body tone, never coloured. */
const FRAME_FRONT = [
  "M41 190 L53 190 C55 198 53 208 47 212 C42 208 39 198 41 190 Z",
  "M76 166 C83 172 91 176 98 178 L98 192 L84 192 C80 184 77 176 76 166 Z",
  "M74 272 L88 272 C89 278 88 284 86 288 L76 288 C74 284 73 278 74 272 Z",
  "M77 348 L87 348 C89 356 90 362 92 368 L72 368 C74 362 76 356 77 348 Z",
];
const FRAME_BACK = [
  "M41 190 L53 190 C55 198 53 208 47 212 C42 208 39 198 41 190 Z",
  "M74 272 L88 272 C89 278 88 284 86 288 L76 288 C74 284 73 278 74 272 Z",
  "M78 342 L86 342 C88 352 90 360 92 368 L72 368 C74 360 76 352 78 342 Z",
];
const NECK = "M93 42 L107 42 L109 56 L91 56 Z";
const MIRROR = "translate(200,0) scale(-1,1)";

/** The groups a view can show — used by callers to say what is off-screen. */
export const VIEW_GROUPS: Record<BodyView, string[]> = {
  front: Array.from(new Set(FRONT.map((r) => r.group))),
  back: Array.from(new Set(BACK.map((r) => r.group))),
};

type Props = {
  /** Recovery state per gym-group key. Groups not listed draw as untracked. */
  states?: Record<string, BodyState>;
  /** Explicit colour per gym-group key; overrides `states` where present. */
  fills?: Record<string, string>;
  view: BodyView;
  onPressMuscle?: (group: string) => void;
  /** Rendered width in points; height follows the 200:380 body. */
  width?: number;
  /** Glow on fatigued/recovering regions. Off for `fills`-only bodies. */
  glow?: boolean;
  /** Animate these groups' fills in, in this order, starting from `from`. */
  reveal?: { order: string[]; from: string; stepMs?: number; durationMs?: number };
  accessibilityLabel?: string;
  testID?: string;
};

export function BodyMap2D({
  states,
  fills,
  view,
  onPressMuscle,
  width = 170,
  glow = true,
  reveal,
  accessibilityLabel,
  testID,
}: Props) {
  const { T } = useTheme();
  const reduceMotion = useReducedMotion();
  const regions = view === "front" ? FRONT : BACK;
  const frame = view === "front" ? FRAME_FRONT : FRAME_BACK;
  const height = Math.round((width * 380) / 200);

  const stateOf = (g: string): BodyState => states?.[g] ?? "untracked";
  const colorOf = (g: string): string => fills?.[g] ?? BODY_STATE_COLORS[stateOf(g)];
  const glowing = glow && !!states ? regions.filter((r) => !fills?.[r.group] && GLOW_STATES.has(stateOf(r.group))) : [];

  // The glow breathes between 0.45 and 0.7 — around the ~0.6 resting value.
  const pulse = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    if (reduceMotion || glowing.length === 0) {
      pulse.setValue(0.6);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.7, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, glowing.length, pulse]);

  // One driver per revealed group. Groups off this view still get a driver so
  // a front and a back body given the same order stay in step.
  const revealKey = reveal ? `${reveal.from}|${reveal.order.join(",")}` : "";
  const fillAnims = useMemo(() => {
    const m: Record<string, Animated.Value> = {};
    for (const g of reveal?.order ?? []) m[g] = new Animated.Value(0);
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealKey]);
  useEffect(() => {
    if (!reveal) return;
    const values = reveal.order.map((g) => fillAnims[g]);
    if (reduceMotion) {
      values.forEach((v) => v.setValue(1));
      return;
    }
    const run = Animated.stagger(
      reveal.stepMs ?? 60,
      values.map((v) =>
        Animated.timing(v, { toValue: 1, duration: reveal.durationMs ?? 420, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      ),
    );
    run.start();
    return () => run.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fillAnims, reduceMotion]);

  const regionPaths = (r: Region, i: number, fill: string, pressable: boolean) => {
    const anim = reveal ? fillAnims[r.group] : undefined;
    const onPress = pressable && onPressMuscle ? () => onPressMuscle(r.group) : undefined;
    if (anim) {
      const animated = anim.interpolate({ inputRange: [0, 1], outputRange: [reveal!.from, fill] });
      return (
        <G key={`${r.group}-${i}`} onPress={onPress}>
          <AnimatedPath d={r.d} fill={animated as any} stroke={T.bg} strokeWidth={1.2} />
          <AnimatedPath d={r.d} fill={animated as any} stroke={T.bg} strokeWidth={1.2} transform={MIRROR} />
        </G>
      );
    }
    return (
      <G key={`${r.group}-${i}`} onPress={onPress}>
        <Path d={r.d} fill={fill} stroke={T.bg} strokeWidth={1.2} />
        <Path d={r.d} fill={fill} stroke={T.bg} strokeWidth={1.2} transform={MIRROR} />
      </G>
    );
  };

  return (
    <View
      style={{ width, height }}
      accessible={!!accessibilityLabel}
      accessibilityRole={accessibilityLabel ? "image" : undefined}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      {glowing.length > 0 && (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: pulse }]} pointerEvents="none">
          <Svg width={width} height={height} viewBox="0 0 200 380">
            <Defs>
              <Filter id="bodyGlow" x="-30%" y="-30%" width="160%" height="160%">
                <FeGaussianBlur stdDeviation={6} />
              </Filter>
            </Defs>
            <G filter="url(#bodyGlow)">
              {glowing.map((r, i) => regionPaths(r, i, colorOf(r.group), false))}
            </G>
          </Svg>
        </Animated.View>
      )}
      <Svg width={width} height={height} viewBox="0 0 200 380">
        <Ellipse cx={100} cy={24} rx={15} ry={18} fill={T.bodyIdle} />
        <Path d={NECK} fill={T.bodyIdle} />
        {frame.map((d, i) => (
          <G key={`f-${i}`}>
            <Path d={d} fill={T.bodyIdle} />
            <Path d={d} fill={T.bodyIdle} transform={MIRROR} />
          </G>
        ))}
        {regions.map((r, i) => regionPaths(r, i, colorOf(r.group), true))}
      </Svg>
    </View>
  );
}

/** Compact one-line key for the five states, in the heat map's own labels. */
export function BodyMapLegend({ testID }: { testID?: string }) {
  const { T } = useTheme();
  return (
    <View style={styles.legend} testID={testID}>
      {(Object.keys(HEAT_STATE) as BodyState[]).map((s) => {
        const label = RECOVERY_LEGEND.find((l) => l.state === HEAT_STATE[s])?.label ?? s;
        return (
          <View key={s} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: BODY_STATE_COLORS[s] }]} />
            <Text style={[styles.legendText, { color: T.textMuted }]}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", columnGap: 12, rowGap: 6 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, fontWeight: "600" },
});
