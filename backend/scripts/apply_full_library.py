#!/usr/bin/env python3
"""Populate /app/backend/static/exercise_media with the FULL 206-exercise pack.

Each metadata entry has a `slug` matching its .mp4 filename and a poster in
posters/. We copy every mp4 + webp into the media dir named by slug. We also
add "alias" copies for our 32 legacy exercise IDs (bench-press, db-curl, …) so
existing saved workouts and any hard-coded frontend references keep resolving.

Idempotent: safe to re-run.
"""
import json
import shutil
import sys
from pathlib import Path

METADATA = Path("/app/backend/data/exercise_metadata.json")
VIDEOS = Path("/tmp/pack/videos")
POSTERS = Path("/tmp/pack/posters_out/posters")
DEST = Path("/app/backend/static/exercise_media")

# Old 32 legacy IDs -> new-pack slug (so /api/exercise-media/<old>/animation
# still resolves once the legacy .mp4s are removed from disk).
LEGACY_ALIAS = {
    "bench-press":             "barbell-bench-press",
    "incline-db-press":        "dumbbell-incline-bench-press",
    "cable-fly":               "cable-pec-fly",
    "push-up":                 "push-up",
    "dips":                    "parralel-bar-dips",
    "pull-up":                 "pull-ups",
    "lat-pulldown":            "machine-pulldown",
    "barbell-row":             "barbell-bent-over-row",
    "cable-row":               "cable-row-bar-standing-row",
    "face-pull":               "cable-bar-face-pull",
    "deadlift":                "barbell-deadlift",
    "shrug":                   "barbell-shrug",
    "overhead-press":          "barbell-overhead-press",
    "lateral-raise":           "dumbbell-lateral-raise",
    "db-curl":                 "dumbbell-curl",
    "barbell-curl":            "barbell-curl",
    "tricep-pushdown":         "cable-rope-pushdown",
    "cable-external-rotation": None,  # no rotator-cuff animation in pack
    "squat":                   "barbell-squat",
    "leg-press":               "machine-leg-press",
    "leg-extension":           "machine-leg-extension",
    "rdl":                     "kettlebell-romanian-deadlift",
    "leg-curl":                "dumbbell-leg-curl",
    "lunge":                   "lunge-walking",
    "hip-thrust":              "dumbbell-heels-elevated-hip-thrust",
    "standing-calf-raise":     "kettlebell-calf-raise",
    "seated-calf-raise":       None,  # no seated calf raise in pack
    "single-leg-calf-raise":   "dumbbell-single-leg-calf-raise",
    "calf-raise":              "kettlebell-calf-raise",
    "hanging-leg-raise":       "hanging-knee-raises",
    "plank":                   "hand-plank",
    "cable-crunch":            "machine-crunch",
}


def main() -> int:
    if not METADATA.exists() or not VIDEOS.exists() or not POSTERS.exists():
        print("ERROR: expected /tmp/pack/videos, /tmp/pack/posters_out/posters, and metadata file",
              file=sys.stderr)
        return 1
    DEST.mkdir(parents=True, exist_ok=True)

    # Clean the destination first (we're replacing the previous 32-exercise deploy).
    for f in DEST.iterdir():
        if f.is_file():
            f.unlink()

    metadata = json.loads(METADATA.read_text())
    all_slugs = {m["slug"] for m in metadata}
    copied_v = 0
    copied_p = 0
    missing_v = []
    missing_p = []

    for slug in sorted(all_slugs):
        src_v = VIDEOS / f"{slug}.mp4"
        src_p = POSTERS / f"{slug}.webp"
        if src_v.exists():
            shutil.copyfile(src_v, DEST / f"{slug}.mp4")
            copied_v += 1
        else:
            missing_v.append(slug)
        if src_p.exists():
            shutil.copyfile(src_p, DEST / f"{slug}_poster.webp")
            copied_p += 1
        else:
            missing_p.append(slug)

    # Legacy aliases: hard-copy so old IDs still resolve (skip if the
    # slug already IS the old id, e.g. "push-up" == "push-up").
    aliases_ok = 0
    aliases_placeholder = 0
    for old_id, new_slug in LEGACY_ALIAS.items():
        if not new_slug:
            aliases_placeholder += 1
            continue
        if new_slug == old_id:
            continue  # canonical already lives under this name
        src_v = DEST / f"{new_slug}.mp4"
        src_p = DEST / f"{new_slug}_poster.webp"
        if src_v.exists():
            shutil.copyfile(src_v, DEST / f"{old_id}.mp4")
            aliases_ok += 1
        if src_p.exists():
            shutil.copyfile(src_p, DEST / f"{old_id}_poster.webp")

    print(f"Copied {copied_v}/{len(all_slugs)} mp4, {copied_p}/{len(all_slugs)} posters.")
    print(f"Legacy aliases: {aliases_ok} materialised, {aliases_placeholder} placeholders (no media).")
    if missing_v:
        print(f"Missing videos ({len(missing_v)}):", missing_v[:5], "…")
    if missing_p:
        print(f"Missing posters ({len(missing_p)}):", missing_p[:5], "…")

    # Final counts on disk
    disk_v = len(list(DEST.glob("*.mp4")))
    disk_p = len(list(DEST.glob("*_poster.webp")))
    print(f"On disk: {disk_v} mp4, {disk_p} posters.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
