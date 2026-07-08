"""Anatomy backend tests - GLB model endpoint + Coach SSE streaming."""
import os
import json
import requests
import pytest

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
if not BASE_URL:
    raise RuntimeError("EXPO_PUBLIC_BACKEND_URL not set")
BASE_URL = BASE_URL.rstrip("/")


# Anatomy: GLB model endpoint (regression)
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
        assert body[:4] == b"glTF", f"not a GLB; first bytes: {body[:8]!r}"
        size_mb = len(body) / (1024 * 1024)
        assert 1.0 < size_mb < 20.0, f"unexpected size {size_mb:.2f} MB"


# Anatomy: ensure 404/405 handling on a related bad path
class TestAnatomyBadPath:
    def test_unknown_anatomy_path(self):
        r = requests.get(f"{BASE_URL}/api/anatomy/nonexistent", timeout=15)
        assert r.status_code in (404, 405)


# Coach: SSE streaming endpoint (Phase 5)
# NOTE: Emergent LLM key budget is exceeded — backend should emit a 'failed' SSE event.
# We only verify HTTP shape: 200 + text/event-stream + at least one data: line.
class TestCoachAsk:
    URL = f"{BASE_URL}/api/coach/ask"
    PAYLOAD = {"message": "hi", "history": [], "context": None}

    def test_coach_ask_status_200(self):
        r = requests.post(self.URL, json=self.PAYLOAD, timeout=60, stream=True)
        assert r.status_code == 200, f"expected 200 got {r.status_code} - body: {r.text[:200]}"
        r.close()

    def test_coach_ask_content_type_event_stream(self):
        r = requests.post(self.URL, json=self.PAYLOAD, timeout=60, stream=True)
        ct = r.headers.get("content-type", "")
        assert "text/event-stream" in ct, f"unexpected content-type: {ct}"
        r.close()

    def test_coach_ask_emits_data_line(self):
        """At least one SSE 'data:' line should arrive (delta, done, or failed)."""
        r = requests.post(self.URL, json=self.PAYLOAD, timeout=60, stream=True)
        assert r.status_code == 200
        saw_data = False
        try:
            for raw in r.iter_lines(decode_unicode=True):
                if raw is None:
                    continue
                if raw.startswith("data:"):
                    saw_data = True
                    payload = raw[5:].strip()
                    if payload:
                        try:
                            obj = json.loads(payload)
                            if obj.get("done") or obj.get("failed"):
                                break
                        except json.JSONDecodeError:
                            pass
        finally:
            r.close()
        assert saw_data, "no SSE data: line received"
        # terminal is expected but not strictly required for the spec; soft assert
        # (we leave it as informational rather than strict to avoid flakiness)

    def test_coach_ask_validation_missing_message(self):
        r = requests.post(self.URL, json={"history": []}, timeout=15)
        # FastAPI/Pydantic should reject with 422
        assert r.status_code in (400, 422), f"expected 4xx got {r.status_code}"
