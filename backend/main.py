"""
C2PA-Veritas FastAPI Backend
"""
import dataclasses
import json
import logging
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, UploadFile, Header, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from core.audit import get_by_hash, get_recent, log_check, sha256_of_bytes
from core.extractor import ProvenanceReport, extract_provenance
from core.signer import sign_media

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

VERSION = "1.0.0"
SUPPORTED_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".avif", ".mp4", ".mov", ".pdf"}

CORS_ORIGINS = [o.strip() for o in os.getenv(
    "CORS_ORIGINS", "http://localhost:8000,http://127.0.0.1:8000"
).split(",")]

API_KEY = os.getenv("API_KEY", "").strip()


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

async def verify_api_key(x_api_key: str | None = Header(default=None, alias="X-API-KEY")):
    if not API_KEY:
        return
    if not x_api_key or x_api_key != API_KEY:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or missing API key.")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("C2PA-Veritas starting.")
    yield
    logger.info("C2PA-Veritas shutdown.")

app = FastAPI(title="C2PA-Veritas", version=VERSION, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins     = CORS_ORIGINS,
    allow_credentials = True,
    allow_methods     = ["GET", "POST"],
    allow_headers     = ["Content-Type", "X-API-KEY"],
)


# ---------------------------------------------------------------------------
# Serialisation helper (dataclasses → JSON-safe dict)
# ---------------------------------------------------------------------------

def _report_to_dict(report: ProvenanceReport) -> dict:
    d = dataclasses.asdict(report)
    d["status"] = report.status.value
    return d


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {"status": "ok", "version": VERSION}


@app.post("/api/v1/verify", dependencies=[Depends(verify_api_key)])
async def verify(
    file: UploadFile = File(...),
    trust_anchors: str | None = Form(default=None, description="PEM-encoded trust anchors (optional)"),
):
    """
    Verify the C2PA provenance of a media file.

    Returns a full ProvenanceReport including:
    - Validation status (VALID / INVALID / NO_MANIFEST / PARTIAL)
    - Edit history timeline
    - Issuer / certificate chain info
    - AI training policy assertions
    - Raw manifest JSON
    """
    start = time.time()
    ext   = Path(file.filename or "").suffix.lower()

    if ext not in SUPPORTED_EXTS:
        raise HTTPException(400, f"Unsupported file type. Supported: {', '.join(sorted(SUPPORTED_EXTS))}")

    content = await file.read()
    if len(content) > 200 * 1024 * 1024:
        raise HTTPException(413, "File too large. Maximum is 200MB.")

    sha = sha256_of_bytes(content)
    logger.info(f"Verifying: {file.filename} ({len(content) // 1024}KB) sha256={sha[:16]}...")

    report = extract_provenance(
        file_bytes         = content,
        filename           = file.filename or "upload",
        file_sha256        = sha,
        trust_anchors_pem  = trust_anchors,
    )

    processing_sec = round(time.time() - start, 2)
    log_check(content, file.filename or "upload", report, processing_sec)

    result = _report_to_dict(report)
    result["processing_time_sec"] = processing_sec
    return result


@app.post("/api/v1/sign", dependencies=[Depends(verify_api_key)])
async def sign(
    file:            UploadFile = File(...),
    action:          str        = Form(default="c2pa.created"),
    software_agent:  str | None = Form(default=None),
    digital_source:  str        = Form(default="http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture"),
    no_ai_training:  bool       = Form(default=True),
    claim_generator: str        = Form(default="C2PA-Veritas/1.0"),
):
    """
    Sign a media file with a C2PA manifest using a development certificate.

    Returns the signed file as a binary download.
    NOTE: Self-signed certs will not pass public C2PA trust validation.
    Use the returned file to test the /verify endpoint's full round-trip.
    """
    ext = Path(file.filename or "").suffix.lower()
    if ext not in SUPPORTED_EXTS:
        raise HTTPException(400, f"Unsupported file type.")

    content = await file.read()
    logger.info(f"Signing: {file.filename}")

    try:
        signed_bytes = sign_media(
            file_bytes      = content,
            filename        = file.filename or "upload",
            claim_generator = claim_generator,
            action          = action,
            software_agent  = software_agent,
            digital_source  = digital_source,
            no_ai_training  = no_ai_training,
            timestamp_url   = None, # Bypasses the TSA entirely for local testing
        )
    except Exception as e:
        logger.exception("Signing failed")
        raise HTTPException(500, f"Signing failed: {str(e)}")

    stem    = Path(file.filename or "signed").stem
    outname = f"{stem}_signed{ext}"

    return Response(
        content      = signed_bytes,
        media_type   = "application/octet-stream",
        headers      = {"Content-Disposition": f'attachment; filename="{outname}"'},
    )


@app.get("/api/v1/history", dependencies=[Depends(verify_api_key)])
async def history(limit: int = Query(default=50, le=200)):
    return {"entries": get_recent(limit)}


@app.get("/api/v1/history/{file_hash}", dependencies=[Depends(verify_api_key)])
async def history_by_hash(file_hash: str):
    entries = get_by_hash(file_hash)
    if not entries:
        raise HTTPException(404, "No records for this file hash.")
    return {"entries": entries}


# ---------------------------------------------------------------------------
# Static File Serving
# ---------------------------------------------------------------------------

# Point FastAPI to the folder where Vite is actually putting the files
_static = Path(__file__).parent / "static"

if _static.exists():
    # Mount the /assets folder so JS and CSS load correctly
    _assets = _static / "assets"
    if _assets.exists():
        app.mount("/assets", StaticFiles(directory=str(_assets)), name="assets")

    # Serve the main HTML file at the root URL
    @app.get("/")
    async def serve_frontend():
        return FileResponse(str(_static / "index.html"))
else:
    logger.warning(
        f"Frontend build directory not found at {_static}. "
        "Check your Vite configuration."
    )
