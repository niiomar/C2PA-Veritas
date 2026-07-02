export function renderWorkspace() {
  return `
    <main class="main-view" id="main-view">

      <!-- IDLE -->
      <div id="idle-state">
        <div class="idle-shield">🛡️</div>
        <p>AWAITING PROVENANCE TELEMETRY</p>
      </div>

      <!-- RESULT -->
      <div id="result-state">

        <!-- Warning banners -->
        <div id="warn-sys-error" class="warning-banner warn-red"></div>
        <div id="warn-no-manifest" class="warning-banner warn-amber">
          ⚠ UNSIGNED CONTENT — No cryptographic C2PA manifest detected. Origin cannot be verified.
        </div>
        <div id="warn-invalid" class="warning-banner warn-red">
          ❌ TAMPER DETECTED — Signature validation failed. Content was altered post-signing.
        </div>
        <div id="warn-partial" class="warning-banner warn-amber">
          ⚡ INCOMPLETE CHAIN — Some assertions verified, others failed or are missing.
        </div>
        <div id="warn-remote" class="warning-banner warn-blue">
          🔗 CLOUD MANIFEST — Credentials hosted remotely, requiring network resolution.
        </div>
        <div id="warn-dev-cert" class="warning-banner warn-amber">
          🔑 DEVELOPMENT CERTIFICATE — Signed via self-issued key. Will fail strict trust policies.
        </div>

        <div class="dashboard-top">
          <!-- Trust Gauge -->
          <div class="gauge-container">
            <div class="gauge-wrapper">
              <svg class="gauge-svg" viewBox="0 0 140 140">
                <circle cx="70" cy="70" r="60" class="gauge-bg"></circle>
                <circle cx="70" cy="70" r="60" id="gauge-fill" class="gauge-fill"></circle>
              </svg>
              <div class="gauge-text">
                <span class="score" id="trust-score">0</span>
                <span class="label">Trust Index</span>
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
          <div class="metric-card" style="grid-column: span 2"><div class="mc-label">Active Issuer</div><div class="mc-val" id="mc-issuer" style="font-size: 14px; margin-top: 4px;">N/A</div></div>
          <div class="metric-card"><div class="mc-label">Algorithm</div><div class="mc-val" id="mc-alg" style="font-size: 14px; margin-top: 4px;">N/A</div></div>
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
