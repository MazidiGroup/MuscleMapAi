// Exercise media (RepDB pack) — manifest + URL helpers.
// The manifest is fetched once and cached for the app session; exercises with
// no media entry simply keep their icon look.
import { useEffect, useState } from "react";

const BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL || ""}/api/exercise-media`;

export type MediaEntry = { animation?: boolean; poster?: boolean };

let manifestPromise: Promise<Record<string, MediaEntry>> | null = null;

export function loadMediaManifest(): Promise<Record<string, MediaEntry>> {
  if (!manifestPromise) {
    manifestPromise = fetch(`${BASE}/manifest`)
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => {
        manifestPromise = null; // allow retry on next mount
        return {};
      });
  }
  return manifestPromise;
}

export const animationUrl = (id: string) => `${BASE}/${id}/animation`;
export const posterUrl = (id: string) => `${BASE}/${id}/poster`;

export function useExerciseMedia(id: string): { hasAnimation: boolean; hasPoster: boolean; loaded: boolean } {
  const [entry, setEntry] = useState<MediaEntry | null>(null);
  useEffect(() => {
    let alive = true;
    loadMediaManifest().then((m) => {
      if (alive) setEntry(m[id] || {});
    });
    return () => {
      alive = false;
    };
  }, [id]);
  return { hasAnimation: !!entry?.animation, hasPoster: !!entry?.poster, loaded: entry !== null };
}
