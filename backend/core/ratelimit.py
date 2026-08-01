"""
Minimal in-memory sliding-window rate limiter. Single-process only — counts
reset on restart and are not shared across multiple uvicorn worker
processes. Good enough for a single-instance deployment; swap for a
Redis-backed limiter before scaling horizontally.
"""
import os
import time
from collections import defaultdict, deque

RATE_LIMIT_MAX        = int(os.getenv("RATE_LIMIT_MAX", "30"))
RATE_LIMIT_WINDOW_SEC = int(os.getenv("RATE_LIMIT_WINDOW_SEC", "60"))

_hits: dict[str, deque] = defaultdict(deque)


def check(client_id: str) -> bool:
    """Record a hit for client_id and return False if it's over the limit for the current window."""
    now = time.time()
    q = _hits[client_id]
    while q and now - q[0] > RATE_LIMIT_WINDOW_SEC:
        q.popleft()
    if len(q) >= RATE_LIMIT_MAX:
        return False
    q.append(now)
    return True
