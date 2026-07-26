// Media state decisions for exercise posters and animations.
//
// Delivery is NETWORK-served (posters and MP4s come from the backend), so every
// failure here is a connection problem. Catalogue text, search and filters are
// local and unaffected. Kept pure so the rules are testable without a renderer.

export type MediaKind = "none" | "poster-only" | "animated";

export function mediaKind(hasPoster: boolean, hasAnimation: boolean): MediaKind {
  if (hasAnimation) return "animated";
  if (hasPoster) return "poster-only";
  return "none";
}

/** Network wording only — never "missing local asset". */
export const MEDIA_UNAVAILABLE =
  "This animation can’t load right now. Exercise details, search and filters still work — the animation loads when you’re back online.";

export function altText(exerciseName?: string): string {
  return exerciseName ? `${exerciseName} demonstration` : "Exercise demonstration";
}

export type PlaybackInput = {
  kind: MediaKind;
  /** Variant default: hero/workout autoplay, list thumbs never do. */
  variantAutoplays: boolean;
  reducedMotion: boolean;
  focused: boolean;
  failed: boolean;
  /** Explicit user choice overrides the variant default. */
  userPlaying?: boolean | null;
};

/**
 * Motion never starts on its own when Reduce Motion is on, when the screen is not
 * active, or when the request failed — but an explicit Play always wins.
 */
export function shouldPlay(input: PlaybackInput): boolean {
  if (input.kind !== "animated" || input.failed || !input.focused) return false;
  if (typeof input.userPlaying === "boolean") return input.userPlaying;
  if (input.reducedMotion) return false;
  return input.variantAutoplays;
}

/** A poster stays visible while the animation loads, and after it fails. */
export function showPoster(kind: MediaKind, playing: boolean): boolean {
  return kind !== "none" && (!playing || kind === "poster-only");
}

/**
 * Only the rows a list actually renders may request media: the catalogue is far
 * too large to eagerly fetch every item.
 */
export function mediaRequestPlan(visibleIds: string[], allIds: string[]): string[] {
  const visible = new Set(visibleIds);
  return allIds.filter((id) => visible.has(id));
}
