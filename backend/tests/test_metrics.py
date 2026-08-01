"""Tests for core.metrics — the in-memory counters exposed at /metrics."""
from core import metrics


def test_incr_creates_and_increments():
    before = metrics._counters.get("test_counter_incr", 0)
    metrics.incr("test_counter_incr")
    metrics.incr("test_counter_incr", amount=2)
    assert metrics._counters["test_counter_incr"] == before + 3


def test_record_verify_status_bumps_total_and_specific_counter():
    total_before   = metrics._counters["veritas_verify_total"]
    valid_before   = metrics._counters["veritas_verify_valid"]
    invalid_before = metrics._counters["veritas_verify_invalid"]

    metrics.record_verify_status("VALID")

    assert metrics._counters["veritas_verify_total"] == total_before + 1
    assert metrics._counters["veritas_verify_valid"] == valid_before + 1
    assert metrics._counters["veritas_verify_invalid"] == invalid_before  # unchanged


def test_record_verify_status_ignores_unknown_status():
    total_before = metrics._counters["veritas_verify_total"]
    # REMOTE_MANIFEST has no dedicated counter — should still bump the total
    # without raising or creating a bogus new key.
    metrics.record_verify_status("REMOTE_MANIFEST")
    assert metrics._counters["veritas_verify_total"] == total_before + 1
    assert "veritas_verify_remote_manifest" not in metrics._counters


def test_render_prometheus_format():
    metrics.incr("veritas_sign_total")
    output = metrics.render_prometheus()

    assert "# HELP veritas_sign_total" in output
    assert "# TYPE veritas_sign_total counter" in output
    assert any(
        line.startswith("veritas_sign_total ") for line in output.splitlines()
    )
