export function renderWorkspace() {
  return `
    <main class="main-view" id="main-view">

      <!-- IDLE -->
      <div id="idle-state">
        <div class="idle-icon">🔏</div>
        <p>AWAITING PROVENANCE INPUT</p>
      </div>

      <!-- RESULT -->
      <div id="result-state">

        <!-- Warning banners -->
        <div id="warn-no-manifest"  class="warning-banner warn-amber">
          ⚠ NO CONTENT CREDENTIALS — This file has no embedded C2PA manifest. Origin and edit history cannot be cryptographically verified.
        </div>
        <div id="warn-invalid"      class="warning-banner warn-red">
          ❌ SIGNATURE INVALID — The manifest is present but signature validation failed. The file may have been modified after signing.
        </div>
        <div id="warn-partial"      class="warning-banner warn-amber">
          ⚡ PARTIAL VALIDATION — Some assertions verified, others failed. Review the details below.
        </div>
        <div id="warn-remote"       class="warning-banner warn-blue">
          🔗 REMOTE MANIFEST — Content credentials are hosted at a remote URL, not embedded in the file.
        </div>
        <div id="warn-dev-cert"     class="warning-banner warn-amber" style="display:none">
          🔑 DEV CERTIFICATE — This file was signed with a self-issued test certificate and will not pass public C2PA trust validation.
        </div>

        <!-- Verdict -->
        <div class="verdict-card" id="verdict-card">
          <div class="verdict-ring" id="verdict-ring"></div>
          <div class="verdict-text">
            <h2 id="verdict-label"></h2>
            <p  id="verdict-signal" class="signal"></p>
          </div>
          <div class="verdict-meta">
            <span id="verdict-time">—</span>
            <span id="verdict-embedded">—</span>
            <span id="verdict-sha">—</span>
          </div>
        </div>

        <!-- Metrics -->
        <div class="metrics-grid">
          <div class="metric-card"><div class="mc-label">Issuer</div>       <div class="mc-val" id="mc-issuer">—</div></div>
          <div class="metric-card"><div class="mc-label">Algorithm</div>    <div class="mc-val" id="mc-alg">—</div></div>
          <div class="metric-card"><div class="mc-label">Manifests</div>    <div class="mc-val" id="mc-manifests">—</div></div>
          <div class="metric-card"><div class="mc-label">Actions</div>      <div class="mc-val" id="mc-actions">—</div></div>
          <div class="metric-card"><div class="mc-label">Media Type</div>   <div class="mc-val" id="mc-type">—</div></div>
          <div class="metric-card"><div class="mc-label">Process Time</div> <div class="mc-val" id="mc-proctime">—</div></div>
        </div>

        <!-- Certificate panel -->
        <div id="cert-panel" style="display:none">
          <div class="section-title">Certificate Chain</div>
          <div class="cert-card" id="cert-card"></div>
        </div>

        <!-- Edit timeline -->
        <div id="timeline-panel" style="display:none">
          <div class="section-title">Edit History Timeline</div>
          <div class="timeline" id="timeline"></div>
        </div>

        <!-- AI training policy -->
        <div id="ai-policy-panel" style="display:none">
          <div class="section-title">AI Training & Mining Policy</div>
          <div class="policy-grid" id="policy-grid"></div>
        </div>

        <!-- Download bar (sign mode) -->
        <div id="download-bar">
          <p>✅ Signing complete. Download your signed file to test the full verify round-trip.</p>
          <button class="dl-btn" id="dl-btn">DOWNLOAD SIGNED FILE</button>
        </div>

        <!-- Raw JSON -->
        <div>
          <button class="json-toggle" id="json-toggle">{ } Raw Manifest JSON</button>
          <div class="json-viewer" id="json-viewer">
            <pre id="json-content"></pre>
          </div>
        </div>

      </div>
    </main>
  `;
}
