"""
Forensic audit log for C2PA-Veritas.
Every provenance check is recorded with file hash, verdict, and manifest status.

The log is hash-chained (each row embeds a hash of the previous row) so that
post-hoc edits or deletions of past rows can be detected with verify_chain().
This is best-effort tamper *evidence* appropriate for a single SQLite file on
one host — it is not a distributed-ledger-grade guarantee.
"""
import hashlib
import logging
import os
import sqlite3
import time
from contextlib import contextmanager

logger = logging.getLogger(__name__)

AUDIT_DB_PATH = os.getenv("AUDIT_DB_PATH", "audit_log.db")

GENESIS_HASH = "0" * 64

_COLUMNS = [
    ("timestamp", "REAL NOT NULL"),
    ("file_sha256", "TEXT NOT NULL"),
    ("filename", "TEXT NOT NULL"),
    ("media_type", "TEXT NOT NULL"),
    ("status", "TEXT NOT NULL"),
    ("validation_state", "TEXT NOT NULL"),
    ("issuer", "TEXT"),
    ("manifest_count", "INTEGER NOT NULL DEFAULT 0"),
    ("action_count", "INTEGER NOT NULL DEFAULT 0"),
    ("processing_sec", "REAL NOT NULL"),
    ("batch_id", "TEXT"),
    ("prev_hash", "TEXT"),
    ("row_hash", "TEXT"),
]

def _init_db():
    """Create the table if missing, then add any new columns (safe to run against an existing DB)."""
    with _connect() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS provenance_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT
            )
        """)
        existing = {row[1] for row in conn.execute("PRAGMA table_info(provenance_log)")}
        for name, ddl in _COLUMNS:
            if name not in existing:
                conn.execute(f"ALTER TABLE provenance_log ADD COLUMN {name} {ddl}")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_sha256 ON provenance_log(file_sha256)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_batch ON provenance_log(batch_id)")
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

def _row_hash(prev_hash: str, fields: tuple) -> str:
    """sha256(prev_hash + '|' + joined field values) — the per-row link in the chain."""
    payload = prev_hash + "|" + "|".join("" if f is None else str(f) for f in fields)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()

def log_check(file_bytes: bytes, filename: str, report, processing_sec: float, batch_id: str | None = None) -> str | None:
    """Record one provenance check, chaining it to the previous row's hash. Returns the file's SHA-256, or None on failure."""
    try:
        sha = sha256_of_bytes(file_bytes)
        issuer = report.active_manifest.issuer if report.active_manifest else None

        with _connect() as conn:
            last = conn.execute(
                "SELECT row_hash FROM provenance_log ORDER BY id DESC LIMIT 1"
            ).fetchone()
            prev_hash = last[0] if last and last[0] else GENESIS_HASH

            fields = (
                time.time(), sha, filename, report.media_type,
                report.status.value, report.validation_state,
                issuer, len(report.manifests), len(report.edit_timeline),
                processing_sec, batch_id,
            )
            row_hash = _row_hash(prev_hash, fields)

            conn.execute(
                """INSERT INTO provenance_log
                   (timestamp, file_sha256, filename, media_type, status,
                    validation_state, issuer, manifest_count, action_count,
                    processing_sec, batch_id, prev_hash, row_hash)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                fields + (prev_hash, row_hash),
            )
            conn.commit()
        return sha
    except Exception:
        # the request it's trying to record. Routed through the module
        # logger (not print()) so it still reaches main.py's JSON log output.
        logger.exception("Failed to write audit log entry")
        return None

def get_recent(limit: int = 50, offset: int = 0) -> list[dict]:
    """A page of audit log rows, most recent first."""
    with _connect() as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT * FROM provenance_log ORDER BY id DESC LIMIT ? OFFSET ?", (limit, offset)
        ).fetchall()
        return [dict(r) for r in rows]

def count_all() -> int:
    """Total row count, used to drive /history pagination."""
    with _connect() as conn:
        return conn.execute("SELECT COUNT(*) FROM provenance_log").fetchone()[0]

def get_by_hash(file_hash: str) -> list[dict]:
    """Every past check recorded for a given file's SHA-256."""
    with _connect() as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT * FROM provenance_log WHERE file_sha256=? ORDER BY id DESC", (file_hash,)
        ).fetchall()
        return [dict(r) for r in rows]

def count_batch_members(batch_id: str) -> int:
    """How many distinct files tagged with this Veritas batch_id have been verified so far."""
    with _connect() as conn:
        return conn.execute(
            "SELECT COUNT(DISTINCT file_sha256) FROM provenance_log WHERE batch_id=?", (batch_id,)
        ).fetchone()[0]

def iter_all_rows():
    """Every row, oldest first — used for CSV export and hash-chain verification."""
    with _connect() as conn:
        conn.row_factory = sqlite3.Row
        return [dict(r) for r in conn.execute("SELECT * FROM provenance_log ORDER BY id ASC")]

def verify_chain() -> dict:
    """
    Recompute the hash chain over the full log and compare against stored
    row_hash values. Detects any row that was altered or deleted after
    the fact (deletion breaks the chain at the following row's prev_hash).
    """
    rows = iter_all_rows()
    expected_prev = GENESIS_HASH
    for row in rows:
        fields = (
            row["timestamp"], row["file_sha256"], row["filename"], row["media_type"],
            row["status"], row["validation_state"], row["issuer"],
            row["manifest_count"], row["action_count"], row["processing_sec"],
            row["batch_id"],
        )
        if row["prev_hash"] != expected_prev:
            return {"valid": False, "rows_checked": len(rows), "first_broken_id": row["id"]}
        expected = _row_hash(expected_prev, fields)
        if row["row_hash"] != expected:
            return {"valid": False, "rows_checked": len(rows), "first_broken_id": row["id"]}
        expected_prev = row["row_hash"]
    return {"valid": True, "rows_checked": len(rows), "first_broken_id": None}
