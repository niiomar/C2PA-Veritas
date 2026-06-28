"""
C2PA-Veritas CLI demo
Usage:
    python scripts/demo_verify.py path/to/image.jpg
    python scripts/demo_verify.py path/to/image.jpg --json
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from core.extractor import ProvenanceStatus, extract_provenance


STATUS_ICONS = {
    ProvenanceStatus.VALID:           "✅",
    ProvenanceStatus.INVALID:         "❌",
    ProvenanceStatus.NO_MANIFEST:     "⚠️ ",
    ProvenanceStatus.PARTIAL:         "⚡",
    ProvenanceStatus.REMOTE_MANIFEST: "🔗",
}


def verify_file(path: str, output_json: bool = False):
    data = Path(path).read_bytes()
    sha  = hashlib.sha256(data).hexdigest()
    report = extract_provenance(data, Path(path).name, sha)

    if output_json:
        import dataclasses
        d = dataclasses.asdict(report)
        d["status"] = report.status.value
        print(json.dumps(d, indent=2))
        return

    icon = STATUS_ICONS.get(report.status, "?")
    print(f"\n{'='*60}")
    print(f"  C2PA-Veritas Provenance Report")
    print(f"{'='*60}")
    print(f"  File:        {report.filename}")
    print(f"  SHA-256:     {report.file_sha256[:16]}...")
    print(f"  Status:      {icon}  {report.status.value}")
    print(f"  Validation:  {report.validation_state}")
    print(f"  Embedded:    {report.is_embedded}")
    if report.remote_manifest_url:
        print(f"  Remote URL:  {report.remote_manifest_url}")
    print(f"\n  Signal:\n  {report.signal}")

    if report.active_manifest:
        m = report.active_manifest
        print(f"\n  Active Manifest:")
        print(f"    Generator: {m.claim_generator}")
        print(f"    Issuer:    {m.issuer or 'N/A'}")
        print(f"    Algorithm: {m.signing_algorithm or 'N/A'}")
        if m.ai_training_policy:
            print(f"    AI Policy: {json.dumps(m.ai_training_policy, indent=6)}")

    if report.edit_timeline:
        print(f"\n  Edit Timeline ({len(report.edit_timeline)} action(s)):")
        for i, action in enumerate(report.edit_timeline, 1):
            ts    = f" @ {action.when}" if action.when else ""
            agent = f" by {action.software_agent}" if action.software_agent else ""
            print(f"    {i}. {action.action}{agent}{ts}")

    if report.validation_errors:
        print(f"\n  Validation Errors:")
        for e in report.validation_errors:
            print(f"    [{e.get('code', '?')}] {e.get('explanation', '')}")

    print(f"\n  Disclaimer:\n  {report.disclaimer}")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Verify C2PA provenance of a media file")
    parser.add_argument("file", help="Path to media file")
    parser.add_argument("--json", action="store_true", help="Output raw JSON")
    args = parser.parse_args()
    verify_file(args.file, output_json=args.json)
