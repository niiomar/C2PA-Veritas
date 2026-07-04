const API_KEY = import.meta.env.VITE_API_KEY || '';

function authHeaders() {
  return API_KEY ? { 'X-API-KEY': API_KEY } : {};
}

export async function verifyFile(file, trustAnchorsPem = null) {
  const fd = new FormData();
  fd.append('file', file);
  if (trustAnchorsPem) fd.append('trust_anchors', trustAnchorsPem);

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

export async function signFile(file, opts = {}) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('action',          opts.action         || 'c2pa.created');
  fd.append('claim_generator', opts.claimGenerator || 'C2PA-Veritas/1.0');
  fd.append('no_ai_training',  opts.noAiTraining !== false ? 'true' : 'false');
  if (opts.softwareAgent) fd.append('software_agent', opts.softwareAgent);
  if (opts.digitalSource) fd.append('digital_source', opts.digitalSource);

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

export async function fetchHistory(limit = 50) {
  const res = await fetch(`/api/v1/history?limit=${limit}`, { headers: authHeaders() });
  if (!res.ok) return { entries: [] };
  return res.json();
}
