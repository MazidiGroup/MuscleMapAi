#!/usr/bin/env python3
"""Apply the new animation pack (July 2026 full-library MP4s + WebP posters).

Reads MP4s from SRC_DIR/videos and matching WebP posters from SRC_DIR/posters,
copies each mapped file to DST_DIR renamed to our exercise id.

Exercises without a suitable animation in the pack are intentionally left out
so the app shows a neutral placeholder.
"""
import shutil
import sys
from pathlib import Path

VIDEO_SRC = Path("/tmp/newpack/extracted")
POSTER_SRC = Path("/tmp/posters/posters")
DST_DIR = Path("/app/backend/static/exercise_media")

# id -> source filename in SRC_DIR (or None => placeholder)
MAPPING = {
    "barbell-curl":            "barbell-curl.mp4",
    "barbell-row":             "barbell-bent-over-row.mp4",
    "bench-press":             "barbell-bench-press.mp4",
    "cable-crunch":            "machine-crunch.mp4",
    "cable-external-rotation": None,  # no rotator cuff animation in pack
    "cable-fly":               "cable-pec-fly.mp4",
    "cable-row":               "cable-row-bar-standing-row.mp4",
    "calf-raise":              "kettlebell-calf-raise.mp4",
    "db-curl":                 "dumbbell-curl.mp4",
    "deadlift":                "barbell-deadlift.mp4",
    "dips":                    "parralel-bar-dips.mp4",
    "face-pull":               "cable-bar-face-pull.mp4",
    "hanging-leg-raise":       "hanging-knee-raises.mp4",
    "hip-thrust":              "dumbbell-heels-elevated-hip-thrust.mp4",
    "incline-db-press":        "dumbbell-incline-bench-press.mp4",
    "lat-pulldown":            "machine-pulldown.mp4",
    "lateral-raise":           "dumbbell-lateral-raise.mp4",
    "leg-curl":                "dumbbell-leg-curl.mp4",
    "leg-extension":           "machine-leg-extension.mp4",
    "leg-press":               "machine-leg-press.mp4",
    "lunge":                   "lunge-walking.mp4",
    "overhead-press":          "barbell-overhead-press.mp4",
    "plank":                   "hand-plank.mp4",
    "pull-up":                 "pull-ups.mp4",
    "push-up":                 "push-up.mp4",
    "rdl":                     "kettlebell-romanian-deadlift.mp4",
    "seated-calf-raise":       None,  # no seated calf raise in pack
    "shrug":                   "barbell-shrug.mp4",
    "single-leg-calf-raise":   "dumbbell-single-leg-calf-raise.mp4",
    "squat":                   "barbell-squat.mp4",
    "standing-calf-raise":     "kettlebell-calf-raise.mp4",
    "tricep-pushdown":         "cable-rope-pushdown.mp4",
}


def main() -> int:
    if not VIDEO_SRC.exists():
        print(f"ERROR: video source dir does not exist: {VIDEO_SRC}", file=sys.stderr)
        return 1
    if not POSTER_SRC.exists():
        print(f"ERROR: poster source dir does not exist: {POSTER_SRC}", file=sys.stderr)
        return 1
    DST_DIR.mkdir(parents=True, exist_ok=True)

    mapped, placeholders, errors = [], [], []
    for ex_id, src_name in MAPPING.items():
        if src_name is None:
            placeholders.append(ex_id)
            continue
        src_mp4 = VIDEO_SRC / src_name
        stem = src_name.rsplit(".", 1)[0]
        src_poster = POSTER_SRC / f"{stem}.webp"
        if not src_mp4.exists():
            errors.append(f"{ex_id}: video missing '{src_name}'")
            placeholders.append(ex_id)
            continue
        shutil.copyfile(src_mp4, DST_DIR / f"{ex_id}.mp4")
        if src_poster.exists():
            shutil.copyfile(src_poster, DST_DIR / f"{ex_id}_poster.webp")
        else:
            errors.append(f"{ex_id}: poster missing '{src_poster.name}'")
        mapped.append(f"{ex_id} <- {src_name}")

    print(f"MAPPED ({len(mapped)}):")
    for m in mapped:
        print("  " + m)
    print(f"\nPLACEHOLDERS ({len(placeholders)}):")
    for p in placeholders:
        print("  " + p)
    if errors:
        print(f"\nERRORS ({len(errors)}):")
        for e in errors:
            print("  " + e)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
