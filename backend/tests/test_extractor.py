"""
Smoke tests for the C2PA extractor.
Verifies the NO_MANIFEST path without requiring a real C2PA-signed file.
"""
from core.extractor import ProvenanceStatus, extract_provenance


def test_no_manifest_jpeg(blank_jpeg):
    report = extract_provenance(blank_jpeg, "test.jpg", "abc123")
    assert report.status == ProvenanceStatus.NO_MANIFEST
    assert report.manifests == []
    assert report.edit_timeline == []
    assert "No C2PA" in report.signal

def test_report_fields_populated(blank_jpeg):
    report = extract_provenance(blank_jpeg, "test.jpg", "abc123sha")
    assert report.filename == "test.jpg"
    assert report.file_sha256 == "abc123sha"
    assert report.media_type == "image/jpeg"
    assert isinstance(report.disclaimer, str) and len(report.disclaimer) > 10
