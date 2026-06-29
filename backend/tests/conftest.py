import os
import pytest
import requests
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://ai-coach-trainer-2.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def auth_session(api_client):
    """Create a fresh demo user/session shared across tests."""
    r = api_client.post(f"{BASE_URL}/api/auth/demo/login", timeout=30)
    assert r.status_code == 200, f"demo login failed: {r.status_code} {r.text}"
    data = r.json()
    return {
        "token": data["session_token"],
        "user": data["user"],
        "headers": {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {data['session_token']}",
        },
    }
