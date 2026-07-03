export function renderSidebar() {
  return `
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">C2</div>
        <div>
          <h1>C2PA VERITAS</h1>
          <p>Digital Provenance Console</p>
        </div>
      </div>

      <div class="section-heading">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
        Telemetry Overview
      </div>
      <div class="session-stats">
        <div class="stat-box"><span>Scans</span><strong id="stat-total">0</strong></div>
        <div class="stat-box"><span>Valid</span><strong id="stat-valid" class="stat-valid">0</strong></div>
        <div class="stat-box"><span>Unsigned</span><strong id="stat-absent" class="stat-absent">0</strong></div>
      </div>

      <div class="section-heading">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
        Evidence Input
      </div>
      <div class="evidence-locker" id="drop-zone">
        <svg class="locker-icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke-width="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="12" y1="8" x2="12" y2="16"></line>
          <line x1="8" y1="12" x2="16" y2="12"></line>
        </svg>
        <h2>Drop Digital Evidence</h2>
        <p>or click to browse secure local files</p>
        <div class="locker-badges">
          <span class="l-badge">JPEG</span>
          <span class="l-badge">PNG</span>
          <span class="l-badge">MP4</span>
        </div>
        <input type="file" id="file-input" accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/quicktime,application/pdf">
      </div>

      <div class="section-heading">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
        Operation Mode
      </div>
      <div class="mode-row">
        <button class="mode-btn active" id="mode-verify" data-mode="verify">Verify</button>
        <button class="mode-btn" id="mode-sign" data-mode="sign">Sign</button>
      </div>

      <div id="sign-options">
        <div class="field-group">
          <label>C2PA Action</label>
          <select id="sign-action">
            <option value="c2pa.created">c2pa.created</option>
            <option value="c2pa.edited">c2pa.edited</option>
            <option value="c2pa.transcoded">c2pa.transcoded</option>
            <option value="c2pa.repackaged">c2pa.repackaged</option>
          </select>
        </div>
        <div class="field-group">
          <label>Software Agent</label>
          <input type="text" id="sign-agent" placeholder="e.g. Veritas Console v2.0">
        </div>
        <div class="toggle-row">
          <label class="toggle">
            <input type="checkbox" id="sign-no-ai" checked>
            <span class="toggle-slider"></span>
          </label>
          <span>Embed "Do Not Train" assertion</span>
        </div>
      </div>

      <button id="action-btn" class="action-btn" disabled>AWAITING EVIDENCE</button>

      <div class="history-header">
        <div style="display: flex; align-items: center; gap: 8px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          SESSION LOG
        </div>
        <button class="clear-btn" id="clear-hist-btn">CLEAR</button>
      </div>
      <div class="history-list" id="history-list"></div>
    </aside>
  `;
}
