"""
Tests for core.trust. fetch_and_cache() network calls are mocked — tests
must never depend on reaching a real URL (offline/CI-safe, no flakiness).
"""
import time
from unittest.mock import MagicMock, patch

import pytest

from core import trust

_SAMPLE_PEM = (
    "-----BEGIN CERTIFICATE-----\n"
    "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA\n"
    "-----END CERTIFICATE-----\n"
)


def test_anchor_count():
    assert trust._anchor_count(_SAMPLE_PEM) == 1
    assert trust._anchor_count(_SAMPLE_PEM * 3) == 3
    assert trust._anchor_count("not a cert") == 0


def test_save_uploaded_valid_pem():
    meta = trust.save_uploaded(_SAMPLE_PEM.encode("utf-8"), source_label="upload:test.pem")
    assert meta["source"] == "upload:test.pem"
    assert meta["anchor_count"] == 1

    cached_pem, cached_meta = trust.get_cached()
    assert cached_pem == _SAMPLE_PEM
    assert cached_meta["source"] == "upload:test.pem"


def test_save_uploaded_rejects_non_pem_content():
    with pytest.raises(trust.TrustListError):
        trust.save_uploaded(b"just some random bytes, not a certificate", "bad-upload")


def test_is_stale():
    fresh_meta = {"fetched_at": time.time()}
    stale_meta = {"fetched_at": 0}  # epoch — always stale
    assert trust.is_stale(fresh_meta) is False
    assert trust.is_stale(stale_meta) is True


def test_status_reflects_cache_state():
    trust.save_uploaded(_SAMPLE_PEM.encode("utf-8"), source_label="upload:status-test.pem")
    s = trust.status()
    assert s["cache_present"] is True
    assert s["anchor_count"] == 1
    assert s["stale"] is False


def test_fetch_and_cache_without_url_configured_raises():
    # conftest.py sets TRUST_LIST_URL="" — no URL given, none configured either.
    assert trust.TRUST_LIST_URL == ""
    with pytest.raises(trust.TrustListError, match="not configured"):
        trust.fetch_and_cache()


def test_fetch_and_cache_success_with_mocked_network():
    fake_response = MagicMock()
    fake_response.read.return_value = _SAMPLE_PEM.encode("utf-8")
    fake_response.__enter__.return_value = fake_response
    fake_response.__exit__.return_value = False

    with patch("core.trust.urllib.request.urlopen", return_value=fake_response) as mock_urlopen:
        meta = trust.fetch_and_cache(url="https://example.invalid/trust.pem")
        assert meta["anchor_count"] == 1
        assert meta["source"] == "https://example.invalid/trust.pem"
        mock_urlopen.assert_called_once()


def test_fetch_and_cache_rejects_non_pem_response():
    fake_response = MagicMock()
    fake_response.read.return_value = b"<html>not a cert bundle</html>"
    fake_response.__enter__.return_value = fake_response
    fake_response.__exit__.return_value = False

    with patch("core.trust.urllib.request.urlopen", return_value=fake_response), \
         pytest.raises(trust.TrustListError):
        trust.fetch_and_cache(url="https://example.invalid/not-a-cert")
