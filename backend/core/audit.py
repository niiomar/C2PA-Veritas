"""
Forensic audit log for C2PA-Veritas.
Every provenance check is recorded with file hash, verdict, and manifest status.
"""
import hashlib
import os
import sqlite3
import time
from contextlib import contextmanager

AUDIT_DB_PATH = os.getenv("AUDIT_DB_PATH", "audit_log.db")

def _init_db():
    with _connect() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS provenance_log (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp       REAL    NOT NULL,
                file_sha256     TEXT    NOT NULL,
                filename        TEXT    NOT NULL,
                media_type      TEXT    NOT NULL,
                status          TEXT    NOT NULL,
                validation_state TEXT   NOT NULL,
                issuer          TEXT,
                manifest_count  INTEGER NOT NULL DEFAULT 0,
                action_count    INTEGER NOT NULL DEFAULT 0,
                processing_sec  REAL    NOT NULL
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_sha256 ON provenance_log(file_sha256)")
        conn.commit()

@contextmanager
def _connect():
    conn = sqlite3.connect(AUDIT_DB_PATH)
    try:
        yield conn
    finally:
        conn.close()

_init_db()

def sha256_of_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def log_check(file_bytes: bytes, filename: str, report, processing_sec: float):
    try:
        sha = sha256_of_bytes(file_bytes)
        issuer = report.active_manifest.issuer if report.active_manifest else None
        with _connect() as conn:
            conn.execute(
                """INSERT INTO provenance_log
                   (timestamp, file_sha256, filename, media_type, status,
                    validation_state, issuer, manifest_count, action_count, processing_sec)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (
                    time.time(), sha, filename, report.media_type,
                    report.status.value, report.validation_state,
                    issuer, len(report.manifests),
                    len(report.edit_timeline), processing_sec,
                )
            )
            conn.commit()
        return sha
    except Exception as e:
        print(f"[Audit] Failed to log: {e}")
        return None

def get_recent(limit: int = 50) -> list[dict]:
    with _connect() as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT * FROM provenance_log ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(r) for r in rows]

def get_by_hash(file_hash: str) -> list[dict]:
    with _connect() as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT * FROM provenance_log WHERE file_sha256=? ORDER BY id DESC", (file_hash,)
        ).fetchall()
        return [dict(r) for r in rows]
