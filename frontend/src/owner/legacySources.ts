// Read-only readers for the ten preserved legacy keys.
//
// Two encodings exist in production and both are handled explicitly:
//  - `mma.*` keys were written as storage.setItem(key, value)  -> ONE JSON.stringify
//  - `anat.*` keys were written as storage.setItem(key, JSON.stringify(value))
//    -> DOUBLE encoded (a JSON string containing JSON)
//
// Nothing in this module writes, deletes or normalises a legacy key.

import { KV } from "./kv";

export type LegacyEncoding = "single" | "double";

export type LegacyRead<T> =
  | { present: false }
  | { present: true; ok: true; value: T; raw: string; encoding: LegacyEncoding }
  | { present: true; ok: false; raw: string; error: string };

async function readEncoded<T>(kv: KV, key: string, encoding: LegacyEncoding): Promise<LegacyRead<T>> {
  const raw = await kv.get(key);
  if (raw === null) return { present: false };
  try {
    const first = JSON.parse(raw);
    if (encoding === "single") return { present: true, ok: true, value: first as T, raw, encoding };
    if (typeof first !== "string") {
      // Tolerate a single-encoded value found under an anat.* key rather than
      // guessing — record the encoding actually observed.
      return { present: true, ok: true, value: first as T, raw, encoding: "single" };
    }
    return { present: true, ok: true, value: JSON.parse(first) as T, raw, encoding: "double" };
  } catch (e) {
    return { present: true, ok: false, raw, error: String(e) };
  }
}

export const LEGACY_SOURCES = {
  plan: { key: "mma.plan.v1", encoding: "single" as LegacyEncoding },
  planAnswers: { key: "mma.plan.answers.v1", encoding: "single" as LegacyEncoding },
  planSeed: { key: "mma.plan.seed.v1", encoding: "single" as LegacyEncoding },
  onboardingStep: { key: "mma.plan.onboardingStep.v1", encoding: "single" as LegacyEncoding },
  planCompletions: { key: "mma.plan.completions.v1", encoding: "single" as LegacyEncoding },
  workouts: { key: "anat.workouts", encoding: "double" as LegacyEncoding },
  prs: { key: "anat.prs", encoding: "double" as LegacyEncoding },
  restPref: { key: "anat.restPref", encoding: "single" as LegacyEncoding },
} as const;

export type LegacyDomain = keyof typeof LEGACY_SOURCES;

export function readLegacy<T>(kv: KV, domain: LegacyDomain): Promise<LegacyRead<T>> {
  const src = LEGACY_SOURCES[domain];
  return readEncoded<T>(kv, src.key, src.encoding);
}

/** Immutable snapshot of every legacy source, taken before any destination write. */
export async function snapshotLegacy(kv: KV): Promise<Record<LegacyDomain, LegacyRead<unknown>>> {
  const entries = await Promise.all(
    (Object.keys(LEGACY_SOURCES) as LegacyDomain[]).map(async (d) => [d, await readLegacy(kv, d)] as const),
  );
  return Object.fromEntries(entries) as Record<LegacyDomain, LegacyRead<unknown>>;
}
