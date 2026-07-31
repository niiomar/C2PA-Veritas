# C2PA-Veritas

**A media content provenance verifier and signer** built on the C2PA (Coalition for Content Provenance and Authenticity) open standard, the cryptographic complement to AI-based deepfake detection.

[![CI](https://github.com/niiomar/C2PA-Veritas/actions/workflows/ci.yml/badge.svg)](https://github.com/niiomar/C2PA-Veritas/actions/workflows/ci.yml)
[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/)
[![Node 18+](https://img.shields.io/badge/node-18+-green.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Overview

Where [ViT-CORE-FORENSICS](https://github.com/niiomar/VIT-CORE-FORENSICS) asks *"does this media look manipulated?"*, C2PA-Veritas asks *"can we cryptographically verify where this media came from and what has been done to it?"*  the two systems cover complementary halves of the media authenticity problem.

C2PA is an open standard backed by Adobe, Microsoft, BBC, Sony, and OpenAI. Content signed with C2PA carries a cryptographically-verified edit history embedded directly in the file. C2PA-Veritas parses and validates these manifests, surfaces the edit timeline, detects stripped or absent credentials, and can sign new files with a development certificate for full round-trip testing.

---

## Key Features

- **Manifest extraction** — reads C2PA JUMBF manifests from JPEG, PNG, WebP, AVIF, MP4, MOV, PDF
- **Signature validation** — verifies certificate chains against configurable trust anchors
- **Edit history timeline** — flattens action assertions across the full manifest store into a chronological view
- **Stripped-manifest detection** — explicitly surfaces `NO_MANIFEST` as a forensic signal
- **AI training policy extraction** — surfaces `c2pa.training-mining` assertions (notAllowed / allowed / constrained)
- **Demo signing** — signs files with a dev certificate for create→verify round-trip testing
- **Forensic audit log** — every check recorded in SQLite, keyed by file SHA-256, and **hash-chained** so post-hoc edits or deletions of past rows are detectable
- **Batch verification** — verify up to 25 files in a single request via `/verify/batch`
- **Sequence completeness (Veritas extension)** — an optional, non-standard `veritas.batch` assertion lets a set of related assets declare an expected count; verification cross-checks it against the audit log to flag missing (omitted) members. **Not part of the official C2PA spec.**
- **Trust list support** — cache a PEM trust anchor bundle from an operator-configured URL or a manual upload, and opt individual verifications into using it
- **CSV audit export** — download the full audit log via `/history/export.csv`
- **Prometheus metrics** — request/verification counters at `/metrics`
- **REST API** — `/verify`, `/sign`, `/history` endpoints with optional API key auth
- **CLI tool** — `python scripts/demo_verify.py image.jpg` with no server required

---

## Relationship to ViT-CORE-FORENSICS

| | ViT-CORE-FORENSICS | C2PA-Veritas |
|---|---|---|
| Approach | ML probabilistic detection | Cryptographic provenance verification |
| Works without C2PA data | ✅ | Returns NO_MANIFEST signal |
| Output | FAKE / REAL + attention heatmap | VALID / INVALID / NO_MANIFEST + edit timeline |
| Explainability | Attention Rollout | Certificate chain + edit history |

Together they cover the full media authenticity problem.

---

## Project Structure

```
C2PA-Veritas/
├── backend/
│   ├── main.py              # FastAPI: /verify, /sign, /history endpoints
│   ├── core/
│   │   ├── extractor.py     # C2PA manifest extraction + validation engine
│   │   ├── signer.py        # Dev certificate signing for round-trip testing
│   │   ├── audit.py         # Hash-chained SQLite forensic audit log
│   │   ├── trust.py         # Trust anchor list fetch/cache/upload
│   │   └── metrics.py       # In-memory counters for /metrics
│   ├── requirements.txt
│   ├── .env.example
│   ├── static/              # Vite build output (generated — not tracked in git)
│   └── tests/
│       ├── test_extractor.py
│       └── test_signer.py
├── frontend/
│   ├── src/
│   │   ├── app.js           # Entry point UI logic, verify/sign flows, history
│   │   ├── styles.css       # Full design system
│   │   ├── components/      # sidebar.js, workspace.js, history.js
│   │   └── utils/api.js     # API calls to backend
│   ├── index.html
│   ├── .env.example
│   ├── package.json
│   └── vite.config.js       # builds to ../backend/static
├── scripts/
│   └── demo_verify.py       # CLI verification tool
├── .github/workflows/ci.yml
├── .gitignore
├── Dockerfile
├── docker-compose.yml
├── CONTRIBUTING.md
├── SECURITY.md
└── LICENSE
```

---

## Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+

### 1. Clone

```bash
git clone https://github.com/niiomar/C2PA-Veritas.git
cd C2PA-Veritas
```

### 2. Backend setup

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate

# macOS / Linux
source venv/bin/activate

pip install --upgrade pip
pip install -r requirements.txt
cp .env.example .env
```

### 3. Frontend setup

```bash
cd ../frontend
cp .env.example .env        # set VITE_API_KEY to match backend/.env
npm install
npm run build               # compiles into backend/static/
```

### 4. Run

```bash
cd ../backend
uvicorn main:app --reload
```

Open **http://localhost:8000**

---

## Development Mode (hot reload)

**Terminal 1 — Backend:**
```bash
cd backend
source venv/bin/activate    # or venv\Scripts\activate on Windows
uvicorn main:app --reload
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev                 # → http://localhost:3000, proxies /api to :8000
```

---

## CLI Demo (no server required)

```bash
# Pretty-printed report
python scripts/demo_verify.py path/to/image.jpg

# Raw JSON output
python scripts/demo_verify.py path/to/image.jpg --json
```

---

## Docker

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
# Edit both files

docker compose up --build
```

---

## API Reference

All endpoints except `/health` require `X-API-KEY` header when `API_KEY` is set in `backend/.env`.

### `POST /api/v1/verify`
Verify C2PA provenance of a media file.

**Form fields:** `file` (required), `trust_anchors` (optional PEM string), `use_trust_list` (optional bool — use the cached operator-configured trust list instead of the built-in one)

**Response fields:**
```json
{
  "status": "VALID | INVALID | NO_MANIFEST | PARTIAL | REMOTE_MANIFEST",
  "validation_state": "Valid",
  "signal": "Human-readable verdict string",
  "active_manifest": { "issuer": "...", "signing_algorithm": "...", "actions": [...] },
  "edit_timeline": [{ "action": "c2pa.created", "when": "...", "software_agent": "..." }],
  "file_sha256": "...",
  "processing_time_sec": 0.4,
  "disclaimer": "..."
}
```

### `POST /api/v1/sign`
Sign a media file with a dev C2PA certificate. Returns signed file as binary download.

**Form fields:** `file`, `action`, `software_agent`, `no_ai_training`, `claim_generator`, `batch_id` (optional, Veritas extension), `batch_expected_count` (optional, Veritas extension)

### `POST /api/v1/verify/batch`
Verify up to 25 media files in a single request. Same form fields as `/verify`, but `files` (plural) accepts multiple uploads.

**Response:** `{ "results": [{ "filename", ...ProvenanceReport }], "count": n }`

### `GET /api/v1/history?limit=50&offset=0`
Paginated audit log entries. **Response:** `{ "entries", "total", "limit", "offset" }`.

### `GET /api/v1/history/export.csv`
Downloads the full audit log as CSV.

### `GET /api/v1/history/{sha256}`
All past checks for a specific file hash.

### `GET /api/v1/audit/verify`
Recomputes the audit log's hash chain and reports whether any row has been altered or deleted since it was written. Best-effort tamper *evidence* for a single SQLite file on one host, not a distributed-ledger-grade guarantee.

### `GET /api/v1/trust-list`
Trust anchor cache status: source, fetch time, anchor count, staleness.

### `POST /api/v1/trust-list/refresh`
Re-fetches the trust anchor bundle from the configured `TRUST_LIST_URL`. 400 if not configured.

### `POST /api/v1/trust-list/upload`
Caches a manually-uploaded PEM trust anchor bundle. **Form fields:** `file`.

### `GET /metrics`
Prometheus-format request/verification counters. Unauthenticated (aggregate counts only, matching `/health`).

### `GET /health`
Liveness check.

---

## Configuration

### `backend/.env`

| Variable | Default | Description |
|---|---|---|
| `API_KEY` | *(unset)* | Shared secret for `X-API-KEY` auth. Unauthenticated if unset. |
| `CORS_ORIGINS` | `http://localhost:8000,http://127.0.0.1:8000` | Allowed frontend origins. |
| `AUDIT_DB_PATH` | `audit_log.db` | SQLite audit log path. |
| `TRUST_LIST_URL` | *(unset)* | Optional URL to a PEM trust anchor bundle. Only fetched via the authenticated `/trust-list/refresh` endpoint — never per-request. |
| `TRUST_LIST_CACHE_PATH` | `trust_list_cache.pem` | Where the fetched/uploaded trust anchor bundle is cached on disk. |

### `frontend/.env`

| Variable | Description |
|---|---|
| `VITE_API_KEY` | Baked into the JS bundle at build time. Must match `backend/.env` `API_KEY`. |

---

## Security & Deployment Notes

- `VITE_API_KEY` is compiled into the public JS bundle — it is not a secret. For any exposed deployment, place the application behind a reverse proxy (Nginx, Caddy) with IP allowlisting or mutual TLS.
- The dev signing certificate in `core/signer.py` is auto-generated, self-signed, and held only in memory — it is for local testing only and will not pass public C2PA trust validation.
- See [SECURITY.md](SECURITY.md) for vulnerability reporting.

---

## Related Projects

- [ViT-CORE-FORENSICS](https://github.com/niiomar/VIT-CORE-FORENSICS) — AI-based deepfake detection, the complementary system
- [ViT-CORE](https://github.com/niiomar/ViT-CORE) — the underlying training pipeline (MSc dissertation)
- [C2PA Specification](https://c2pa.org/specifications/specifications/2.1/specs/C2PA_Specification.html)
- [C2PA Trust List](https://c2pa.org/trust-list/)

---

## License

Released under the [MIT License](LICENSE).
