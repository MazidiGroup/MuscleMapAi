# Fitness Anatomy Trainer — V1 (3D Écorché)

A mobile + web 3D skeletal & muscular anatomy learning app. Replaced the previous "Apex AI"
fitness coach. Built with Expo + expo-gl + three.js (WebGL), FastAPI backend serving the model.

## The 3D model
- Source: user-supplied `Ecorche_by_AlexLashko.fbx` (binary FBX, 4.78MB).
- Converted FBX → GLB with `assimp export` (preserves hierarchy + morph targets).
- Result: `ecorche.glb` (5.6MB) — **270 named anatomical objects** (skeleton + every major muscle),
  **79 morph targets** (the "Shrunken Muscle View"), 1 animation, 3 base materials.
- No 8K textures were bundled in the FBX → all colouring is **programmatic / engine-driven**.
- Served from backend: `GET /api/anatomy/model` (FileResponse, `model/gltf-binary`).
  Stored at `/app/backend/static/models/ecorche.glb`.

## Architecture
- `src/anatomy/engine.ts` — three.js engine. Binds `THREE.WebGLRenderer` directly to the
  expo-gl context via a minimal fake canvas (version-independent; avoids expo-three which pins three ^0.166).
  Handles spherical orbit camera, per-mesh material recolour, visibility (hide/isolate),
  morph-target scrub, and raycast picking.
- `src/anatomy/AnatomyViewer.tsx` — GLView + PanResponder (drag=rotate, pinch=zoom+pan,
  tap=raycast select) + on-screen zoom/reset buttons. Caches the downloaded GLB buffer across mounts.
- `src/anatomy/groups.ts` — explorer hierarchy (containers: Bones_*, Muscles_*) + gym muscle groups + name prettifier.
- `src/anatomy/muscleData.ts` — curated DB for ~35 key gym muscles (function/origin/insertion/antagonist/exercises).
- `src/anatomy/exercises.ts` — 32 exercises mapped to primary/secondary muscle node names.
- `src/anatomy/MuscleSheet.tsx`, `ScrubSlider.tsx`, `ui.ts` — shared UI.

## Screens (tabs: Explore · Workout · Muscle Info · Settings)
- **Explore** — full-screen 3D viewer. Tap a muscle → detail sheet. "Layers" panel = hierarchical
  explorer (tap region to isolate+frame, eye toggle to hide a whole system, long-press chip to hide a region,
  Show Full Body to reset). "Shrink View" panel = morph scrub slider + Normal/Fully-Shrunken buttons.
- **Workout** — viewer in workout mode; pick an exercise (Push/Pull/Legs/Core) → primary muscles glow red,
  secondary amber, rest dimmed; shows cue + muscle chips.
- **Muscle Info** — searchable reference grouped by gym group → tap opens MuscleSheet modal.
- **Settings** — about the model + how-to-use.

## Testing
- Backend 4/4 pass (`tests/test_anatomy_backend.py`): model 200 + valid glTF magic + 404 for bad path.
- Frontend (iteration_4.json): all flows pass on web — load/render, controls, layers isolate/hide,
  shrink morph, workout highlight, info search+modal, settings.

## Status / Notes
- Validated on **web** (WebGL). On Expo Go mobile, 3D performance is limited; full smoothness needs a device build.
- Old Apex AI endpoints (auth/coach/workout/billing) still exist in `server.py` but are unused.

## Backlog (per user phase plan)
- Phase 4: Learning Mode (guided anatomy lessons + quizzes).
- Phase 5: AI Coach (exercise recommendations, muscle explanations) — would use Emergent LLM key.
- Native mobile optimisation pass + TextDecoder polyfill for GLB parse on native.
- Trim unused Apex AI code from server.py.
