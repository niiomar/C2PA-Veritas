"""
C2PA trust anchor list management.

Trust anchors are never fetched from a URL supplied by an API caller (that
would be an SSRF vector). The only outbound fetch happens against the
operator-configured TRUST_LIST_URL, triggered by an authenticated refresh
call — the same trust boundary as any other environment variable.
"""
import json
import logging
import os
import time
import urllib.error
import urllib.request
from pathlib import Path

logger = logging.getLogger(__name__)

TRUST_LIST_URL        = os.getenv("TRUST_LIST_URL", "").strip()
TRUST_LIST_CACHE_PATH = Path(os.getenv("TRUST_LIST_CACHE_PATH", "trust_list_cache.pem"))
_META_PATH             = TRUST_LIST_CACHE_PATH.with_suffix(TRUST_LIST_CACHE_PATH.suffix + ".meta.json")

_FETCH_TIMEOUT_SEC = 15
_PEM_MARKER        = "-----BEGIN CERTIFICATE-----"


class TrustListError(Exception):
    pass


def _anchor_count(pem_text: str) -> int:
    """Count how many certificates a PEM bundle contains."""
    return pem_text.count(_PEM_MARKER)


def _write_cache(pem_text: str, source: str) -> dict:
    """Persist the PEM bundle plus a JSON metadata sidecar (source, timestamp, anchor count)."""
    TRUST_LIST_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    TRUST_LIST_CACHE_PATH.write_text(pem_text, encoding="utf-8")
    meta = {
        "source":       source,
        "fetched_at":   time.time(),
        "anchor_count": _anchor_count(pem_text),
    }
    _META_PATH.write_text(json.dumps(meta), encoding="utf-8")
    return meta


def fetch_and_cache(url: str | None = None) -> dict:
    """Fetch a PEM trust anchor bundle from `url` (or TRUST_LIST_URL) and cache it."""
    target = (url or TRUST_LIST_URL).strip()
    if not target:
        raise TrustListError("TRUST_LIST_URL is not configured.")

    req = urllib.request.Request(target, headers={"User-Agent": "C2PA-Veritas/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=_FETCH_TIMEOUT_SEC) as resp:
            pem_text = resp.read().decode("utf-8", errors="replace")
    except (urllib.error.URLError, TimeoutError) as e:
        raise TrustListError(f"Failed to fetch trust list from {target}: {e}") from e

    if _PEM_MARKER not in pem_text:
        raise TrustListError("Fetched content does not look like a PEM certificate bundle.")

    meta = _write_cache(pem_text, source=target)
    logger.info(f"Trust list refreshed from {target} ({meta['anchor_count']} anchors).")
    return meta


def save_uploaded(pem_bytes: bytes, source_label: str = "manual-upload") -> dict:
    """Cache a manually-uploaded PEM trust anchor bundle."""
    pem_text = pem_bytes.decode("utf-8", errors="replace")
    if _PEM_MARKER not in pem_text:
        raise TrustListError("Uploaded content does not look like a PEM certificate bundle.")

    meta = _write_cache(pem_text, source=source_label)
    logger.info(f"Trust list updated via upload ({meta['anchor_count']} anchors).")
    return meta


def get_cached() -> tuple[str | None, dict | None]:
    """Return (pem_text, meta) from the cache, or (None, None) if no cache exists."""
    if not TRUST_LIST_CACHE_PATH.exists() or not _META_PATH.exists():
        return None, None
    try:
        pem_text = TRUST_LIST_CACHE_PATH.read_text(encoding="utf-8")
        meta     = json.loads(_META_PATH.read_text(encoding="utf-8"))
        return pem_text, meta
    except (OSError, json.JSONDecodeError) as e:
        logger.warning(f"Failed to read cached trust list: {e}")
        return None, None


def is_stale(meta: dict, ttl_hours: float = 24) -> bool:
    """Whether the cached bundle was fetched more than `ttl_hours` ago."""
    return (time.time() - meta.get("fetched_at", 0)) > (ttl_hours * 3600)


def status() -> dict:
    """Cache metadata for the GET /api/v1/trust-list endpoint."""
    _, meta = get_cached()
    return {
        "configured_url_present": bool(TRUST_LIST_URL),
        "cache_present":          meta is not None,
        "source":                 meta.get("source") if meta else None,
        "fetched_at":             meta.get("fetched_at") if meta else None,
        "anchor_count":           meta.get("anchor_count") if meta else None,
        "stale":                  is_stale(meta) if meta else None,
    }
