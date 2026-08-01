// Renders the main Trust Ring and Evidence Summary panel.
export function renderVerdict(d) {
  const titleEl = document.getElementById('trust-title');
  const subEl   = document.getElementById('trust-sub');
  const iconEl  = document.getElementById('status-icon');
  const fillEl  = document.getElementById('gauge-fill');

  const ICONS = {
    VALID: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
    INVALID: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
    PARTIAL: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`,
    NO_MANIFEST: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
    REMOTE_MANIFEST: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`
  };

  const META = {
    VALID: { sub: "Cryptographic signature verified and intact." },
    INVALID: { sub: "Manifest present but validation failed." },
    PARTIAL: { sub: "Manifest contains validation errors." },
    NO_MANIFEST: { sub: "Asset contains no digital provenance data." },
    REMOTE_MANIFEST: { sub: "Credentials hosted remotely." }
  };

  // Calculate dynamic fill for the SVG trust ring based on status
  let fillPercent = 0;
  if (d.status === 'VALID' || d.status === 'REMOTE_MANIFEST') fillPercent = 100;
  else if (d.status === 'PARTIAL') fillPercent = 50;
  else if (d.status === 'INVALID') fillPercent = 100; // Complete red ring
  else fillPercent = 5;

  titleEl.textContent = d.status === 'VALID' ? 'FULLY VERIFIED' : d.status.replace('_', ' ');
  titleEl.className = `trust-title title-${d.status}`;
  subEl.textContent = META[d.status].sub;

  iconEl.className = `score-icon ${d.status}`;
  iconEl.innerHTML = ICONS[d.status] || ICONS.NO_MANIFEST;

  fillEl.className.baseVal = `gauge-fill ${d.status}`;
  setTimeout(() => {
    fillEl.style.strokeDashoffset = 295.3 - (295.3 * (fillPercent / 100));
  }, 100);

  // Extract total assertions from the raw manifest to populate the KPI strip
  const mCount = d.manifests?.length || 0;
  let aCount = 0;
  if(d.raw_manifest_json && d.raw_manifest_json.manifests) {
      aCount = Object.keys(d.raw_manifest_json.manifests).reduce((acc, k) => acc + (d.raw_manifest_json.manifests[k].assertions?.length || 0), 0);
  }

  document.getElementById('kpi-manifests').textContent  = mCount;
  document.getElementById('kpi-assertions').textContent = aCount;
  document.getElementById('kpi-certs').textContent      = (d.active_manifest && d.active_manifest.issuer) ? '1' : '0';
  document.getElementById('kpi-time').textContent       = `${d.processing_time_sec}s`;

  // UI CLEANUP
  let signalText = d.signal || 'None';
  if (signalText.includes('—')) signalText = signalText.split('—')[0].trim();
  else if (signalText.includes('-')) signalText = signalText.split('-')[0].trim();
  document.getElementById('sum-signal').textContent = signalText;

  document.getElementById('sum-embedded').textContent = d.is_embedded ? 'Embedded' : 'Detached';

  // Format the SHA fingerprint with a copy button. fullSha is a server-computed
  // hex digest (safe to interpolate raw — hex chars can't break out of the
  // attribute or the surrounding markup).
  const fullSha = d.file_sha256 || '';
  if (fullSha) {
    const shortSha = fullSha.slice(0, 16);
    document.getElementById('sum-sha').innerHTML = `${shortSha} <button class="copy-btn" data-sha="${fullSha}" title="Copy Full SHA"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>`;
  } else {
    document.getElementById('sum-sha').textContent = 'None';
  }

  // Toggle contextual warning banners
  document.getElementById('warn-no-manifest').classList.toggle('visible', d.status === 'NO_MANIFEST');
  document.getElementById('warn-invalid').classList.toggle('visible',     d.status === 'INVALID');
  document.getElementById('warn-partial').classList.toggle('visible',     d.status === 'PARTIAL');
  document.getElementById('warn-remote').classList.toggle('visible',      d.status === 'REMOTE_MANIFEST');
}
