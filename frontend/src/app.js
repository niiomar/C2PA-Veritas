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
let currentMode    = 'verify';  // 'verify' | 'sign'
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
    // Show the dedicated system error banner
    showBanner('warn-sys-error', `PIPELINE ERROR: ${err.message}`);
    
    // Hide the dashboard data containers so they don't look broken
    document.querySelector('.dashboard-top').style.display = 'none';
    document.querySelector('.metrics-row').style.display = 'none';
    document.getElementById('json-toggle').style.display = 'none';
    
    // Switch from idle to result state
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

  // History
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

  // Show download bar
  const dlBar = document.getElementById('download-bar');
  dlBar.classList.add('visible');
  showResults();

  // History placeholder
  sessionHistory.unshift({
    status:     'SIGNED',
    filename:   currentFile.name,
    media_type: currentFile.type || 'N/A',
    _idx:       sessionHistory.length,
    _time:      new Date().toLocaleTimeString(),
  });
  updateHistory(sessionHistory);
}

// Download signed file
document.getElementById('dl-btn').addEventListener('click', () => {
  if (!signedBlob) return;
  const url = URL.createObjectURL(signedBlob);
  const a   = document.createElement('a');
  a.href = url; a.download = signedFilename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
});

// ── Render helpers ────────────────────────────────────────────────────────────

function renderVerdict(d) {
  const labelEl = document.getElementById('verdict-label');
  const scoreEl = document.getElementById('trust-score');
  const fillEl  = document.getElementById('gauge-fill');
  
  // Calculate Trust Score based on Status
  let score = 0;
  if (d.status === 'VALID') score = 100;
  else if (d.status === 'REMOTE_MANIFEST') score = 80;
  else if (d.status === 'PARTIAL') score = 60;
  else score = 0; // INVALID or NO_MANIFEST
  
  labelEl.textContent = d.status.replace('_', ' ');
  labelEl.style.color = `var(--${
    score === 100 ? 'green' : score >= 60 ? 'purple' : score === 0 && d.status === 'NO_MANIFEST' ? 'amber' : 'red'
  })`;
  
  // Animate numbers up
  let currentScore = 0;
  const interval = setInterval(() => {
    if (currentScore >= score) {
      scoreEl.textContent = score;
      clearInterval(interval);
    } else {
      currentScore += 2;
      scoreEl.textContent = currentScore;
    }
  }, 20);

  // Animate Gauge SVG (Circumference is ~377)
  fillEl.className.baseVal = `gauge-fill ${d.status}`;
  setTimeout(() => {
    fillEl.style.strokeDashoffset = 377 - (377 * (score / 100));
  }, 100);

  // Evidence Summary
  document.getElementById('sum-signal').textContent   = d.signal || 'None';
  document.getElementById('sum-time').textContent     = `${d.processing_time_sec}s`;
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
  document.getElementById('mc-issuer').textContent    = m?.issuer || 'N/A';
  document.getElementById('mc-alg').textContent       = m?.signing_algorithm || 'N/A';
  document.getElementById('mc-manifests').textContent = d.manifests?.length ?? '0';
  document.getElementById('mc-actions').textContent   = d.edit_timeline?.length ?? '0';
  document.getElementById('mc-type').textContent      = d.media_type || 'N/A';
}

function renderCertPanel(d) {
  const m = d.active_manifest;
  if (!m || (!m.issuer && !m.cert_serial)) return;

  const panel = document.getElementById('cert-panel');
  const card  = document.getElementById('cert-card');
  const isDev = m.issuer?.includes('Veritas') || m.issuer?.includes('Dev') || m.issuer?.includes('self');

  if (isDev) document.getElementById('warn-dev-cert').style.display = 'flex';

  card.innerHTML = `
    <div class="cert-icon">🔑</div>
    <div class="cert-info">
      <div class="cert-issuer">${m.issuer || 'Unknown Identity'}</div>
      ${m.cert_serial ? `<div class="cert-serial">Serial: ${m.cert_serial}</div>` : ''}
    </div>
    <div class="cert-alg">${m.signing_algorithm || 'N/A'}</div>
  `;
  panel.classList.add('visible');
}

function renderTimeline(d) {
  const tl = d.edit_timeline;
  if (!tl || tl.length === 0) return;

  const panel    = document.getElementById('timeline-panel');
  const timeline = document.getElementById('timeline');

  timeline.innerHTML = tl.map(action => {
    const action_label = action.action || 'Unknown Event';
    const agent  = action.software_agent ? `<div class="tl-agent">Generated by ${action.software_agent}</div>` : '';
    const when   = action.when ? `<div class="tl-when">${new Date(action.when).toLocaleString()}</div>` : '';

    return `
      <div class="tl-item">
        <div class="tl-dot"></div>
        <div class="tl-content">
          <div class="tl-header">
            <span class="tl-action">${action_label}</span>
            ${when}
          </div>
          ${agent}
        </div>
      </div>
    `;
  }).join('');

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
    'cawg.ai_inference':           'AI Inference Usage',
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
  document.getElementById('json-content').textContent = JSON.stringify(json, null, 2);
}

document.getElementById('json-toggle').addEventListener('click', () => {
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
  // Ensure the dashboard containers are visible for successful runs
  document.querySelector('.dashboard-top').style.display = 'flex';
  document.querySelector('.metrics-row').style.display = 'grid';
  document.getElementById('json-toggle').style.display = 'block';
  
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
  document.getElementById('json-viewer').classList.remove('visible');
  document.getElementById('result-state').classList.remove('visible');
  
  document.getElementById('gauge-fill').style.strokeDashoffset = 377;
  document.getElementById('trust-score').textContent = "0";
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

// ── Init history display ──────────────────────────────────────────────────────
updateHistory(sessionHistory);
