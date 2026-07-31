"""
In-memory request counters exposed at /metrics in Prometheus text-exposition
format. Single-process, in-memory only — counts reset on restart and are not
shared across multiple uvicorn worker processes if ever scaled that way.
"""

_counters = {
    "veritas_verify_total":        0,
    "veritas_verify_valid":        0,
    "veritas_verify_invalid":      0,
    "veritas_verify_partial":      0,
    "veritas_verify_no_manifest":  0,
    "veritas_sign_total":          0,
    "veritas_errors_total":        0,
}

_HELP = {
    "veritas_verify_total":       "Total number of /verify (including batch) calls.",
    "veritas_verify_valid":       "Verifications that resulted in VALID.",
    "veritas_verify_invalid":     "Verifications that resulted in INVALID.",
    "veritas_verify_partial":     "Verifications that resulted in PARTIAL.",
    "veritas_verify_no_manifest": "Verifications that resulted in NO_MANIFEST.",
    "veritas_sign_total":         "Total number of /sign calls.",
    "veritas_errors_total":       "Total number of request handler errors.",
}


def incr(name: str, amount: int = 1) -> None:
    _counters[name] = _counters.get(name, 0) + amount


def record_verify_status(status_value: str) -> None:
    incr("veritas_verify_total")
    key = f"veritas_verify_{status_value.lower()}"
    if key in _counters:
        incr(key)


def render_prometheus() -> str:
    lines = []
    for name, value in _counters.items():
        lines.append(f"# HELP {name} {_HELP.get(name, '')}")
        lines.append(f"# TYPE {name} counter")
        lines.append(f"{name} {value}")
    return "\n".join(lines) + "\n"
