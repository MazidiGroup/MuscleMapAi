"""Anatomy backend tests - verifies the GLB model endpoint."""
import os
import requests
import pytest

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
if not BASE_URL:
    raise RuntimeError("EXPO_PUBLIC_BACKEND_URL not set")
BASE_URL = BASE_URL.rstrip("/")


# Anatomy: GLB model endpoint
class TestAnatomyModel:
    def test_anatomy_model_returns_200(self):
        r = requests.get(f"{BASE_URL}/api/anatomy/model", timeout=60, stream=True)
        assert r.status_code == 200, f"expected 200 got {r.status_code}"

    def test_anatomy_model_content_type_glb(self):
        r = requests.get(f"{BASE_URL}/api/anatomy/model", timeout=60, stream=True)
        ct = r.headers.get("content-type", "")
        assert "gltf-binary" in ct or "model/gltf" in ct or "octet-stream" in ct, f"unexpected content-type: {ct}"

    def test_anatomy_model_glb_magic_and_size(self):
        r = requests.get(f"{BASE_URL}/api/anatomy/model", timeout=120)
        assert r.status_code == 200
        body = r.content
        # GLB magic = 0x46546C67 = 'glTF'
        assert body[:4] == b"glTF", f"not a GLB; first bytes: {body[:8]!r}"
        size_mb = len(body) / (1024 * 1024)
        # spec says ~5.6MB - allow a wide window
        assert 1.0 < size_mb < 20.0, f"unexpected size {size_mb:.2f} MB"


# Anatomy: ensure 404 handling on a related bad path
class TestAnatomyBadPath:
    def test_unknown_anatomy_path(self):
        r = requests.get(f"{BASE_URL}/api/anatomy/nonexistent", timeout=15)
        assert r.status_code in (404, 405)
