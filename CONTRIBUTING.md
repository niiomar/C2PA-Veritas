# Contributing to C2PA-Veritas

Bug reports, issues, and pull requests are welcome.

## Setup

See [Quick Start](README.md#quick-start). Before submitting a PR, run:

```bash
cd backend && pip install -r requirements-dev.txt && pytest tests/ -v
cd frontend && npm run test && npm run build
```

CI must pass before review. For changes to `core/extractor.py` the manifest
parsing and validation logic, please describe what C2PA behaviour you are
fixing or adding and reference the relevant spec section if applicable.

## Security

Do not open public issues for security vulnerabilities. See [SECURITY.md](SECURITY.md)
