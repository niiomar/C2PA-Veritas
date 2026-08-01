import { escapeHtml } from '../utils/escape.js';

// Renders the X.509 Certificate details panel.
export function renderCertPanel(d) {
  const m = d.active_manifest;
  if (!m || (!m.issuer && !m.cert_serial)) return;

  const panel = document.getElementById('cert-panel');
  const card  = document.getElementById('cert-card');

  // Flag known development certificates to warn analysts
  const isDev = m.issuer?.includes('Veritas') || m.issuer?.includes('Dev') || m.issuer?.includes('self');
  if (isDev) document.getElementById('warn-dev-cert').classList.add('visible');

  let fp = d.file_sha256 ? d.file_sha256.slice(0,16).toUpperCase() : 'N/A';

  card.innerHTML = `
    <div class="cert-grid">
      <div class="cg-item"><span class="cg-label">Issuer</span><span class="cg-val" style="color:var(--blue)">${escapeHtml(m.issuer || 'Unknown')}</span></div>
      <div class="cg-item"><span class="cg-label">Subject</span><span class="cg-val">${escapeHtml(m.issuer || 'Self-Signed')}</span></div>
      <div class="cg-item"><span class="cg-label">Algorithm</span><span class="cg-val">${escapeHtml(m.signing_algorithm || 'N/A')}</span></div>
      <div class="cg-item"><span class="cg-label">Fingerprint</span><span class="cg-val">${fp}...</span></div>
      <div class="cg-item" style="grid-column: span 2"><span class="cg-label">Serial Number</span><span class="cg-val" style="color:var(--text-dim)">${escapeHtml(m.cert_serial || 'N/A')}</span></div>
    </div>
  `;
  panel.classList.add('visible');
}
