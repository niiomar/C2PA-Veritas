export function renderWorkspace() {
  return `
    <main class="main-view" id="main-view">

      <div id="idle-state">
        <div class="idle-shield">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
        </div>
        <p>AWAITING PROVENANCE TELEMETRY</p>
      </div>

      <div id="result-state">

        <!-- Warning banners -->
        <div class="warning-banner warn-red" id="warn-sys-error">
          <svg class="banner-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
          <span id="warn-sys-text"></span>
          <button class="banner-close" onclick="this.parentElement.classList.remove('visible')">×</button>
        </div>
        
        <div id="warn-no-manifest" class="warning-banner warn-amber">
          <svg class="banner-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          UNSIGNED CONTENT — No cryptographic C2PA manifest detected.
          <button class="banner-close" onclick="this.parentElement.classList.remove('visible')">×</button>
        </div>
        
        <div id="warn-invalid" class="warning-banner warn-red">
          <svg class="banner-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
          TAMPER DETECTED — Signature validation failed. Content altered post-signing.
          <button class="banner-close" onclick="this.parentElement.classList.remove('visible')">×</button>
        </div>
        
        <div id="warn-partial" class="warning-banner warn-amber">
          <svg class="banner-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
          INCOMPLETE CHAIN — Review validation errors below.
          <button class="banner-close" onclick="this.parentElement.classList.remove('visible')">×</button>
        </div>
        
        <div id="warn-remote" class="warning-banner warn-blue">
          <svg class="banner-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
          CLOUD MANIFEST — Remote credentials require network resolution.
          <button class="banner-close" onclick="this.parentElement.classList.remove('visible')">×</button>
        </div>
        
        <div id="warn-dev-cert" class="warning-banner warn-amber">
          <svg class="banner-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
          DEV CERTIFICATE — Signed via self-issued key. Will fail strict trust policies.
          <button class="banner-close" onclick="this.parentElement.classList.remove('visible')">×</button>
        </div>

        <!-- NEW: Source Evidence Viewer -->
        <div class="media-panel" id="preview-wrapper">
          <div class="media-header"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg> Source Evidence</div>
          <div class="media-content">
            <img id="preview-img" style="display:none;" />
            <video id="video-preview" controls style="display:none;"></video>
          </div>
        </div>

        <!-- Executive Panel (Fluff metrics deleted) -->
        <div class="executive-panel" id="executive-panel">
          <div class="exec-left">
            <div class="trust-ring-box">
              <svg class="gauge-svg" viewBox="0 0 110 110">
                <circle cx="55" cy="55" r="47" class="gauge-bg"></circle>
                <circle cx="55" cy="55" r="47" id="gauge-fill" class="gauge-fill"></circle>
              </svg>
              <div class="gauge-text">
                <div class="score-icon" id="status-icon"></div>
              </div>
            </div>
            <div class="trust-info">
              <h2 class="trust-title" id="trust-title">UNKNOWN</h2>
              <p class="trust-sub" id="trust-sub">Awaiting telemetry analysis.</p>
            </div>
          </div>
          <div class="exec-divider"></div>
          <div class="exec-right">
            <div class="summary-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="12" x2="2" y2="12"></line><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path></svg> Evidence Summary</div>
            <div class="summary-grid">
              <div class="sum-row"><span class="sum-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg> Signal</span><span class="sum-val" id="sum-signal">Pending</span></div>
              <div class="sum-row"><span class="sum-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg> SHA-256</span><span class="sum-val" id="sum-sha">Pending</span></div>
              <div class="sum-row"><span class="sum-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path></svg> Embedding</span><span class="sum-val" id="sum-embedded">Pending</span></div>
            </div>
          </div>
        </div>

        <div class="kpi-strip">
          <div class="kpi-item"><span class="kpi-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg> Manifests</span><span class="kpi-val" id="kpi-manifests">0</span></div>
          <div class="kpi-item"><span class="kpi-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg> Assertions</span><span class="kpi-val" id="kpi-assertions">0</span></div>
          <div class="kpi-item"><span class="kpi-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg> Certificates</span><span class="kpi-val" id="kpi-certs">0</span></div>
          <div class="kpi-item"><span class="kpi-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> Process Time</span><span class="kpi-val" id="kpi-time">0s</span></div>
        </div>

        <div id="download-bar">
          <p><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="20 6 9 17 4 12"></polyline></svg> CRYPTOGRAPHIC SIGNATURE APPLIED</p>
          <button class="dl-btn" id="dl-btn">EXPORT SECURED FILE</button>
        </div>

        <div class="metrics-row">
          <div class="metric-card"><div class="mc-label">File Format</div><div class="mc-val" id="mc-type">N/A</div><span class="mc-sub">MIME Verified</span></div>
          
          <!-- EDITS CARD REBUILT: Now acts as a scrolling list of actions instead of just a number -->
          <div class="metric-card"><div class="mc-label">Historical Actions</div><div class="mc-val" id="mc-actions" style="margin-bottom:0; font-weight:normal;">0</div></div>
          
          <div class="metric-card" style="grid-column: span 2"><div class="mc-label">Signature Alg</div><div class="mc-val" id="mc-alg">N/A</div><span class="mc-sub">Cryptographic Method</span></div>
        </div>

        <div id="cert-panel" class="panel">
          <div class="panel-header"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg> Cryptographic Identity</div>
          <div class="cert-container" id="cert-card"></div>
        </div>

        <div id="timeline-panel" class="panel">
          <div class="panel-header"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg> Provenance Graph</div>
          <div class="provenance-graph" id="pg-container"></div>
          
          <div id="pg-drawer" class="pg-drawer">
            <div class="pg-drawer-grid">
              <div class="pg-drawer-col"><span class="pg-drawer-label">Node Action</span><span class="pg-drawer-val" id="drawer-title">--</span></div>
              <div class="pg-drawer-col"><span class="pg-drawer-label">Software Agent</span><span class="pg-drawer-val" id="drawer-software">--</span></div>
              <div class="pg-drawer-col"><span class="pg-drawer-label">Timestamp (UTC)</span><span class="pg-drawer-val" id="drawer-time">--</span></div>
              <div class="pg-drawer-col"><span class="pg-drawer-label">Cryptographic Details</span><span class="pg-drawer-val" id="drawer-details">--</span></div>
            </div>
          </div>
        </div>

        <div id="ai-policy-panel" class="panel">
          <div class="panel-header"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg> Machine Learning / Mining Policy</div>
          <div class="data-grid" id="policy-grid"></div>
        </div>

        <div class="json-panel" id="json-panel-container">
          <div class="json-header-bar" id="json-toggle">
            <div style="display:flex; align-items:center; gap:16px;">
                <span class="json-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg> RAW MANIFEST JSON</span>
                <span class="json-meta">Size: <strong id="manifest-size" style="color:var(--text-hi);">0 KB</strong></span>
            </div>
            <div class="json-actions">
              <button class="json-action-btn" id="json-copy-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> COPY PAYLOAD</button>
              <button class="json-action-btn" id="json-dl-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> DOWNLOAD</button>
              <div class="json-divider"></div>
              <span class="json-expand" id="json-expand-text">Expand ▼</span>
            </div>
          </div>
          <div class="json-viewer" id="json-viewer"><div id="json-content"></div></div>
        </div>

      </div>
    </main>
  `;
}
