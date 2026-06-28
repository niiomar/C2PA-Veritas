export function renderSidebar() {
  return `
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">C2</div>
        <div>
          <h1>C2PA-VERITAS</h1>
          <p>PROVENANCE WORKSPACE</p>
        </div>
      </div>

      <div class="session-stats">
        <div class="stat-box"><span>Checks</span><strong id="stat-total">0</strong></div>
        <div class="stat-box"><span>Valid</span><strong id="stat-valid" class="stat-valid">0</strong></div>
        <div class="stat-box"><span>No Sig</span><strong id="stat-absent" class="stat-absent">0</strong></div>
      </div>

      <div id="drop-zone">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.5">
          <path d="M12 16V4M12 4l-4 4M12 4l4 4" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <h2>DROP MEDIA FILE</h2>
        <p>JPG · PNG · WebP · MP4 · MOV · PDF</p>
        <input type="file" id="file-input"
          accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/quicktime,application/pdf">
      </div>

      <div class="mode-row">
        <button class="mode-btn active" id="mode-verify" data-mode="verify">VERIFY</button>
        <button class="mode-btn"        id="mode-sign"   data-mode="sign">SIGN</button>
      </div>

      <div id="sign-options">
        <div class="field-group">
          <label>Action</label>
          <select id="sign-action">
            <option value="c2pa.created">c2pa.created</option>
            <option value="c2pa.edited">c2pa.edited</option>
            <option value="c2pa.transcoded">c2pa.transcoded</option>
            <option value="c2pa.repackaged">c2pa.repackaged</option>
          </select>
        </div>
        <div class="field-group">
          <label>Software Agent (optional)</label>
          <input type="text" id="sign-agent" placeholder="e.g. Adobe Photoshop 25.0">
        </div>
        <div class="toggle-row">
          <label class="toggle">
            <input type="checkbox" id="sign-no-ai" checked>
            <span class="toggle-slider"></span>
          </label>
          <span>Embed "Do Not Train" assertion</span>
        </div>
      </div>

      <button id="action-btn" class="action-btn" disabled>SELECT A FILE</button>

      <div class="history-header">
        <span>Session History</span>
        <button class="clear-btn" id="clear-hist-btn">CLEAR</button>
      </div>
      <div class="history-list" id="history-list"></div>
    </aside>
  `;
}
