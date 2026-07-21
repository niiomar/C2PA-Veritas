"""
C2PA Manifest Signer

Signs media files with a C2PA manifest using a provided (or auto-generated
self-signed) certificate and private key.
"""
import io
import json
import logging
import datetime
from pathlib import Path
import c2pa
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import NameOID

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
    timestamp_url: str | None = None,
) -> bytes:
    """Embed a C2PA manifest into a copy of the given media file."""
    ext       = Path(filename).suffix.lower().lstrip(".")
    mime_type = _ext_to_mime(ext)

    # Load or generate dev credentials
    if cert_pem is None or key_pem is None:
        cert_pem, key_pem = _get_dev_credentials()

    # Build manifest definition
    assertions = [
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
    source_stream = io.BytesIO(file_bytes)
    dest_stream   = io.BytesIO()

    # fallback for c2pa-python versions
    if hasattr(c2pa, "Signer"):
        alg = getattr(c2pa, "C2paSigningAlg", getattr(c2pa, "SigningAlg", None))
        with c2pa.Signer.from_callback(
            callback=_make_sign_fn(key_pem),
            alg=alg.ES256,
            certs=cert_pem,
            tsa_url=timestamp_url,
        ) as signer:
            builder = c2pa.Builder(manifest_json)
            builder.sign(signer, mime_type, source_stream, dest_stream)
    else:
        signer = c2pa.create_signer(
            sign_fn=_make_sign_fn(key_pem),
            alg=c2pa.SigningAlg.ES256,
            certs=cert_pem,
            tsa_url=timestamp_url,
        )
        builder = c2pa.Builder(manifest_json)
        builder.sign(signer, mime_type, source_stream, dest_stream)

    return dest_stream.getvalue()

# Dev certificate helpers
_DEV_CERT_PEM: bytes | None = None
_DEV_KEY_PEM:  bytes | None = None

def _get_dev_credentials() -> tuple[bytes, bytes]:
    """Generate a C2PA-compliant 2-tier certificate chain in memory."""
    global _DEV_CERT_PEM, _DEV_KEY_PEM

    if _DEV_CERT_PEM and _DEV_KEY_PEM:
        return _DEV_CERT_PEM, _DEV_KEY_PEM

    now = datetime.datetime.utcnow()
    
    # 1. Root CA 
    root_key = ec.generate_private_key(ec.SECP256R1())
    root_name = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, "C2PA-Veritas Dev Root CA"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "C2PA-Veritas"),
    ])
    
    root_ski = x509.SubjectKeyIdentifier.from_public_key(root_key.public_key())
    
    root_cert = (
        x509.CertificateBuilder()
        .subject_name(root_name)
        .issuer_name(root_name)
        .public_key(root_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(days=1))
        .not_valid_after(now + datetime.timedelta(days=365))
        .add_extension(x509.BasicConstraints(ca=True, path_length=1), critical=True)
        .add_extension(
            x509.KeyUsage(
                digital_signature=True, content_commitment=False, key_encipherment=False,
                data_encipherment=False, key_agreement=False, key_cert_sign=True,
                crl_sign=True, encipher_only=False, decipher_only=False
            ), critical=True
        )
        .add_extension(root_ski, critical=False)
        .sign(root_key, hashes.SHA256())
    )

    # 2. Leaf Signer
    leaf_key = ec.generate_private_key(ec.SECP256R1())
    leaf_name = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, "C2PA-Veritas Dev Signer"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "C2PA-Veritas"),
    ])
    
    leaf_ski = x509.SubjectKeyIdentifier.from_public_key(leaf_key.public_key())
    
    # Pass the root_ski object directly instead of .digest
    leaf_aki = x509.AuthorityKeyIdentifier.from_issuer_subject_key_identifier(root_ski)
    
    leaf_cert = (
        x509.CertificateBuilder()
        .subject_name(leaf_name)
        .issuer_name(root_name)
        .public_key(leaf_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(days=1))
        .not_valid_after(now + datetime.timedelta(days=365))
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .add_extension(
            x509.KeyUsage(
                digital_signature=True, content_commitment=False, key_encipherment=False,
                data_encipherment=False, key_agreement=False, key_cert_sign=False,
                crl_sign=False, encipher_only=False, decipher_only=False
            ), critical=True
        )
        .add_extension(
            x509.ExtendedKeyUsage([
                x509.oid.ExtendedKeyUsageOID.EMAIL_PROTECTION,
                x509.ObjectIdentifier("1.3.6.1.5.5.7.3.36") # C2PA EKU OID
            ]), critical=False
        )
        .add_extension(leaf_ski, critical=False)
        .add_extension(leaf_aki, critical=False)
        .sign(root_key, hashes.SHA256())
    )

    _DEV_CERT_PEM = (
        leaf_cert.public_bytes(serialization.Encoding.PEM) +
        root_cert.public_bytes(serialization.Encoding.PEM)
    )
    _DEV_KEY_PEM = leaf_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption(),
    )

    logger.warning("Using auto-generated 2-tier certificate chain for C2PA testing.")
    return _DEV_CERT_PEM, _DEV_KEY_PEM

def _make_sign_fn(key_pem: bytes):
    from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
    
    key = serialization.load_pem_private_key(key_pem, password=None)
    
    def sign(data: bytes) -> bytes:
        # 1. Create standard ASN.1 DER signature
        der_sig = key.sign(data, ec.ECDSA(hashes.SHA256()))
        
        # 2. Extract R and S from the DER formatting
        r, s = decode_dss_signature(der_sig)
        
        # 3. Concatenate R and S into strict 64-byte IEEE P1363 format required by C2PA
        return r.to_bytes(32, 'big') + s.to_bytes(32, 'big')
        
    return sign

def _ext_to_mime(ext: str) -> str:
    return {
        "jpg": "image/jpeg", "jpeg": "image/jpeg",
        "png": "image/png",  "webp": "image/webp",
        "mp4": "video/mp4",  "mov":  "video/quicktime",
        "pdf": "application/pdf",
    }.get(ext, "application/octet-stream")
