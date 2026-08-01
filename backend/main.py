"""
C2PA-Veritas FastAPI Backend
"""
import csv
import dataclasses
import io
import json
import logging
import os
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, Request, UploadFile, Header, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse, Response
from fastapi.staticfiles import StaticFiles

from core.audit import count_all, count_batch_members, get_by_hash, get_recent, iter_all_rows, log_check, sha256_of_bytes, verify_chain
from core.extractor import ProvenanceReport, extract_provenance
from core.signer import sign_media
from core import trust
from core import metrics
from core import ratelimit

# Global Configuration & Environment
load_dotenv()


class _JsonLogFormatter(logging.Formatter):
    """Renders each log record as a single JSON line, tagged with the request ID when present."""
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts":      self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level":   record.levelname,
            "logger":  record.name,
            "message": record.getMessage(),
        }
        request_id = getattr(record, "request_id", None)
        if request_id:
            payload["request_id"] = request_id
        return json.dumps(payload)


_handler = logging.StreamHandler()
_handler.setFormatter(_JsonLogFormatter())
logging.basicConfig(level=logging.INFO, handlers=[_handler])
logger = logging.getLogger(__name__)

VERSION = "1.0.0"
SUPPORTED_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".avif", ".mp4", ".mov", ".pdf"}

# Content-Security-Policy: script-src is intentionally strict (no inline
# scripts exist in the frontend — the 8 onclick= handlers that used to require
# it were converted to addEventListener specifically so this could hold).
# style-src allows 'unsafe-inline' because the UI relies heavily on inline
# style="..." attributes; that's a far smaller risk than allowing inline
# script, since CSS alone can't execute JS.
CONTENT_SECURITY_POLICY = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: blob:; "
    "media-src 'self' blob:; "
    "font-src 'self'; "
    "connect-src 'self'; "
    "object-src 'none'; "
    "base-uri 'self'; "
    "frame-ancestors 'none'; "
    "form-action 'self'"
)

# Security: CORS origins mapped to local development and frontend deployment ports
CORS_ORIGINS = [o.strip() for o in os.getenv(
    "CORS_ORIGINS", "http://localhost:8000,http://127.0.0.1:8000"
).split(",")]

API_KEY = os.getenv("API_KEY", "").strip()

# Authentication Middleware
# Secures the API endpoints so only authorized clients can trigger forensic scans
async def verify_api_key(x_api_key: str | None = Header(default=None, alias="X-API-KEY")):
    if not API_KEY:
        return
    if not x_api_key or x_api_key != API_KEY:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or missing API key.")


async def rate_limit(request: Request):
    """Throttle the expensive endpoints (verify/sign) per API key, or per client IP if unset."""
    client_id = request.headers.get("x-api-key") or (request.client.host if request.client else "unknown")
    if not ratelimit.check(client_id):
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded. Please slow down.",
            headers={"Retry-After": str(ratelimit.RATE_LIMIT_WINDOW_SEC)},
        )

# Application Initialization
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("C2PA-Veritas starting.")
    yield
    logger.info("C2PA-Veritas shutdown.")

app = FastAPI(title="C2PA-Veritas", version=VERSION, lifespan=lifespan)

# Binds CORS policy to allow the Vite frontend to communicate with this Python backend
app.add_middleware(
    CORSMiddleware,
    allow_origins     = CORS_ORIGINS,
    allow_credentials = True,
    allow_methods     = ["GET", "POST"],
    allow_headers     = ["Content-Type", "X-API-KEY"],
)


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    request_id = uuid.uuid4().hex[:16]
    start = time.time()
    try:
        response = await call_next(request)
    except Exception:
        metrics.incr("veritas_errors_total")
        logger.error(
            f"{request.method} {request.url.path} raised an exception",
            extra={"request_id": request_id},
        )
        raise
    duration_ms = round((time.time() - start) * 1000, 2)
    if response.status_code >= 500:
        metrics.incr("veritas_errors_total")
    logger.info(
        f"{request.method} {request.url.path} -> {response.status_code} ({duration_ms}ms)",
        extra={"request_id": request_id},
    )
    response.headers["X-Request-ID"] = request_id
    response.headers["Content-Security-Policy"] = CONTENT_SECURITY_POLICY
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "same-origin"
    return response


# Data Serialization
# Converts the internal Python dataclass into a JSON-safe dictionary for the API response
def _report_to_dict(report: ProvenanceReport) -> dict:
    d = dataclasses.asdict(report)
    d["status"] = report.status.value
    return d

# API Routing: Diagnostics
@app.get("/health")
async def health():
    return {"status": "ok", "version": VERSION}


@app.get("/metrics")
async def metrics_endpoint():
    """
    Prometheus-format counters. Left unauthenticated (matching /health) since
    the exposed data is aggregate request counts only — nothing sensitive.
    """
    return PlainTextResponse(metrics.render_prometheus(), media_type="text/plain; version=0.0.4")


def _check_uploaded(filename: str, content: bytes) -> None:
    """Reject unsupported extensions and oversized uploads before any processing happens."""
    ext = Path(filename or "").suffix.lower()
    if ext not in SUPPORTED_EXTS:
        raise HTTPException(400, f"Unsupported file type. Supported: {', '.join(sorted(SUPPORTED_EXTS))}")
    if len(content) > 200 * 1024 * 1024:
        raise HTTPException(413, "File too large. Maximum is 200MB.")


def _verify_single(content: bytes, filename: str, trust_anchors: str | None, use_trust_list: bool) -> dict:
    """
    Shared verification core used by both /verify and /verify/batch: extracts
    provenance, logs the audit entry, and attaches the Veritas batch
    cross-check (sequence_invariants) when applicable.
    """
    start = time.time()
    sha   = sha256_of_bytes(content)
    logger.info(f"Verifying: {filename} ({len(content) // 1024}KB) sha256={sha[:16]}...")

    if not trust_anchors and use_trust_list:
        cached_pem, _ = trust.get_cached()
        if cached_pem:
            trust_anchors = cached_pem
        else:
            logger.warning("use_trust_list requested but no cached trust list is present; using built-in trust list.")

    report = extract_provenance(
        file_bytes         = content,
        filename           = filename,
        file_sha256        = sha,
        trust_anchors_pem  = trust_anchors,
    )

    processing_sec = round(time.time() - start, 2)
    batch_info = report.active_manifest.batch_info if report.active_manifest else None
    batch_id = batch_info.get("batch_id") if batch_info else None
    log_check(content, filename, report, processing_sec, batch_id=batch_id)
    metrics.record_verify_status(report.status.value)

    result = _report_to_dict(report)
    result["processing_time_sec"] = processing_sec

    # Veritas extension — cross-check the declared batch size against how many
    # distinct files from this batch have been verified so far, per the audit log.
    if batch_info and batch_info.get("batch_id") and batch_info.get("expected_count"):
        result["sequence_invariants"] = {
            "batch_id":            batch_info["batch_id"],
            "expected_count":      batch_info["expected_count"],
            "actual_count":        count_batch_members(batch_info["batch_id"]),
            "is_veritas_extension": True,
        }

    return result

# API Routing: Core Forensic Verification
@app.post("/api/v1/verify", dependencies=[Depends(verify_api_key), Depends(rate_limit)])
async def verify(
    file: UploadFile = File(...),
    trust_anchors: str | None = Form(default=None, description="PEM-encoded trust anchors (optional)"),
    use_trust_list: bool = Form(default=False, description="Use the cached operator-configured trust list, if any"),
):
    """
    Ingests media, extracts cryptographic receipts, and verifies the C2PA provenance.
    Returns a ProvenanceReport containing validation status, timelines, and raw JSON.
    """
    content = await file.read()
    _check_uploaded(file.filename or "", content)
    return _verify_single(content, file.filename or "upload", trust_anchors, use_trust_list)


@app.post("/api/v1/verify/batch", dependencies=[Depends(verify_api_key), Depends(rate_limit)])
async def verify_batch(
    files: list[UploadFile] = File(...),
    trust_anchors: str | None = Form(default=None),
    use_trust_list: bool = Form(default=False),
):
    """Verify up to 25 media files in a single request."""
    if len(files) > 25:
        raise HTTPException(400, "Batch too large. Maximum is 25 files per request.")

    results = []
    for f in files:
        content = await f.read()
        _check_uploaded(f.filename or "", content)
        report = _verify_single(content, f.filename or "upload", trust_anchors, use_trust_list)
        results.append({"filename": f.filename or "upload", **report})

    return {"results": results, "count": len(results)}

# API Routing: Cryptographic Signing
@app.post("/api/v1/sign", dependencies=[Depends(verify_api_key), Depends(rate_limit)])
async def sign(
    file:            UploadFile = File(...),
    action:          str        = Form(default="c2pa.created"),
    software_agent:  str | None = Form(default=None),
    digital_source:  str        = Form(default="http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture"),
    no_ai_training:  bool       = Form(default=True),
    claim_generator: str        = Form(default="C2PA-Veritas/1.0"),
    batch_id:              str | None = Form(default=None),
    batch_expected_count:  int | None = Form(default=None),
):
    """
    Injects a C2PA manifest and signs the media using a local development certificate.
    Returns the secured asset as a direct binary download.
    """
    content = await file.read()
    _check_uploaded(file.filename or "", content)
    ext = Path(file.filename or "").suffix.lower()

    logger.info(f"Signing: {file.filename}")
    metrics.incr("veritas_sign_total")

    try:
        # Construct and inject the cryptographic manifest
        signed_bytes = sign_media(
            file_bytes      = content,
            filename        = file.filename or "upload",
            claim_generator = claim_generator,
            action          = action,
            software_agent  = software_agent,
            digital_source  = digital_source,
            no_ai_training  = no_ai_training,
            timestamp_url   = None, # Bypasses the TSA entirely for local testing
            batch_id              = batch_id,
            batch_expected_count  = batch_expected_count,
        )
    except Exception as e:
        logger.exception("Signing failed")
        raise HTTPException(500, f"Signing failed: {str(e)}")

    stem    = Path(file.filename or "signed").stem
    outname = f"{stem}_signed{ext}"

    # Return the file payload straight to the browser for downloading
    return Response(
        content      = signed_bytes,
        media_type   = "application/octet-stream",
        headers      = {"Content-Disposition": f'attachment; filename="{outname}"'},
    )

# API Routing: Audit History
@app.get("/api/v1/history", dependencies=[Depends(verify_api_key)])
async def history(limit: int = Query(default=50, le=200), offset: int = Query(default=0, ge=0)):
    return {
        "entries": get_recent(limit, offset),
        "total":   count_all(),
        "limit":   limit,
        "offset":  offset,
    }


@app.get("/api/v1/history/export.csv", dependencies=[Depends(verify_api_key)])
async def history_export_csv():
    """Download the full audit log as CSV."""
    rows = iter_all_rows()
    buf = io.StringIO()
    fieldnames = [
        "id", "timestamp", "file_sha256", "filename", "media_type", "status",
        "validation_state", "issuer", "manifest_count", "action_count",
        "processing_sec", "batch_id", "prev_hash", "row_hash",
    ]
    writer = csv.DictWriter(buf, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)

    return Response(
        content    = buf.getvalue(),
        media_type = "text/csv",
        headers    = {"Content-Disposition": 'attachment; filename="audit_log.csv"'},
    )

@app.get("/api/v1/history/{file_hash}", dependencies=[Depends(verify_api_key)])
async def history_by_hash(file_hash: str):
    """Every past check recorded for a given file's SHA-256."""
    entries = get_by_hash(file_hash)
    if not entries:
        raise HTTPException(404, "No records for this file hash.")
    return {"entries": entries}


@app.get("/api/v1/trust-list", dependencies=[Depends(verify_api_key)])
async def trust_list_status():
    """Metadata for the cached trust anchor bundle: source, fetch time, anchor count, staleness."""
    return trust.status()


@app.post("/api/v1/trust-list/refresh", dependencies=[Depends(verify_api_key)])
async def trust_list_refresh():
    """Re-fetch the trust anchor bundle from TRUST_LIST_URL. 400 if that env var isn't set."""
    try:
        return trust.fetch_and_cache()
    except trust.TrustListError as e:
        raise HTTPException(400, str(e))


@app.post("/api/v1/trust-list/upload", dependencies=[Depends(verify_api_key)])
async def trust_list_upload(file: UploadFile = File(...)):
    """Cache a manually-uploaded PEM trust anchor bundle (alternative to TRUST_LIST_URL)."""
    content = await file.read()
    if len(content) > 1 * 1024 * 1024:
        raise HTTPException(413, "Trust bundle too large. Maximum is 1MB.")
    try:
        return trust.save_uploaded(content, source_label=f"upload:{file.filename}")
    except trust.TrustListError as e:
        raise HTTPException(400, str(e))


@app.get("/api/v1/audit/verify", dependencies=[Depends(verify_api_key)])
async def audit_verify():
    """
    Recompute the audit log's hash chain and report whether any row has been
    altered or deleted after being written.

    NOTE: this is best-effort tamper *evidence* for a single SQLite file on
    one host, not a distributed-ledger-grade guarantee — an operator with
    full filesystem access could still rewrite the entire chain consistently.
    """
    return verify_chain()


# Static File Serving
# Points the FastAPI backend to the compiled Vite frontend directory
_static = Path(__file__).parent / "static"

if _static.exists():
    # Mount the /assets folder so JS, CSS, and media load correctly
    _assets = _static / "assets"
    if _assets.exists():
        app.mount("/assets", StaticFiles(directory=str(_assets)), name="assets")

    # Serve the main HTML application entry point
    @app.get("/")
    async def serve_frontend():
        return FileResponse(str(_static / "index.html"))
else:
    logger.warning(
        f"Frontend build directory not found at {_static}. "
        "Check your Vite configuration."
    )
