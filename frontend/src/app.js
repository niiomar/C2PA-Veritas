import './styles.css';
import { renderSidebar }   from './components/sidebar.js';
import { renderWorkspace } from './components/workspace.js';
import { updateHistory }   from './components/history.js';
import { verifyFile, signFile } from './utils/api.js';

// ── Mount layout ────────────────────────────────────────────────────────────
document.getElementById('app').innerHTML = `
  <div class="layout">
    ${renderSidebar()}
    ${renderWorkspace()}
  </div>
`;

// ── State ────────────────────────────────────────────────────────────────────
let currentFile    = null;
let currentMode    = 'verify';  
let sessionHistory = [];
let signedBlob     = null;
let signedFilename = null;

// ── DOM refs ─────────────────────────────────────────────────────────────────
const dropZone   = document.getElementById('drop-zone');
const fileInput  = document.getElementById('file-input');
const actionBtn  = document.getElementById('action-btn');
const modeVerify = document.getElementById('mode-verify');
const modeSigning= document.getElementById('mode-sign');
const signOpts   = document.getElementById('sign-options');

// ── File selection ───────────────────────────────────────────────────────────
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => handleFile(e.target.files[0]));
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  handleFile(e.dataTransfer.files[0]);
});

function handleFile(file) {
  if (!file) return;
  currentFile = file;
  const label = currentMode === 'verify' ? 'RUN VERIFICATION' : 'APPLY SIGNATURE';
  actionBtn.disabled   = false;
  actionBtn.textContent= `${label}: ${file.name.length > 25 ? file.name.slice(0,22)+'…' : file.name}`;
  resetResults();
}

// ── Mode switching ───────────────────────────────────────────────────────────
[modeVerify, modeSigning].forEach(btn => {
  btn.addEventListener('click', () => {
    currentMode = btn.dataset.mode;
    modeVerify.classList.toggle('active', currentMode === 'verify');
    modeSigning.classList.toggle('active', currentMode === 'sign');
    signOpts.classList.toggle('visible', currentMode === 'sign');
    if (currentFile) {
      const label = currentMode === 'verify' ? 'RUN VERIFICATION' : 'APPLY SIGNATURE';
      actionBtn.textContent = `${label}: ${currentFile.name}`;
    }
    resetResults();
  });
});

// ── Action ───────────────────────────────────────────────────────────────────
actionBtn.addEventListener('click', async () => {
  if (!currentFile) return;
  setLoading(true);
  resetResults();

  try {
    if (currentMode === 'verify') {
      await runVerify();
    } else {
      await runSign();
    }
  } catch (err) {
    showBanner('warn-sys-error', `PIPELINE ERROR: ${err.message}`);
    document.querySelector('.verdict-hero').style.display = 'none';
    document.querySelector('.kpi-strip').style.display = 'none';
    document.querySelector('.metrics-row').style.display = 'none';
    document.querySelector('.json-panel').style.display = 'none';
    document.getElementById('idle-state').style.display = 'none';
    document.getElementById('result-state').classList.add('visible');
  } finally {
    setLoading(false);
  }
});

// ── Verify flow ───────────────────────────────────────────────────────────────
async function runVerify() {
  const data = await verifyFile(currentFile);
  if (data._rateLimited) {
    showBanner('warn-sys-error', 'Rate limit reached — please wait before retrying.');
    showResults();
    return;
  }

  renderVerdict(data);
  renderMetrics(data);
  renderCertPanel(data);
  renderTimeline(data);
  renderAiPolicy(data);
  renderRawJson(data.raw_manifest_json);
  showResults();

  const entry = {
    ...data,
    _idx:  sessionHistory.length,
    _time: new Date().toLocaleTimeString(),
  };
  sessionHistory.unshift(entry);
  updateHistory(sessionHistory);
}

// ── Sign flow ─────────────────────────────────────────────────────────────────
async function runSign() {
  const opts = {
    action:          document.getElementById('sign-action').value,
    softwareAgent:   document.getElementById('sign-agent').value.trim() || null,
    noAiTraining:    document.getElementById('sign-no-ai').checked,
    claimGenerator:  'C2PA-Veritas/2.0',
  };

  const result = await signFile(currentFile, opts);
  signedBlob     = result.blob;
  signedFilename = result.filename;

  const dlBar = document.getElementById('download-bar');
  dlBar.classList.add('visible');
  showResults();

  sessionHistory.unshift({
    status:     'SIGNED',
    filename:   currentFile.name,
    media_type: currentFile.type || 'N/A',
    manifests:  [{ assertions: [] }], 
    _idx:       sessionHistory.length,
    _time:      new Date().toLocaleTimeString(),
  });
  updateHistory(sessionHistory);
}

document.getElementById('dl-btn').addEventListener('click', () => {
  if (!signedBlob) return;
  const url = URL.createObjectURL(signedBlob);
  const a   = document.createElement('a');
  a.href = url; a.download = signedFilename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
});

// ── Render helpers ────────────────────────────────────────────────────────────

function renderVerdict(d) {
  const heroEl   = document.getElementById('verdict-hero');
  const iconEl   = document.getElementById('hero-icon');
  const titleEl  = document.getElementById('hero-title');
  const subEl    = document.getElementById('hero-sub');
  
  const ICONS = {
    VALID: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
    INVALID: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
    PARTIAL: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`,
    NO_MANIFEST: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
    REMOTE_MANIFEST: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`
  };

  const SUBS = {
    VALID: "Cryptographic signature verified and intact.",
    INVALID: "Manifest present but validation failed.",
    PARTIAL: "Manifest contains validation errors.",
    NO_MANIFEST: "Asset contains no digital provenance data.",
    REMOTE_MANIFEST: "Credentials hosted remotely."
  };

  heroEl.className = `verdict-hero hero-${d.status}`;
  iconEl.innerHTML = ICONS[d.status] || ICONS.NO_MANIFEST;
  titleEl.textContent = d.status === 'VALID' ? 'FULLY VERIFIED' : d.status.replace('_', ' ');
  subEl.textContent = SUBS[d.status];

  // Populate KPI Strip
  const mCount = d.manifests?.length || 0;
  let aCount = 0;
  if(d.raw_manifest_json && d.raw_manifest_json.manifests) {
      aCount = Object.keys(d.raw_manifest_json.manifests).reduce((acc, k) => acc + (d.raw_manifest_json.manifests[k].assertions?.length || 0), 0);
  }
  document.getElementById('kpi-manifests').textContent  = mCount;
  document.getElementById('kpi-assertions').textContent = aCount;
  document.getElementById('kpi-certs').textContent      = (d.active_manifest && d.active_manifest.issuer) ? '1' : '0';
  document.getElementById('kpi-time').textContent       = `${d.processing_time_sec}s`;

  // Evidence Summary
  document.getElementById('sum-signal').textContent   = d.signal || 'None';
  document.getElementById('sum-embedded').textContent = d.is_embedded ? 'Embedded in asset' : 'Not embedded';
  document.getElementById('sum-sha').textContent      = d.file_sha256 ? d.file_sha256.slice(0, 20) + '…' : 'None';

  // Banners
  document.getElementById('warn-no-manifest').classList.toggle('visible', d.status === 'NO_MANIFEST');
  document.getElementById('warn-invalid').classList.toggle('visible',     d.status === 'INVALID');
  document.getElementById('warn-partial').classList.toggle('visible',     d.status === 'PARTIAL');
  document.getElementById('warn-remote').classList.toggle('visible',      d.status === 'REMOTE_MANIFEST');
}

function renderMetrics(d) {
  const m = d.active_manifest;
  document.getElementById('mc-actions').textContent   = d.edit_timeline?.length ?? '0';
  document.getElementById('mc-type').textContent      = d.media_type || 'N/A';
  document.getElementById('mc-alg').textContent       = m?.signing_algorithm || 'N/A';
  document.getElementById('mc-issuer').textContent    = m?.issuer || 'N/A';
}

function renderCertPanel(d) {
  const m = d.active_manifest;
  if (!m || (!m.issuer && !m.cert_serial)) return;

  const panel = document.getElementById('cert-panel');
  const card  = document.getElementById('cert-card');
  const isDev = m.issuer?.includes('Veritas') || m.issuer?.includes('Dev') || m.issuer?.includes('self');

  if (isDev) document.getElementById('warn-dev-cert').style.display = 'flex';

  let fp = d.file_sha256 ? d.file_sha256.slice(0,16).toUpperCase() : 'N/A';

  card.innerHTML = `
    <div class="cert-grid">
      <div class="cg-item"><span class="cg-label">Issuer</span><span class="cg-val" style="color:var(--blue)">${m.issuer || 'Unknown'}</span></div>
      <div class="cg-item"><span class="cg-label">Subject</span><span class="cg-val">${m.issuer || 'Self-Signed'}</span></div>
      <div class="cg-item"><span class="cg-label">Algorithm</span><span class="cg-val">${m.signing_algorithm || 'N/A'}</span></div>
      <div class="cg-item"><span class="cg-label">Fingerprint</span><span class="cg-val">${fp}...</span></div>
      <div class="cg-item" style="grid-column: span 2"><span class="cg-label">Serial Number</span><span class="cg-val" style="color:var(--text-dim)">${m.cert_serial || 'N/A'}</span></div>
    </div>
  `;
  panel.classList.add('visible');
}

function renderTimeline(d) {
  const tl = d.edit_timeline;
  if (!tl || tl.length === 0) return;

  const panel = document.getElementById('timeline-panel');
  const graph = document.getElementById('pg-container');

  // Build the horizontal nodes
  let nodesHTML = '';
  
  // 1. Origin
  nodesHTML += `
    <div class="pg-node origin">
      <div class="pg-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg></div>
      <span class="pg-label">Origin</span>
      <span class="pg-sub">Capture/Creation</span>
    </div>
  `;

  // 2. Map actions to middle nodes
  tl.forEach(action => {
    let type = action.action.includes('created') ? 'origin' : 'edit';
    if(type === 'edit') {
      nodesHTML += `
        <div class="pg-node edit">
          <div class="pg-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg></div>
          <span class="pg-label">${action.action.split('.').pop().toUpperCase()}</span>
          <span class="pg-sub" title="${action.software_agent}">${action.software_agent ? action.software_agent.split(' ')[0] : 'Editor'}</span>
        </div>
      `;
    }
  });

  // 3. Signed
  if (d.status !== 'NO_MANIFEST') {
    nodesHTML += `
      <div class="pg-node sign">
        <div class="pg-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg></div>
        <span class="pg-label">Signed</span>
        <span class="pg-sub">${d.active_manifest?.issuer ? d.active_manifest.issuer.split(' ')[0] : 'Credentials'}</span>
      </div>
    `;
  }

  // 4. Verified
  nodesHTML += `
    <div class="pg-node verify">
      <div class="pg-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg></div>
      <span class="pg-label">Verified</span>
      <span class="pg-sub">C2PA Veritas</span>
    </div>
  `;

  graph.innerHTML = nodesHTML;
  panel.classList.add('visible');
}

function renderAiPolicy(d) {
  const policy = d.active_manifest?.ai_training_policy;
  if (!policy || Object.keys(policy).length === 0) return;

  const panel = document.getElementById('ai-policy-panel');
  const grid  = document.getElementById('policy-grid');

  const LABEL_MAP = {
    'c2pa.ai_generative_training': 'Generative AI Training',
    'c2pa.ai_inference':           'AI Inference Usage',
    'c2pa.ai_training':            'General AI Training',
    'c2pa.data_mining':            'Data Mining & Scraping',
    'cawg.ai_generative_training': 'Generative AI Training',
  };

  grid.innerHTML = Object.entries(policy).map(([key, val]) => {
    const use      = val?.use || val || 'N/A';
    const useClass = use === 'notAllowed' ? 'notAllowed' : use === 'allowed' ? 'allowed' : 'constrained';
    const useLabel = use === 'notAllowed' ? 'RESTRICTED' : use.toUpperCase();
    return `
      <div class="data-item">
        <span class="data-label">${LABEL_MAP[key] || key.split('.').pop()}</span>
        <span class="data-val val-${useClass}">${useLabel}</span>
      </div>
    `;
  }).join('');

  panel.classList.add('visible');
}

function renderRawJson(json) {
  if (!json) return;
  // Simple regex for basic JSON syntax highlighting
  let str = JSON.stringify(json, null, 2);
  str = str.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
      let cls = 'number';
      if (/^"/.test(match)) {
          if (/:$/.test(match)) { cls = 'key'; } 
          else { cls = 'string'; }
      } else if (/true|false/.test(match)) { cls = 'boolean'; } 
      else if (/null/.test(match)) { cls = 'null'; }
      return '<span class="json-' + cls + '">' + match + '</span>';
  });
  document.getElementById('json-content').innerHTML = str;
}

document.getElementById('json-toggle').addEventListener('click', (e) => {
  e.currentTarget.classList.toggle('open');
  document.getElementById('json-viewer').classList.toggle('visible');
});

// ── History click → re-render ─────────────────────────────────────────────────
document.getElementById('history-list').addEventListener('click', e => {
  const item = e.target.closest('.hist-item');
  if (!item) return;
  const idx   = parseInt(item.dataset.idx);
  const entry = sessionHistory.find(h => h._idx === idx);
  if (!entry || entry.status === 'SIGNED') return;
  resetResults();
  renderVerdict(entry);
  renderMetrics(entry);
  renderCertPanel(entry);
  renderTimeline(entry);
  renderAiPolicy(entry);
  renderRawJson(entry.raw_manifest_json);
  showResults();
});

document.getElementById('clear-hist-btn').addEventListener('click', () => {
  sessionHistory = [];
  updateHistory(sessionHistory);
  resetResults();
  document.getElementById('idle-state').style.display = 'flex';
  document.getElementById('result-state').classList.remove('visible');
  currentFile = null;
  actionBtn.disabled    = true;
  actionBtn.textContent = 'AWAITING EVIDENCE';
});

// ── Utilities ─────────────────────────────────────────────────────────────────
function showResults() {
  document.querySelector('.verdict-hero').style.display = 'flex';
  document.querySelector('.kpi-strip').style.display = 'flex';
  document.querySelector('.metrics-row').style.display = 'grid';
  document.querySelector('.json-panel').style.display = 'block';
  
  document.getElementById('idle-state').style.display = 'none';
  document.getElementById('result-state').classList.add('visible');
}

function resetResults() {
  ['warn-no-manifest','warn-invalid','warn-partial','warn-remote', 'warn-sys-error'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('visible');
  });
  
  document.getElementById('warn-dev-cert').style.display = 'none';
  document.getElementById('cert-panel').classList.remove('visible');
  document.getElementById('timeline-panel').classList.remove('visible');
  document.getElementById('ai-policy-panel').classList.remove('visible');
  document.getElementById('download-bar').classList.remove('visible');
  
  document.getElementById('json-toggle').classList.remove('open');
  document.getElementById('json-viewer').classList.remove('visible');
  document.getElementById('result-state').classList.remove('visible');
  
  signedBlob = null;
}

function setLoading(on) {
  actionBtn.disabled = on;
  actionBtn.textContent = on ? 'ANALYZING TELEMETRY...' : (
    currentMode === 'verify' ? `RUN VERIFICATION` : `APPLY SIGNATURE`
  );
}

function showBanner(id, msg) {
  const el = document.getElementById(id);
  if (msg) el.textContent = `❌ ${msg}`;
  el.classList.add('visible');
}

updateHistory(sessionHistory);
