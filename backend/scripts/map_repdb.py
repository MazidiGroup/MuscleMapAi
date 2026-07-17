#!/usr/bin/env python3
"""Map Muscle Map Ai's 32 exercise ids to RepDB pack animations.

Usage: python3 map_repdb.py [--copy]
Without --copy: prints the proposed mapping for review.
With --copy: copies matched animation webp files into backend static dir named by OUR ids.
"""
import json
import re
import shutil
import sqlite3
import sys
from pathlib import Path

PACK = Path("/tmp/repdb/pack")
ANIM_DIR = PACK / "images" / "animations"
OUT_DIR = Path("/app/backend/static/exercise_media")

# our_id -> (our name, ordered RepDB id candidates to try first)
OURS = {
    "bench-press": ("Barbell Bench Press", ["bench-press-barbell", "barbell-bench-press", "bench-press"]),
    "incline-db-press": ("Incline Dumbbell Press", ["incline-bench-press-dumbbell", "incline-dumbbell-press", "incline-dumbbell-bench-press"]),
    "cable-fly": ("Cable Chest Fly", ["cable-fly", "cable-crossover", "cable-chest-fly", "standing-cable-fly"]),
    "push-up": ("Push-Up", ["push-ups", "push-up", "pushup"]),
    "dips": ("Chest Dips", ["chest-dips", "dips", "parallel-bar-dips", "triceps-dip"]),
    "overhead-press": ("Overhead Press", ["overhead-press-barbell", "military-press", "overhead-press", "shoulder-press-barbell"]),
    "lateral-raise": ("Dumbbell Lateral Raise", ["dumbbell-lateral-raise", "lateral-raise", "side-lateral-raise"]),
    "tricep-pushdown": ("Tricep Pushdown", ["cable-tricep-pushdown", "tricep-pushdown", "triceps-pushdown", "cable-pushdown"]),
    "pull-up": ("Pull-Up", ["pull-ups", "pull-up", "pullup"]),
    "lat-pulldown": ("Lat Pulldown", ["lat-pulldown", "cable-lat-pulldown", "wide-grip-lat-pulldown"]),
    "barbell-row": ("Barbell Row", ["bent-over-row-barbell", "barbell-row", "barbell-bent-over-row", "bent-over-barbell-row"]),
    "cable-row": ("Seated Cable Row", ["seated-cable-row", "cable-row", "cable-seated-row"]),
    "face-pull": ("Face Pull", ["face-pull", "cable-face-pull"]),
    "db-curl": ("Dumbbell Curl", ["dumbbell-curl", "dumbbell-bicep-curl", "bicep-curl-dumbbell"]),
    "barbell-curl": ("Barbell Curl", ["barbell-curl", "bicep-curl-barbell", "barbell-bicep-curl"]),
    "deadlift": ("Conventional Deadlift", ["deadlift-barbell", "conventional-deadlift", "deadlift"]),
    "shrug": ("Barbell Shrug", ["barbell-shrug", "shrug-barbell"]),
    "squat": ("Barbell Back Squat", ["squat-barbell", "back-squat", "barbell-squat", "barbell-back-squat"]),
    "leg-press": ("Leg Press", ["leg-press", "machine-leg-press", "leg-press-machine"]),
    "leg-extension": ("Leg Extension", ["leg-extension", "machine-leg-extension", "leg-extension-machine"]),
    "rdl": ("Romanian Deadlift", ["romanian-deadlift-barbell", "romanian-deadlift", "rdl"]),
    "leg-curl": ("Lying Leg Curl", ["lying-leg-curl", "leg-curl", "machine-lying-leg-curl"]),
    "hip-thrust": ("Barbell Hip Thrust", ["barbell-hip-thrust", "hip-thrust-barbell", "hip-thrust"]),
    "lunge": ("Walking Lunge", ["walking-lunge", "dumbbell-walking-lunge", "lunge", "walking-lunges"]),
    "standing-calf-raise": ("Standing Calf Raise", ["standing-calf-raise", "machine-standing-calf-raise", "standing-calf-raises"]),
    "seated-calf-raise": ("Seated Calf Raise", ["seated-calf-raise", "machine-seated-calf-raise"]),
    "calf-raise": ("Calf Raise", ["calf-raise", "bodyweight-calf-raise", "calf-raises"]),
    "cable-crunch": ("Cable Crunch", ["cable-crunch", "kneeling-cable-crunch"]),
    "hanging-leg-raise": ("Hanging Leg Raise", ["hanging-leg-raise", "hanging-leg-raises", "hanging-knee-raise"]),
    "plank": ("Plank", ["plank", "front-plank", "planks"]),
    "cable-external-rotation": ("Cable External Rotation", ["cable-external-rotation"]),
    "single-leg-calf-raise": ("Single Leg Calf Raise", ["single-leg-calf-raise"]),
}


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def main():
    copy = "--copy" in sys.argv
    con = sqlite3.connect(PACK / "exercises.sqlite")
    rows = con.execute("SELECT id, name_en, synonyms, animation, image_alias FROM exercise").fetchall()
    by_id = {r[0]: r for r in rows}
    anim_files = {p.stem: p for p in ANIM_DIR.glob("*.webp")}
    CLASSIC_DIR = PACK / "images" / "classic"

    def poster_for(repdb_id: str):
        for suffix in ("-main", "-start", "-peak"):
            p = CLASSIC_DIR / f"{repdb_id}{suffix}.webp"
            if p.exists():
                return p
        return None

    def anim_for(repdb_row):
        """Resolve the animation file for a RepDB row (animation column or id/alias)."""
        rid, _, _, animation, alias = repdb_row
        cands = []
        if animation:
            cands.append(Path(str(animation)).stem)
        cands += [rid, str(alias or "")]
        for c in cands:
            if c and c in anim_files:
                return anim_files[c]
        return None

    results, missing = [], []
    for our_id, (our_name, candidates) in OURS.items():
        match = None
        for c in candidates:  # exact-id candidates first
            if c in by_id:
                match = by_id[c]
                break
        if not match:  # fallback: exact normalized name / synonym match
            n = norm(our_name)
            for r in rows:
                syns = [norm(s) for s in (json.loads(r[2]) if r[2] and str(r[2]).startswith("[") else str(r[2] or "").split(","))]
                if norm(r[1]) == n or n in syns:
                    match = r
                    break
        if not match:  # last resort: all our words appear in a repdb name
            words = set(norm(our_name).split())
            scored = [(len(words & set(norm(r[1]).split())), r) for r in rows]
            scored.sort(key=lambda x: -x[0])
            if scored and scored[0][0] >= max(2, len(words) - 1):
                match = scored[0][1]
        if match:
            f = anim_for(match)
            poster = poster_for(match[0])
            status = ("OK" if f else "POSTER-ONLY" if poster else "NO-FILE") + ("+poster" if f and poster else "")
            results.append((our_id, match[0], match[1], f, status))
            if copy:
                if f:
                    shutil.copyfile(f, OUT_DIR / f"{our_id}.webp")
                if poster:
                    shutil.copyfile(poster, OUT_DIR / f"{our_id}_poster.webp")
        else:
            missing.append((our_id, our_name))

    print(f"{'OUR ID':22} {'REPDB ID':40} {'REPDB NAME':38} STATUS")
    for our_id, rid, rname, f, status in results:
        print(f"{our_id:22} {rid:40} {rname[:36]:38} {status}")
    for our_id, name in missing:
        print(f"{our_id:22} {'-':40} {name[:36]:38} NO-MATCH")
    ok = sum(1 for r in results if r[4] == "OK")
    print(f"\nmatched: {len(results)}/{len(OURS)}  with-file: {ok}  copied: {copy}")


if __name__ == "__main__":
    main()
