#!/usr/bin/env python3
"""Re-encode RepDB animations for smooth, genuine >=30fps playback.

Source problem: 14-frame files play 12x40ms motion frames + 2x600ms freeze holds
(slideshow feel); larger files are uniform ~50-62ms (16-20fps).

Fix — timeline resampling at 30fps using the REAL per-frame durations read from the
WebP ANMF chunks (PIL does not expose them):
  1. Read true durations; for sparse files (<30 frames) stretch the timeline 2x so
     the rep plays as a slow, controlled demo with enough ticks to interpolate.
  2. Cap any pose hold at 300ms (no long freezes).
  3. Sample the loop every 33ms; each tick is a crossfade blend between the two
     surrounding keyframes -> constant 30fps motion, seamless loop.
  4. Resize 960 -> 640px, RGBA preserved, quality 80.

Usage: python3 smooth_animations.py [file.webp ...]   (default: all non-poster webps)
"""
import glob
import os
import struct
import sys

from PIL import Image

MEDIA = "/app/backend/static/exercise_media"
TICK_MS = 33.34  # ~30fps
SIZE = 640
SPARSE_THRESHOLD = 30  # below this frame count, stretch time 2x
SLOW_FACTOR = 2.0
HOLD_CAP_MS = 300


def anmf_durations(path: str):
    data = open(path, "rb").read()
    durs = []
    i = 12
    while i + 8 <= len(data):
        tag = data[i : i + 4]
        size = struct.unpack("<I", data[i + 4 : i + 8])[0]
        if tag == b"ANMF":
            durs.append(int.from_bytes(data[i + 8 + 12 : i + 8 + 15], "little"))
        i += 8 + size + (size % 2)
    return durs


def process(path: str) -> None:
    durs = anmf_durations(path)
    im = Image.open(path)
    n = getattr(im, "n_frames", 1)
    if n < 2:
        print(f"{os.path.basename(path):30} SKIP (single frame)")
        return
    if len(durs) != n:  # fallback if container parse mismatches
        durs = [100] * n

    frames = []
    for i in range(n):
        im.seek(i)
        frames.append(im.convert("RGBA").resize((SIZE, SIZE), Image.LANCZOS))

    factor = SLOW_FACTOR if n < SPARSE_THRESHOLD else 1.0
    durs = [min(max(d, 1) * factor, HOLD_CAP_MS) for d in durs]
    total = sum(durs)

    # cumulative start time of each keyframe
    cum = [0.0]
    for d in durs:
        cum.append(cum[-1] + d)

    out_count = max(2, round(total / TICK_MS))
    out = []
    seg = 0
    for k in range(out_count):
        t = k * total / out_count
        while seg + 1 < len(cum) - 1 and t >= cum[seg + 1]:
            seg += 1
        alpha = (t - cum[seg]) / durs[seg]
        cur = frames[seg]
        nxt = frames[(seg + 1) % n]  # wrap for a seamless loop
        out.append(cur if alpha < 0.02 else Image.blend(cur, nxt, min(alpha, 1.0)))

    out[0].save(
        path,
        save_all=True,
        append_images=out[1:],
        duration=int(TICK_MS),
        loop=0,
        quality=80,
        method=4,
    )
    print(
        f"{os.path.basename(path):30} {n:>4} -> {len(out):>4} frames @30fps  "
        f"loop {total/1000:.1f}s  {os.path.getsize(path)/1e6:.2f}MB"
    )


if __name__ == "__main__":
    files = sys.argv[1:] or [f for f in sorted(glob.glob(f"{MEDIA}/*.webp")) if not f.endswith("_poster.webp")]
    for f in files:
        process(f)
