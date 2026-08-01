// Thin fetch wrappers around the backend's /api/v1 endpoints. VITE_API_KEY is
// baked into the JS bundle at build time — not a secret, just a shared token
// the backend can turn on optionally (see README's Security notes).
const API_KEY = import.meta.env.VITE_API_KEY || '';

function authHeaders() {
  return API_KEY ? { 'X-API-KEY': API_KEY } : {};
}

// Verify a single file's C2PA provenance.
export async function verifyFile(file, trustAnchorsPem = null, useTrustList = false) {
  const fd = new FormData();
  fd.append('file', file);
  if (trustAnchorsPem) fd.append('trust_anchors', trustAnchorsPem);
  if (useTrustList) fd.append('use_trust_list', 'true');

  const res = await fetch('/api/v1/verify', {
    method: 'POST', body: fd, headers: authHeaders(),
  });

  if (res.status === 401) throw new Error('Unauthorized — check API key configuration.');
  if (res.status === 429) return { _rateLimited: true };
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.detail || 'Verification failed.');
  }
  return res.json();
}

// Sign a file with the backend's dev certificate; returns the signed file as a blob.
export async function signFile(file, opts = {}) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('action',          opts.action         || 'c2pa.created');
  fd.append('claim_generator', opts.claimGenerator || 'C2PA-Veritas/1.0');
  fd.append('no_ai_training',  opts.noAiTraining !== false ? 'true' : 'false');
  if (opts.softwareAgent) fd.append('software_agent', opts.softwareAgent);
  if (opts.digitalSource) fd.append('digital_source', opts.digitalSource);
  if (opts.batchId) fd.append('batch_id', opts.batchId);
  if (opts.batchExpectedCount) fd.append('batch_expected_count', opts.batchExpectedCount);

  const res = await fetch('/api/v1/sign', {
    method: 'POST', body: fd, headers: authHeaders(),
  });

  if (res.status === 401) throw new Error('Unauthorized.');
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.detail || 'Signing failed.');
  }

  // Return blob + suggested filename from Content-Disposition
  const blob = await res.blob();
  const cd   = res.headers.get('Content-Disposition') || '';
  const match = cd.match(/filename="([^"]+)"/);
  return { blob, filename: match ? match[1] : 'signed_file' };
}

// One page of the persisted audit log.
export async function fetchHistory(limit = 50, offset = 0) {
  const res = await fetch(`/api/v1/history?limit=${limit}&offset=${offset}`, { headers: authHeaders() });
  if (!res.ok) return { entries: [], total: 0, limit, offset };
  return res.json();
}

// Verify up to 25 files in one request; returns one report per file.
export async function verifyBatch(files, useTrustList = false) {
  const fd = new FormData();
  for (const f of files) fd.append('files', f);
  if (useTrustList) fd.append('use_trust_list', 'true');

  const res = await fetch('/api/v1/verify/batch', {
    method: 'POST', body: fd, headers: authHeaders(),
  });

  if (res.status === 401) throw new Error('Unauthorized — check API key configuration.');
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.detail || 'Batch verification failed.');
  }
  return res.json();
}

// Download the full audit log as a CSV blob.
export async function exportHistoryCsv() {
  const res = await fetch('/api/v1/history/export.csv', { headers: authHeaders() });
  if (!res.ok) throw new Error('Export failed.');
  return res.blob();
}

// Cached trust-anchor bundle metadata: source, fetch time, anchor count, staleness.
export async function fetchTrustListStatus() {
  const res = await fetch('/api/v1/trust-list', { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to fetch trust list status.');
  return res.json();
}

// Cache a manually-uploaded PEM trust anchor bundle.
export async function uploadTrustList(file) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('/api/v1/trust-list/upload', {
    method: 'POST', body: fd, headers: authHeaders(),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.detail || 'Trust list upload failed.');
  }
  return res.json();
}

// Re-fetch the trust anchor bundle from the operator-configured TRUST_LIST_URL.
export async function refreshTrustList() {
  const res = await fetch('/api/v1/trust-list/refresh', {
    method: 'POST', headers: authHeaders(),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.detail || 'Trust list refresh failed.');
  }
  return res.json();
}
