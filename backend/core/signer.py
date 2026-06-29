"""
C2PA Manifest Signer

Signs media files with a C2PA manifest using a provided (or auto-generated
self-signed) certificate and private key.

This is the "create" half of the provenance loop — lets a user
sign their own content so the full create→verify cycle can be demonstrated.

IMPORTANT: Self-signed certificates are for development/demo only.
For production, use a certificate issued by a trust anchor registered
with the C2PA Trust List (see https://c2pa.org/trust-list/).
"""

import io
import json
import logging
import os
import tempfile
from pathlib import Path

import c2pa

logger = logging.getLogger(__name__)


# Public signing function
def sign_media(
    file_bytes:    bytes,
    filename:      str,
    claim_generator: str      = "C2PA-Veritas/1.0",
    action:        str        = "c2pa.created",
    software_agent: str | None = None,
    digital_source: str       = "http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture",
    no_ai_training: bool      = True,
    cert_pem:      bytes | None = None,
    key_pem:       bytes | None = None,
    timestamp_url: str        = "http://timestamp.digicert.com",
) -> bytes:
    """
    Embed a C2PA manifest into a copy of the given media file.

    Args:
        file_bytes:      Raw bytes of the source file.
        filename:        Original filename (determines format/MIME type).
        claim_generator: Name of the tool creating the manifest.
        action:          C2PA action label (e.g. 'c2pa.created', 'c2pa.edited').
        software_agent:  Name of the software that performed the action.
        digital_source:  IPTC digital source type URL.
        no_ai_training:  If True, embed a "do not train" assertion.
        cert_pem:        PEM-encoded certificate chain bytes. Uses dev cert if None.
        key_pem:         PEM-encoded private key bytes. Uses dev key if None.
        timestamp_url:   RFC 3161 TSA URL for trusted timestamps.

    Returns:
        Signed file bytes with embedded C2PA manifest.
    """
    ext       = Path(filename).suffix.lower().lstrip(".")
    mime_type = _ext_to_mime(ext)

    # Load or generate dev credentials
    if cert_pem is None or key_pem is None:
        cert_pem, key_pem = _get_dev_credentials()

    
    # Build manifest definition
    assertions: list[dict] = [
        {
            "label": "c2pa.actions",
            "data": {
                "actions": [
                    {
                        "action": action,
                        "softwareAgent": {"name": software_agent or claim_generator},
                        "digitalSourceType": digital_source,
                    }
                ]
            }
        }
    ]

    if no_ai_training:
        assertions.append({
            "label": "c2pa.training-mining",
            "data": {
                "entries": {
                    "c2pa.ai_generative_training": {"use": "notAllowed"},
                    "c2pa.ai_inference":            {"use": "notAllowed"},
                    "c2pa.ai_training":             {"use": "notAllowed"},
                    "c2pa.data_mining":             {"use": "notAllowed"},
                }
            }
        })

    manifest_def = {
        "claim_generator": claim_generator,
        "title":           filename,
        "assertions":      assertions,
    }

    manifest_json = json.dumps(manifest_def)

    
    # Sign
    signer = c2pa.create_signer(
        sign_fn     = _make_sign_fn(key_pem),
        alg         = c2pa.SigningAlg.ES256,
        certs       = cert_pem,
        tsa_url     = timestamp_url,
    )

    source_stream = io.BytesIO(file_bytes)
    dest_stream   = io.BytesIO()

    builder = c2pa.Builder(manifest_json)
    builder.sign(signer, mime_type, source_stream, dest_stream)

    return dest_stream.getvalue()


# Dev certificate helpers
_DEV_CERT_PEM: bytes | None = None
_DEV_KEY_PEM:  bytes | None = None


def _get_dev_credentials() -> tuple[bytes, bytes]:
    """
    Generate a self-signed EC P-256 certificate + key for development use.
    Cached in module-level variables so generation only happens once per process.
    """
    global _DEV_CERT_PEM, _DEV_KEY_PEM

    if _DEV_CERT_PEM and _DEV_KEY_PEM:
        return _DEV_CERT_PEM, _DEV_KEY_PEM

    try:
        from cryptography import x509
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import ec
        from cryptography.x509.oid import NameOID
        import datetime

        key = ec.generate_private_key(ec.SECP256R1())

        subject = issuer = x509.Name([
            x509.NameAttribute(NameOID.COMMON_NAME, "C2PA-Veritas Dev Signer"),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, "C2PA-Veritas"),
        ])
        cert = (
            x509.CertificateBuilder()
            .subject_name(subject)
            .issuer_name(issuer)
            .public_key(key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(datetime.datetime.utcnow())
            .not_valid_after(datetime.datetime.utcnow() + datetime.timedelta(days=365))
            .add_extension(
                x509.BasicConstraints(ca=False, path_length=None), critical=True
            )
            .sign(key, hashes.SHA256())
        )

        _DEV_KEY_PEM = key.private_bytes(
            encoding   = serialization.Encoding.PEM,
            format     = serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm = serialization.NoEncryption(),
        )
        _DEV_CERT_PEM = cert.public_bytes(serialization.Encoding.PEM)

        logger.warning(
            "Using auto-generated self-signed certificate for C2PA signing. "
            "This certificate will NOT be trusted by public C2PA validators. "
            "For production, provide a certificate from a registered trust anchor."
        )
        return _DEV_CERT_PEM, _DEV_KEY_PEM

    except ImportError:
        raise RuntimeError(
            "The 'cryptography' package is required for dev certificate generation. "
            "Install it with: pip install cryptography"
        )


def _make_sign_fn(key_pem: bytes):
    """Return a signing function compatible with c2pa.create_signer."""
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec

    key = serialization.load_pem_private_key(key_pem, password=None)

    def sign(data: bytes) -> bytes:
        return key.sign(data, ec.ECDSA(hashes.SHA256()))

    return sign


def _ext_to_mime(ext: str) -> str:
    return {
        "jpg": "image/jpeg", "jpeg": "image/jpeg",
        "png": "image/png",  "webp": "image/webp",
        "mp4": "video/mp4",  "mov":  "video/quicktime",
        "pdf": "application/pdf",
    }.get(ext, "application/octet-stream")
