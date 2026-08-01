import { beforeEach, describe, expect, it } from 'vitest';
import { renderVerdict } from './verdict.js';

// Minimal fixture containing only the elements renderVerdict() touches.
function mountFixture() {
  document.body.innerHTML = `
    <h2 id="trust-title"></h2>
    <p id="trust-sub"></p>
    <div id="status-icon"></div>
    <svg><circle id="gauge-fill" class="gauge-fill"></circle></svg>
    <span id="kpi-manifests"></span>
    <span id="kpi-assertions"></span>
    <span id="kpi-certs"></span>
    <span id="kpi-time"></span>
    <span id="sum-signal"></span>
    <span id="sum-embedded"></span>
    <span id="sum-sha"></span>
    <div id="warn-no-manifest" class="warning-banner"></div>
    <div id="warn-invalid" class="warning-banner"></div>
    <div id="warn-partial" class="warning-banner"></div>
    <div id="warn-remote" class="warning-banner"></div>
  `;
}

describe('renderVerdict', () => {
  beforeEach(mountFixture);

  it('shows FULLY VERIFIED for a VALID report', () => {
    renderVerdict({ status: 'VALID', file_sha256: 'abc123', processing_time_sec: 0.5 });
    expect(document.getElementById('trust-title').textContent).toBe('FULLY VERIFIED');
    expect(document.getElementById('warn-invalid').classList.contains('visible')).toBe(false);
  });

  it('flags the NO_MANIFEST warning banner', () => {
    renderVerdict({ status: 'NO_MANIFEST', processing_time_sec: 0.1 });
    expect(document.getElementById('warn-no-manifest').classList.contains('visible')).toBe(true);
  });

  it('flags the INVALID warning banner and not the others', () => {
    renderVerdict({ status: 'INVALID', processing_time_sec: 0.1 });
    expect(document.getElementById('warn-invalid').classList.contains('visible')).toBe(true);
    expect(document.getElementById('warn-partial').classList.contains('visible')).toBe(false);
  });

  it('renders the SHA copy button with the full hash in a data attribute, not inline onclick', () => {
    renderVerdict({ status: 'VALID', file_sha256: 'a'.repeat(64), processing_time_sec: 0.1 });
    const btn = document.querySelector('#sum-sha .copy-btn');
    expect(btn.getAttribute('onclick')).toBeNull();
    expect(btn.dataset.sha).toBe('a'.repeat(64));
  });

  it('shows "None" when there is no file hash', () => {
    renderVerdict({ status: 'NO_MANIFEST', file_sha256: '', processing_time_sec: 0.1 });
    expect(document.getElementById('sum-sha').textContent).toBe('None');
  });
});
