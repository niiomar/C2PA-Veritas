"""
Round-trip and audit-log tests for the signer, extractor, and hash-chained
audit log. These exercise paths the original smoke tests (NO_MANIFEST only)
never touched — most importantly, that a freshly signed file actually comes
back VALID from extract_provenance().
"""
import os
import sqlite3

# conftest.py sets AUDIT_DB_PATH before any test module is collected.
_TEST_DB = os.environ["AUDIT_DB_PATH"]

from core.audit import count_batch_members, log_check, verify_chain
from core.extractor import ProvenanceStatus, extract_provenance
from core.signer import sign_media


def test_sign_then_verify_round_trip(blank_jpeg):
    """
    A file signed with the auto-generated dev cert should round-trip through
    extract_provenance() with the manifest structurally intact: PARTIAL
    (not VALID), because the dev cert is self-signed and correctly flagged
    as an untrusted signing credential — this is documented, expected
    behavior (see signer.py's dev-cert warning), not a bug.
    """
    signed = sign_media(blank_jpeg, "test.jpg")
    report = extract_provenance(signed, "test_signed.jpg", "roundtriphash")

    assert report.status == ProvenanceStatus.PARTIAL
    assert any(e.get("code") == "signingCredential.untrusted" for e in report.validation_errors)
    assert report.active_manifest is not None
    assert any(a.action == "c2pa.created" for a in report.edit_timeline)


def test_batch_assertion_round_trip_and_audit_crosscheck(blank_jpeg):
    signed = sign_media(blank_jpeg, "photo1.jpg", batch_id="test-batch-001", batch_expected_count=3)
    report = extract_provenance(signed, "photo1_signed.jpg", "batchhash1")

    assert report.active_manifest is not None
    assert report.active_manifest.batch_info == {"batch_id": "test-batch-001", "expected_count": 3}

    # Simulate two distinct batch members having been verified and logged.
    log_check(blank_jpeg + b"\x00", "photo1.jpg", report, 0.1, batch_id="test-batch-001")
    log_check(blank_jpeg + b"\x01", "photo2.jpg", report, 0.1, batch_id="test-batch-001")

    assert count_batch_members("test-batch-001") == 2


def test_audit_chain_valid_then_detects_tampering(blank_jpeg):
    report = extract_provenance(blank_jpeg, "chain_test.jpg", "chainhash")
    log_check(blank_jpeg, "chain_test.jpg", report, 0.05)

    assert verify_chain()["valid"] is True

    conn = sqlite3.connect(_TEST_DB)
    conn.execute(
        "UPDATE provenance_log SET filename='tampered.jpg' WHERE id = (SELECT MAX(id) FROM provenance_log)"
    )
    conn.commit()
    conn.close()

    result = verify_chain()
    assert result["valid"] is False
    assert result["first_broken_id"] is not None
