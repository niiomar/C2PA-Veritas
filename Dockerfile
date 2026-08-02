# Stage 1: build the frontend
FROM node:20-slim AS frontend-build

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install

COPY frontend/ ./
ARG VITE_API_KEY
ENV VITE_API_KEY=${VITE_API_KEY}
RUN npm run build

# Stage 2: backend runtime
FROM python:3.11-slim AS runtime

WORKDIR /app

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
# vite.config.js sets build.outDir to ../backend/static (relative to the
# frontend project root), so the frontend-build stage's output actually
# lands at /app/backend/static there — not /app/frontend/dist.
COPY --from=frontend-build /app/backend/static ./static

RUN mkdir -p /app/data

# Default the SQLite audit log and trust-list cache into /app/data — the
# only directory chown'd to the non-root user below, and the one
# docker-compose.yml volume-mounts for persistence across restarts. Without
# this, both default to a relative path under /app (owned by root), which
# the app can't write to and crashes on startup trying to open the DB.
ENV AUDIT_DB_PATH=/app/data/audit_log.db
ENV TRUST_LIST_CACHE_PATH=/app/data/trust_list_cache.pem

# Non-root user
RUN groupadd --gid 1001 appgroup \
    && useradd --uid 1001 --gid appgroup --shell /bin/sh --no-create-home appuser \
    && chown -R appuser:appgroup /app/data
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
