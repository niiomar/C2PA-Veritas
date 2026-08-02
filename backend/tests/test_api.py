"""
Route-level tests for main.py using FastAPI's TestClient. Exercises the HTTP
layer itself (auth, status codes, response shape) — the other test modules
only ever call the core functions directly, never through the actual app.
"""
import os

from fastapi.testclient import TestClient

import main
from core import ratelimit

client = TestClient(main.app)
AUTH = {"X-API-KEY": os.environ["API_KEY"]}


def test_health_unauthenticated():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_metrics_unauthenticated_prometheus_format():
    res = client.get("/metrics")
    assert res.status_code == 200
    assert "veritas_verify_total" in res.text


def test_verify_requires_api_key(blank_jpeg):
    res = client.post("/api/v1/verify", files={"file": ("test.jpg", blank_jpeg, "image/jpeg")})
    assert res.status_code == 401


def test_verify_no_manifest_file(blank_jpeg):
    res = client.post(
        "/api/v1/verify",
        files={"file": ("test.jpg", blank_jpeg, "image/jpeg")},
        headers=AUTH,
    )
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "NO_MANIFEST"
    assert "file_sha256" in body


def test_verify_rejects_unsupported_extension(blank_jpeg):
    res = client.post(
        "/api/v1/verify",
        files={"file": ("test.exe", blank_jpeg, "application/octet-stream")},
        headers=AUTH,
    )
    assert res.status_code == 400


def test_sign_requires_api_key(blank_jpeg):
    res = client.post("/api/v1/sign", files={"file": ("test.jpg", blank_jpeg, "image/jpeg")})
    assert res.status_code == 401


def test_sign_returns_binary_download(blank_jpeg):
    res = client.post(
        "/api/v1/sign",
        files={"file": ("test.jpg", blank_jpeg, "image/jpeg")},
        headers=AUTH,
    )
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/octet-stream"
    assert "test_signed.jpg" in res.headers["content-disposition"]
    assert len(res.content) > len(blank_jpeg)  # manifest was embedded


def test_verify_batch_multiple_files(blank_jpeg):
    files = [("files", (f"f{i}.jpg", blank_jpeg, "image/jpeg")) for i in range(3)]
    res = client.post("/api/v1/verify/batch", files=files, headers=AUTH)
    assert res.status_code == 200
    body = res.json()
    assert body["count"] == 3
    assert len(body["results"]) == 3
    assert all(r["status"] == "NO_MANIFEST" for r in body["results"])


def test_verify_batch_rejects_over_25_files(blank_jpeg):
    files = [("files", (f"f{i}.jpg", blank_jpeg, "image/jpeg")) for i in range(26)]
    res = client.post("/api/v1/verify/batch", files=files, headers=AUTH)
    assert res.status_code == 400


def test_history_pagination_shape():
    res = client.get("/api/v1/history?limit=5&offset=0", headers=AUTH)
    assert res.status_code == 200
    body = res.json()
    assert set(body.keys()) == {"entries", "total", "limit", "offset"}
    assert body["limit"] == 5


def test_history_export_csv():
    res = client.get("/api/v1/history/export.csv", headers=AUTH)
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    assert res.text.splitlines()[0].startswith("id,timestamp,file_sha256")


def test_trust_list_status_shape():
    res = client.get("/api/v1/trust-list", headers=AUTH)
    assert res.status_code == 200
    assert "configured_url_present" in res.json()


def test_trust_list_upload_rejects_oversized_file():
    oversized = b"x" * (1 * 1024 * 1024 + 1)
    res = client.post(
        "/api/v1/trust-list/upload",
        files={"file": ("huge.pem", oversized, "application/x-pem-file")},
        headers=AUTH,
    )
    assert res.status_code == 413


def test_audit_verify_endpoint():
    res = client.get("/api/v1/audit/verify", headers=AUTH)
    assert res.status_code == 200
    assert "valid" in res.json()


def test_security_headers_present():
    res = client.get("/health")
    assert res.headers["x-content-type-options"] == "nosniff"
    assert res.headers["x-frame-options"] == "DENY"
    assert "script-src 'self'" in res.headers["content-security-policy"]


def test_rate_limit_returns_429_when_exceeded(blank_jpeg, monkeypatch):
    monkeypatch.setattr(ratelimit, "RATE_LIMIT_MAX", 2)
    ratelimit._hits.clear()
    try:
        for _ in range(2):
            res = client.post(
                "/api/v1/verify",
                files={"file": ("test.jpg", blank_jpeg, "image/jpeg")},
                headers=AUTH,
            )
            assert res.status_code == 200
        res = client.post(
            "/api/v1/verify",
            files={"file": ("test.jpg", blank_jpeg, "image/jpeg")},
            headers=AUTH,
        )
        assert res.status_code == 429
        assert "Retry-After" in res.headers
    finally:
        # Don't let this test's exhausted quota bleed into tests that run after it.
        ratelimit._hits.clear()
