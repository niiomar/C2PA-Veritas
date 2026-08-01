import { escapeHtml } from '../utils/escape.js';

// CUSTOM LOGIC: Sequence Completeness (Omission Detection) — a Veritas
// extension, not part of the official C2PA spec (see backend/core/signer.py).
export function renderSequencePanel(d) {
  const panel = document.getElementById('sequence-panel');
  const grid = document.getElementById('sequence-grid');
  const warn = document.getElementById('warn-omission');

  // Check if the backend detected a sequence invariant block in the manifest
  const seq = d.active_manifest?.sequence_invariants || d.sequence_invariants;

  if (!seq) {
    panel.classList.remove('visible');
    warn.classList.remove('visible');
    return;
  }

  // Detect omission if actual assets present don't match the expected batch size
  const isOmitted = seq.actual_count < seq.expected_count;

  if (isOmitted) {
      warn.classList.add('visible');
      // Override the main trust ring to explicitly flag the omission attack
      document.getElementById('trust-title').textContent = 'SEQUENCE BROKEN';
      document.getElementById('trust-title').className = 'trust-title title-INVALID';
      document.getElementById('gauge-fill').className.baseVal = 'gauge-fill INVALID';
      document.getElementById('status-icon').innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
  }

  // Populate the invariant data grid
  grid.innerHTML = `
    <div class="data-item">
      <span class="data-label">Sequence ID (Batch Hash)</span>
      <span class="data-val" style="color:var(--cyan); text-transform:none;">${escapeHtml(seq.batch_id || 'N/A')}</span>
    </div>
    <div class="data-item ${isOmitted ? 'val-notAllowed' : 'val-allowed'}">
      <span class="data-label">Asset Completeness</span>
      <span class="data-val">${seq.actual_count} / ${seq.expected_count} Present</span>
    </div>
    <div class="data-item ${isOmitted ? 'val-notAllowed' : 'val-allowed'}">
      <span class="data-label">Audit Log Cross-Check</span>
      <span class="data-val">${isOmitted ? 'INCOMPLETE' : 'COMPLETE'}</span>
    </div>
  `;

  panel.classList.add('visible');
}
