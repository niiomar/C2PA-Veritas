export function renderWorkspace() {
  return `
    <main class="main-view" id="main-view">

      <!-- IDLE -->
      <div id="idle-state">
        <div class="idle-shield">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
        </div>
        <p>AWAITING PROVENANCE TELEMETRY</p>
      </div>

      <!-- RESULT -->
      <div id="result-state">

        <!-- Warning banners -->
        <div id="warn-sys-error" class="warning-banner warn-red"></div>
        
        <div id="warn-no-manifest" class="warning-banner warn-amber">
          <svg class="banner-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          UNSIGNED CONTENT — No cryptographic C2PA manifest detected.
        </div>
        <div id="warn-invalid" class="warning-banner warn-red">
          <svg class="banner-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
          TAMPER DETECTED — Signature validation failed. Content altered post-signing.
        </div>
        <div id="warn-partial" class="warning-banner warn-amber">
          <svg class="banner-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
          INCOMPLETE CHAIN — Review validation errors below.
        </div>
        <div id="warn-remote" class="warning-banner warn-blue">
          <svg class="banner-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
          CLOUD MANIFEST — Remote credentials require network resolution.
        </div>
        <div id="warn-dev-cert" class="warning-banner warn-amber">
          <svg class="banner-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
          DEV CERTIFICATE — Signed via self-issued key. Will fail strict trust policies.
        </div>

        <div class="dashboard-top">
          <!-- Status Arc -->
          <div class="gauge-container">
            <div class="gauge-wrapper">
              <svg class="gauge-svg" viewBox="0 0 140 140">
                <circle cx="70" cy="70" r="60" class="gauge-bg"></circle>
                <circle cx="70" cy="70" r="60" id="gauge-fill" class="gauge-fill"></circle>
              </svg>
              <div class="gauge-text">
                <div class="score-icon" id="status-icon"></div>
                <span class="label">Status</span>
              </div>
            </div>
            <div class="verdict-status" id="verdict-label">UNKNOWN</div>
          </div>

          <!-- Evidence Summary -->
          <div class="summary-container">
            <div>
              <div class="summary-title">Evidence Summary</div>
              <div class="summary-grid">
                <div class="sum-item"><span class="sum-label">Signal Analysis</span><span class="sum-val" id="sum-signal">Pending</span></div>
                <div class="sum-item"><span class="sum-label">File SHA-256</span><span class="sum-val" id="sum-sha">Pending</span></div>
                <div class="sum-item"><span class="sum-label">Manifest Embedding</span><span class="sum-val" id="sum-embedded">Pending</span></div>
                <div class="sum-item"><span class="sum-label">Time to Verify</span><span class="sum-val" id="sum-time">Pending</span></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Metrics Row -->
        <div class="metrics-row">
          <div class="metric-card"><div class="mc-label">Format</div><div class="mc-val" id="mc-type">N/A</div></div>
          <div class="metric-card"><div class="mc-label">Manifests</div><div class="mc-val" id="mc-manifests">0</div></div>
          <div class="metric-card"><div class="mc-label">Edit Actions</div><div class="mc-val" id="mc-actions">0</div></div>
          <div class="metric-card" style="grid-column: span 2"><div class="mc-label">Active Issuer</div><div class="mc-val" id="mc-issuer" style="margin-top: 2px;">N/A</div></div>
          <div class="metric-card"><div class="mc-label">Algorithm</div><div class="mc-val" id="mc-alg" style="margin-top: 2px;">N/A</div></div>
        </div>

        <!-- Certificate Chain -->
        <div id="cert-panel" class="panel">
          <div class="panel-header">Cryptographic Identity</div>
          <div class="cert-row" id="cert-card">
            <!-- Injected via JS -->
          </div>
        </div>

        <!-- Integrity Timeline -->
        <div id="timeline-panel" class="panel">
          <div class="panel-header">Integrity Timeline</div>
          <div class="timeline" id="timeline">
            <!-- Injected via JS -->
          </div>
        </div>

        <!-- AI Policy Explorer -->
        <div id="ai-policy-panel" class="panel">
          <div class="panel-header">Machine Learning / Mining Policy</div>
          <div class="data-grid" id="policy-grid">
            <!-- Injected via JS -->
          </div>
        </div>

        <!-- Download Banner for Sign Mode -->
        <div id="download-bar">
          <p>CRYPTOGRAPHIC SIGNATURE APPLIED SUCCESSFULLY.</p>
          <button class="dl-btn" id="dl-btn">EXPORT SECURED FILE</button>
        </div>

        <!-- Raw JSON Inspector -->
        <div>
          <button class="json-toggle" id="json-toggle">▼ Inspect Raw Manifest JSON</button>
          <div class="json-viewer" id="json-viewer">
            <pre id="json-content"></pre>
          </div>
        </div>

      </div>
    </main>
  `;
}
