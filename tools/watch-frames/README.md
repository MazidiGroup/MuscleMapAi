# Watch frame-pack exporter

Turns each exercise's animation MP4 into the flipbook the Apple Watch plays.
watchOS has no SwiftUI video player, and WatchKit inline movie playback is
documented to disable heart-rate gathering, so the watch shows pre-extracted
frames instead of video.

## Running it

**macOS only.** It uses AVFoundation and CoreGraphics; there is no Windows
equivalent, which is why the generated packs are committed rather than built on
demand (see "Regenerating" below).

```bash
swiftc -O -o /tmp/batchtool tools/watch-frames/export-watch-frames.swift

# one exercise
/tmp/batchtool backend/static/exercise_media backend/static/watch_frames barbell-squat

# everything (takes ~25 min; run in batches, it is CPU-bound)
/tmp/batchtool backend/static/exercise_media backend/static/watch_frames $(ls backend/static/exercise_media/*.mp4 | xargs -n1 basename | sed 's/\.mp4$//')
```

## Output

`backend/static/watch_frames/<exercise-id>/`
  · `00.jpg … NN.jpg` — 264×320, JPEG q0.62
  · `pack.json` — `{frames, loopSeconds, focal, w, h}`

Served by `/api/watch-frames/*` (see `backend/server.py`). The watch fetches a
pack the first time an exercise appears and caches it in its own `Caches`
directory; only the exercise on screen is ever decoded.

## What it derives automatically

Both were hand-picked during the prototype and are now computed:

**Loop window.** Frame self-similarity finds the repetition period — the lag
whose frames best match — biased toward the SHORTEST strong match so one rep is
chosen rather than two. Motion-onset detection trims a static lead-in. The
window is endpoint-exclusive so the last frame does not duplicate the first.

**Focal point.** The horizontal centroid of subject mass, after dropping columns
below a quarter of the peak so thin equipment and the background sweep cannot
drag the centre off the body. Background level is estimated per frame from its
own bright end, because the plate is a gradient rather than flat white.

> A sliding "densest window" was tried first and is WRONG: when the subject is
> narrower than the crop, every window containing it scores identically and the
> first maximum wins, pinning every figure to one edge. The centroid fixed it.

**Frame rate.** ~12 fps, with the count following the rep length (clamped
36–60). A fixed 48 frames makes a 6.5 s rep play at 7.4 fps, which visibly
steps — that was the original stutter.

## Regenerating

Packs are committed because Windows cannot produce them. Regenerate on a Mac
only when the source animation for an exercise changes, or when the tuning
constants here change; then commit the affected `watch_frames/<id>` directories.
