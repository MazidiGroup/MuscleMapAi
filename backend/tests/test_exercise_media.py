# Tests for exercise media (RepDB) endpoints introduced in v1.1.1
# Also validates catalog swap: cuban-rotation -> cable-external-rotation,
# tibialis-raise -> single-leg-calf-raise.
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://batch5-features.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    return s


# ---- Manifest ----
class TestManifest:
    def test_manifest_returns_32_entries(self, api):
        r = api.get(f"{BASE_URL}/api/exercise-media/manifest", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, dict)
        assert len(data) == 32, f"expected 32 entries got {len(data)}"

    def test_plank_is_poster_only(self, api):
        r = api.get(f"{BASE_URL}/api/exercise-media/manifest", timeout=15)
        d = r.json()
        assert "plank" in d
        assert d["plank"].get("poster") is True
        assert not d["plank"].get("animation"), "plank should not have animation"

    def test_31_entries_have_animation_and_poster(self, api):
        r = api.get(f"{BASE_URL}/api/exercise-media/manifest", timeout=15)
        d = r.json()
        both = [k for k, v in d.items() if v.get("animation") and v.get("poster")]
        assert len(both) == 31, f"expected 31 animation+poster, got {len(both)}"

    def test_new_swapped_ids_present(self, api):
        r = api.get(f"{BASE_URL}/api/exercise-media/manifest", timeout=15)
        d = r.json()
        assert "cable-external-rotation" in d
        assert "single-leg-calf-raise" in d
        assert d["cable-external-rotation"].get("animation")
        assert d["single-leg-calf-raise"].get("animation")

    def test_old_ids_removed(self, api):
        r = api.get(f"{BASE_URL}/api/exercise-media/manifest", timeout=15)
        d = r.json()
        assert "cuban-rotation" not in d
        assert "tibialis-raise" not in d


# ---- Media file endpoints ----
class TestMediaFiles:
    def test_bench_press_animation_webp(self, api):
        r = api.get(f"{BASE_URL}/api/exercise-media/bench-press/animation", timeout=20)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("image/webp")
        assert len(r.content) > 10000, "animation should be non-trivial size"

    def test_bench_press_poster(self, api):
        r = api.get(f"{BASE_URL}/api/exercise-media/bench-press/poster", timeout=20)
        assert r.status_code == 200
        ct = r.headers.get("content-type", "")
        assert ct.startswith("image/"), f"unexpected content-type {ct}"
        assert len(r.content) > 1000

    def test_nonexistent_animation_returns_404(self, api):
        r = api.get(f"{BASE_URL}/api/exercise-media/nonexistent-xyz/animation", timeout=15)
        assert r.status_code == 404

    def test_plank_animation_returns_404(self, api):
        # plank is poster-only
        r = api.get(f"{BASE_URL}/api/exercise-media/plank/animation", timeout=15)
        assert r.status_code == 404

    def test_plank_poster_returns_200(self, api):
        r = api.get(f"{BASE_URL}/api/exercise-media/plank/poster", timeout=15)
        assert r.status_code == 200

    def test_cable_external_rotation_animation(self, api):
        r = api.get(f"{BASE_URL}/api/exercise-media/cable-external-rotation/animation", timeout=20)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("image/webp")

    def test_single_leg_calf_raise_animation(self, api):
        r = api.get(f"{BASE_URL}/api/exercise-media/single-leg-calf-raise/animation", timeout=20)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("image/webp")


# ---- Regression: exercises list ----
class TestExercisesRegression:
    def test_exercises_list_returns(self, api):
        r = api.get(f"{BASE_URL}/api/exercises", timeout=20)
        assert r.status_code == 200
        data = r.json()
        # Accept either list at top-level or dict wrapper
        if isinstance(data, dict) and "exercises" in data:
            data = data["exercises"]
        assert isinstance(data, list)
        assert len(data) > 10
