"""
C2PA Manifest Extractor and Validator
======================================
Core logic for reading C2PA manifests from media files, validating
signature chains, extracting edit history timelines, and detecting
stripped/absent manifests.

Uses the official c2pa-python SDK (c2pa-python >= 0.5.0).
"""

import json
import logging
import os
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any

import c2pa

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------

class ProvenanceStatus(str, Enum):
    VALID            = "VALID"            # Manifest present, signature valid
    INVALID          = "INVALID"          # Manifest present but signature fails
    NO_MANIFEST      = "NO_MANIFEST"      # No C2PA data found — red flag in forensic context
    PARTIAL          = "PARTIAL"          # Some assertions valid, others failed
    REMOTE_MANIFEST  = "REMOTE_MANIFEST"  # Manifest hosted remotely (not embedded)


@dataclass
class ActionEntry:
    """A single action/edit in the manifest's action assertion history."""
    action:           str
    when:             str | None = None
    software_agent:   str | None = None
    digital_source:   str | None = None
    description:      str | None = None
    raw:              dict = field(default_factory=dict)


@dataclass
class ManifestSummary:
    """Parsed summary of a single manifest in the manifest store."""
    label:              str
    claim_generator:    str
    title:              str | None
    instance_id:        str | None
    is_active:          bool
    issuer:             str | None
    signing_algorithm:  str | None
    cert_serial:        str | None
    actions:            list[ActionEntry]
    ai_training_policy: dict | None
    ingredients:        list[str]


@dataclass
class ProvenanceReport:
    """Full provenance report returned for a given media file."""
    filename:             str
    file_sha256:          str
    media_type:           str
    status:               ProvenanceStatus
    validation_state:     str
    validation_errors:    list[dict]
    validation_successes: list[dict]
    manifests:            list[ManifestSummary]
    edit_timeline:        list[ActionEntry]   # flattened across all manifests, oldest first
    active_manifest:      ManifestSummary | None
    is_embedded:          bool
    remote_manifest_url:  str | None
    raw_manifest_json:    dict | None
    signal:               str                 # human-readable one-line verdict
    disclaimer:           str


DISCLAIMER = (
    "C2PA provenance data is only as trustworthy as the issuing certificate chain. "
    "A valid signature means the manifest is cryptographically intact, not that the "
    "content itself is authentic. Absence of a manifest is not proof of manipulation — "
    "many legitimate media files predate C2PA adoption."
)


# ---------------------------------------------------------------------------
# Main extraction function
# ---------------------------------------------------------------------------

def extract_provenance(
    file_bytes: bytes,
    filename:   str,
    file_sha256: str,
    trust_anchors_pem: str | None = None,
) -> ProvenanceReport:
    """
    Extract and validate C2PA provenance from a media file's bytes.

    Args:
        file_bytes:        Raw file content.
        filename:          Original filename (used for MIME type detection).
        file_sha256:       Pre-computed SHA-256 of the file (from audit log).
        trust_anchors_pem: Optional PEM string of trusted CA certificates.
                           If None, uses the c2pa-rs built-in trust list.

    Returns:
        A ProvenanceReport with all manifest data, validation results,
        and a flattened edit timeline.
    """
    import io
    import hashlib

    ext        = Path(filename).suffix.lower().lstrip(".")
    media_type = _ext_to_mime(ext)

    # ── Attempt manifest read ────────────────────────────────────────────
    try:
        settings_dict: dict[str, Any] = {}
        if trust_anchors_pem:
            settings_dict = {
                "verify": {"verify_cert_anchors": True},
                "trust": {"trust_anchors": trust_anchors_pem}
            }

        reader_kwargs = {}
        if settings_dict:
            settings = c2pa.Settings.from_dict(settings_dict)
            ctx      = c2pa.Context(settings)
            reader_kwargs["context"] = ctx

        stream = io.BytesIO(file_bytes)
        reader = c2pa.Reader(media_type, stream, **reader_kwargs)

        manifest_json_str = reader.json()
        manifest_store    = json.loads(manifest_json_str)
        is_embedded       = reader.is_embedded()
        remote_url        = reader.remote_url()

    except c2pa.C2paError as e:
        err_str = str(e)
        # ManifestNotFound is the expected case for media without C2PA data
        if "ManifestNotFound" in err_str or "no JUMBF" in err_str.lower():
            return _no_manifest_report(filename, file_sha256, media_type)
        logger.error(f"C2PA read error for {filename}: {err_str}")
        return _error_report(filename, file_sha256, media_type, err_str)

    except Exception as e:
        logger.exception(f"Unexpected error reading {filename}")
        return _error_report(filename, file_sha256, media_type, str(e))

    # ── Parse manifest store ─────────────────────────────────────────────
    active_label      = manifest_store.get("active_manifest")
    manifests_raw     = manifest_store.get("manifests", {})
    validation_results = manifest_store.get("validation_results", {})

    # Determine overall validation state
    validation_state = manifest_store.get("validation_state", "Unknown")
    val_active       = validation_results.get("activeManifest", {})
    errors           = val_active.get("failure", [])
    successes        = val_active.get("success", [])

    # Parse individual manifests
    parsed_manifests: list[ManifestSummary] = []
    for label, mdata in manifests_raw.items():
        parsed_manifests.append(_parse_manifest(label, mdata, is_active=(label == active_label)))

    active_manifest = next((m for m in parsed_manifests if m.is_active), None)

    # Build flattened timeline (oldest ingredient manifest first)
    edit_timeline = _build_timeline(parsed_manifests, manifests_raw)

    # Determine status
    if validation_state.lower() == "valid" and not errors:
        status = ProvenanceStatus.VALID
    elif errors and successes:
        status = ProvenanceStatus.PARTIAL
    elif errors:
        status = ProvenanceStatus.INVALID
    elif remote_url:
        status = ProvenanceStatus.REMOTE_MANIFEST
    else:
        status = ProvenanceStatus.VALID

    signal = _build_signal(status, active_manifest, edit_timeline, errors)

    return ProvenanceReport(
        filename             = filename,
        file_sha256          = file_sha256,
        media_type           = media_type,
        status               = status,
        validation_state     = validation_state,
        validation_errors    = errors,
        validation_successes = successes,
        manifests            = parsed_manifests,
        edit_timeline        = edit_timeline,
        active_manifest      = active_manifest,
        is_embedded          = is_embedded,
        remote_manifest_url  = remote_url,
        raw_manifest_json    = manifest_store,
        signal               = signal,
        disclaimer           = DISCLAIMER,
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_manifest(label: str, mdata: dict, is_active: bool) -> ManifestSummary:
    sig     = mdata.get("signature_info", {})
    gen     = mdata.get("claim_generator_info", [{}])
    gen_str = gen[0].get("name", "") if gen else mdata.get("claim_generator", "Unknown")

    actions: list[ActionEntry] = []
    ai_policy = None

    for assertion in mdata.get("assertions", []):
        alab  = assertion.get("label", "")
        adata = assertion.get("data", {})

        if "c2pa.actions" in alab:
            for act in adata.get("actions", []):
                agent = act.get("softwareAgent")
                if isinstance(agent, dict):
                    agent = agent.get("name")
                actions.append(ActionEntry(
                    action         = act.get("action", "Unknown"),
                    when           = act.get("when"),
                    software_agent = agent,
                    digital_source = act.get("digitalSourceType"),
                    description    = act.get("description"),
                    raw            = act,
                ))

        if "training-mining" in alab or "ai_generative_training" in alab:
            ai_policy = adata.get("entries", adata)

    ingredients = [
        ing.get("title", ing.get("instance_id", "Unknown"))
        for ing in mdata.get("ingredients", [])
    ]

    return ManifestSummary(
        label             = label,
        claim_generator   = gen_str,
        title             = mdata.get("title"),
        instance_id       = mdata.get("instance_id"),
        is_active         = is_active,
        issuer            = sig.get("issuer"),
        signing_algorithm = sig.get("alg"),
        cert_serial       = sig.get("cert_serial_number"),
        actions           = actions,
        ai_training_policy= ai_policy,
        ingredients       = ingredients,
    )


def _build_timeline(
    parsed: list[ManifestSummary],
    raw:    dict,
) -> list[ActionEntry]:
    """
    Flatten all action assertions across all manifests into a chronological
    edit history timeline.

    Ordering: ingredient manifests (older) appear before the active manifest.
    """
    # Build a rough ordering: manifests that appear as ingredients first
    ingredient_labels: set[str] = set()
    for mdata in raw.values():
        for ing in mdata.get("ingredients", []):
            ref = ing.get("active_manifest") or ing.get("manifest_label")
            if ref:
                ingredient_labels.add(ref)

    ordered = (
        [m for m in parsed if m.label in ingredient_labels] +
        [m for m in parsed if m.label not in ingredient_labels]
    )

    timeline: list[ActionEntry] = []
    seen: set[str] = set()
    for manifest in ordered:
        for action in manifest.actions:
            key = f"{action.action}|{action.when}|{action.software_agent}"
            if key not in seen:
                timeline.append(action)
                seen.add(key)

    return timeline


def _build_signal(
    status:   ProvenanceStatus,
    active:   ManifestSummary | None,
    timeline: list[ActionEntry],
    errors:   list[dict],
) -> str:
    if status == ProvenanceStatus.NO_MANIFEST:
        return ("No C2PA provenance data found. This file has no embedded Content Credentials. "
                "This is expected for media created before C2PA adoption but is a red flag "
                "for content purporting to come from a C2PA-enabled source.")

    if status == ProvenanceStatus.INVALID:
        codes = ", ".join(e.get("code", "unknown") for e in errors[:3])
        return f"Manifest present but signature validation FAILED ({codes}). Content may have been modified after signing."

    if status == ProvenanceStatus.PARTIAL:
        return "Manifest partially valid — some assertions verified, others failed. Review validation errors."

    if status == ProvenanceStatus.REMOTE_MANIFEST:
        return "Manifest is hosted remotely. Authenticity depends on the availability and integrity of the remote URL."

    if active:
        issuer     = active.issuer or "Unknown issuer"
        edit_count = len(timeline)
        actions    = set(a.action for a in timeline)
        ai_flag    = " AI-generated content detected." if any("c2pa.created" in a and "Trained" in str(a) for a in timeline) else ""
        return (f"Valid C2PA signature from {issuer}. "
                f"{edit_count} action(s) in edit history: {', '.join(sorted(actions))}.{ai_flag}")

    return "Valid C2PA manifest with no detailed action assertions."


def _no_manifest_report(filename: str, sha256: str, media_type: str) -> ProvenanceReport:
    return ProvenanceReport(
        filename             = filename,
        file_sha256          = sha256,
        media_type           = media_type,
        status               = ProvenanceStatus.NO_MANIFEST,
        validation_state     = "NoManifest",
        validation_errors    = [],
        validation_successes = [],
        manifests            = [],
        edit_timeline        = [],
        active_manifest      = None,
        is_embedded          = False,
        remote_manifest_url  = None,
        raw_manifest_json    = None,
        signal               = _build_signal(ProvenanceStatus.NO_MANIFEST, None, [], []),
        disclaimer           = DISCLAIMER,
    )


def _error_report(filename: str, sha256: str, media_type: str, error: str) -> ProvenanceReport:
    return ProvenanceReport(
        filename             = filename,
        file_sha256          = sha256,
        media_type           = media_type,
        status               = ProvenanceStatus.INVALID,
        validation_state     = "Error",
        validation_errors    = [{"code": "internal_error", "explanation": error}],
        validation_successes = [],
        manifests            = [],
        edit_timeline        = [],
        active_manifest      = None,
        is_embedded          = False,
        remote_manifest_url  = None,
        raw_manifest_json    = None,
        signal               = f"Error reading manifest: {error}",
        disclaimer           = DISCLAIMER,
    )


def _ext_to_mime(ext: str) -> str:
    return {
        "jpg":  "image/jpeg",
        "jpeg": "image/jpeg",
        "png":  "image/png",
        "webp": "image/webp",
        "avif": "image/avif",
        "heic": "image/heic",
        "mp4":  "video/mp4",
        "mov":  "video/quicktime",
        "avi":  "video/avi",
        "mkv":  "video/x-matroska",
        "mp3":  "audio/mpeg",
        "wav":  "audio/wav",
        "pdf":  "application/pdf",
    }.get(ext, "application/octet-stream")
