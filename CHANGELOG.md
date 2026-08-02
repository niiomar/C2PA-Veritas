# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows
[Semantic Versioning](https://semver.org/).

History prior to this file's introduction was not reconstructed retroactively
— see `git log` for the full commit history.

## [Unreleased]

### Added
- Batch verification (`POST /api/v1/verify/batch`, up to 25 files per request), with results in the UI clickable through to the full single-file detail view.
- Hash-chained forensic audit log (`core/audit.py`) with `GET /api/v1/audit/verify` to detect post-hoc tampering or deletion of past entries.
- Trust anchor list support (`core/trust.py`): cache a PEM bundle from an operator-configured `TRUST_LIST_URL` or a manual upload, with a sidebar panel (status, refresh, upload) and an opt-in `use_trust_list` flag on `/verify`.
- Sequence completeness / omission detection — a non-standard `veritas.batch` Veritas extension (clearly labeled as such, not part of the official C2PA spec) that lets related assets declare an expected batch size, cross-checked against the audit log at verify time.
- CSV audit log export (`GET /api/v1/history/export.csv`) and pagination (`limit`/`offset`/`total`) on `GET /api/v1/history`.
- Prometheus-format metrics at `/metrics` and structured JSON request logging with per-request IDs.
- Per-API-key (or per-IP) rate limiting on `/verify`, `/verify/batch`, and `/sign`.
- `Content-Security-Policy` (strict `script-src 'self'`), `X-Content-Type-Options`, `X-Frame-Options`, and `Referrer-Policy` on every response.
- Backend test suite expanded from 2 smoke tests to unit tests for every `core/` module plus route-level tests against the real FastAPI app (`tests/test_api.py`, via `TestClient`).
- Frontend test suite (vitest + jsdom) covering the escaping utilities and the security-sensitive `render/*.js` modules — including a regression test proving a `<script>`/`onerror` payload embedded in manifest content renders as inert text.
- Linting: `ruff` (backend) and `eslint` (frontend), both enforced in CI, deliberately configured to catch real bugs without fighting the codebase's aligned-assignment formatting style.
- GitHub repo hygiene: issue templates, a PR template, `CODEOWNERS`, and a weekly Dependabot schedule for pip/npm/GitHub Actions.
- `.dockerignore`, so `.env`, `venv/`, and `node_modules/` never enter the Docker build context.

### Changed
- Split `frontend/src/app.js` (was ~900 lines) into `render/*.js` (one module per result panel) and `utils/format.js`, leaving `app.js` as state/event-wiring/orchestration only.
- Converted the frontend's remaining inline `onclick=` handlers to `addEventListener`, which is what makes a strict CSP `script-src` possible.

### Fixed
- **Docker builds were completely broken**: the Dockerfile copied the frontend build output from the wrong path (`/app/frontend/dist`, which never existed — Vite's configured `outDir` actually places it at `/app/backend/static`).
- **The container couldn't start at all** once the above was fixed: `AUDIT_DB_PATH` defaulted to a path outside the one directory (`/app/data`) writable by the container's non-root user, so SQLite failed to open the database on startup. Also redirected the trust-list cache the same way, and pointed both at the volume-mounted directory so they persist across `docker compose up`/`down` instead of just being writable.
- `/sign` and `/trust-list/upload` had no upload size limit (unlike `/verify`, which was already capped at 200MB) — a real DoS gap, now closed.
- `.avif` files uploaded to `/sign` got the wrong MIME type (`signer.py`'s MIME map was missing `avif`, unlike `extractor.py`'s), likely producing malformed signed output.
- Running a batch verification after a single-file verification left the previous single-file panels (trust ring, KPI strip, evidence summary) visible underneath the new batch results, since `resetResults()` never hid them — they were only ever shown via `showResults()`, which the batch flow doesn't call.
- Removed a since-neutralized but dangerous filter in `core/extractor.py` that stripped `signingCredentialUntrusted` validation errors unconditionally on every verification (not just local dev round-trips). It never actually matched anything — the SDK's real error code has a dot (`signingCredential.untrusted`) — but left in place, "fixing" that typo later would have silently let untrusted signing credentials report as `VALID`.
- Fixed stored XSS: several places in the frontend interpolated manifest-derived or filename-derived data into `innerHTML` without escaping, most severely the raw-manifest JSON viewer, which renders the entire attacker-controlled manifest.
- Commits no longer carry an AI co-author trailer.

### Security
- See the Fixed section above (trust-filter bypass, stored XSS, Docker secret-leak risk, DoS-sized uploads) — all closed as part of this round of work.
