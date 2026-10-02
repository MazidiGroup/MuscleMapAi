// BodyMap2D — a lightweight front/back body in react-native-svg. No WebGL, so
// it renders instantly and can be captured into an image (the post-workout
// share card). One region per gym group, mirrored about the midline; each
// group is filled with the colour the caller passes, or the idle body tone.

import React from "react";
import { View } from "react-native";
import Svg, { Ellipse, G, Path } from "react-native-svg";

export type BodyView = "front" | "back";

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

type Props = {
  view: BodyView;
  /** Colour per gym-group key; groups not listed draw in `idle`. */
  fills: Record<string, string>;
  /** Idle body tone — joints, head and any unfilled group. */
  idle: string;
  /** Hairline between regions; pass the surface the body sits on. */
  gap: string;
  /** Rendered width in points; height follows the 200:380 body. */
  width?: number;
};

export function BodyMap2D({ view, fills, idle, gap, width = 120 }: Props) {
  const regions = view === "front" ? FRONT : BACK;
  const frame = view === "front" ? FRAME_FRONT : FRAME_BACK;
  const height = Math.round((width * 380) / 200);
  return (
    <View style={{ width, height }} accessible={false} importantForAccessibility="no-hide-descendants">
      <Svg width={width} height={height} viewBox="0 0 200 380">
        <Ellipse cx={100} cy={24} rx={15} ry={18} fill={idle} />
        <Path d={NECK} fill={idle} />
        {frame.map((d, i) => (
          <G key={`f-${i}`}>
            <Path d={d} fill={idle} />
            <Path d={d} fill={idle} transform={MIRROR} />
          </G>
        ))}
        {regions.map((r, i) => {
          const fill = fills[r.group] ?? idle;
          return (
            <G key={`${r.group}-${i}`}>
              <Path d={r.d} fill={fill} stroke={gap} strokeWidth={1.2} />
              <Path d={r.d} fill={fill} stroke={gap} strokeWidth={1.2} transform={MIRROR} />
            </G>
          );
        })}
      </Svg>
    </View>
  );
}
