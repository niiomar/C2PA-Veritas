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
let loadingInterval= null;

// Filter State
let activeFilter = 'ALL';
let searchQuery = '';

let objectUrlCache = null;

// ── DOM refs ─────────────────────────────────────────────────────────────────
const dropZone   = document.getElementById('drop-zone');
const fileInput  = document.getElementById('file-input');
const actionBtn  = document.getElementById('action-btn');
const modeVerify = document.getElementById('mode-verify');
const modeSigning= document.getElementById('mode-sign');
const signOpts   = document.getElementById('sign-options');

const previewImg   = document.getElementById('preview-img');
const videoPreview = document.getElementById('video-preview');

// ── Strict Forensic Date Formatter ───────────────────────────────────────────
function formatDateTime(isoString) {
  if (!isoString) return "--";
  const d = new Date(isoString);
  if (isNaN(d)) return isoString;
  return d.toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit', 
      minute: '2-digit' 
  });
}

// ── Filter Engine ────────────────────────────────────────────────────────────
function applyHistoryFilters() {
  let filtered = sessionHistory;
  
  if (activeFilter !== 'ALL') {
      filtered = filtered.filter(item => item.status === activeFilter);
  }
  
  if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(item => item.filename && item.filename.toLowerCase().includes(q));
  }
  
  updateHistory(filtered, sessionHistory);
}

// ── Search & Filter Listeners ────────────────────────────────────────────────
document.getElementById('history-search').addEventListener('input', (e) => {
    searchQuery = e.target.value;
    applyHistoryFilters();
});

document.querySelectorAll('.filter-chip').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        activeFilter = e.target.dataset.filter;
        applyHistoryFilters();
    });
});

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
  
  if (objectUrlCache) URL.revokeObjectURL(objectUrlCache);
  objectUrlCache = URL.createObjectURL(file);
  
  const isVid = file.type.startsWith('video/');
  previewImg.style.display = 'none';
  videoPreview.style.display = 'none';
  
  if (isVid) { 
    videoPreview.src = objectUrlCache; 
    videoPreview.style.display = 'block'; 
  } else { 
    previewImg.src = objectUrlCache; 
    previewImg.style.display = 'block'; 
  }

  const label = currentMode === 'verify' ? 'RUN VERIFICATION' : 'APPLY SIGNATURE';
  actionBtn.disabled   = false;
  actionBtn.textContent= `${label}: ${file.name.length > 20 ? file.name.slice(0,18)+'…' : file.name}`;
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
    document.getElementById('warn-sys-text').textContent = `PIPELINE ERROR: ${err.message}`;
    document.getElementById('warn-sys-error').classList.add('visible');
    
    document.getElementById('executive-panel').style.display = 'none';
    document.querySelector('.kpi-strip').style.display = 'none';
    document.querySelector('.metrics-row').style.display = 'none';
    document.getElementById('json-panel-container').classList.remove('visible');
    
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
    document.getElementById('warn-sys-text').textContent = 'Rate limit reached — please wait before retrying.';
    document.getElementById('warn-sys-error').classList.add('visible');
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
    _time: formatDateTime(new Date().toISOString()),
  };
  sessionHistory.unshift(entry);
  applyHistoryFilters();
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
    _time:      formatDateTime(new Date().toISOString()),
  });
  applyHistoryFilters();
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
  const titleEl = document.getElementById('trust-title');
  const subEl   = document.getElementById('trust-sub');
  const iconEl  = document.getElementById('status-icon');
  const fillEl  = document.getElementById('gauge-fill');
  
  const ICONS = {
    VALID: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
    INVALID: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
    PARTIAL: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`,
    NO_MANIFEST: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
    REMOTE_MANIFEST: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`
  };

  const META = {
    VALID: { sub: "Cryptographic signature verified and intact." },
    INVALID: { sub: "Manifest present but validation failed." },
    PARTIAL: { sub: "Manifest contains validation errors." },
    NO_MANIFEST: { sub: "Asset contains no digital provenance data." },
    REMOTE_MANIFEST: { sub: "Credentials hosted remotely." }
  };

  let fillPercent = 0;
  if (d.status === 'VALID' || d.status === 'REMOTE_MANIFEST') fillPercent = 100;
  else if (d.status === 'PARTIAL') fillPercent = 50;
  else if (d.status === 'INVALID') fillPercent = 100;
  else fillPercent = 5; 
  
  titleEl.textContent = d.status === 'VALID' ? 'FULLY VERIFIED' : d.status.replace('_', ' ');
  titleEl.className = `trust-title title-${d.status}`;
  subEl.textContent = META[d.status].sub;
  
  iconEl.className = `score-icon ${d.status}`;
  iconEl.innerHTML = ICONS[d.status] || ICONS.NO_MANIFEST;

  fillEl.className.baseVal = `gauge-fill ${d.status}`;
  setTimeout(() => {
    fillEl.style.strokeDashoffset = 295.3 - (295.3 * (fillPercent / 100));
  }, 100);

  const mCount = d.manifests?.length || 0;
  let aCount = 0;
  if(d.raw_manifest_json && d.raw_manifest_json.manifests) {
      aCount = Object.keys(d.raw_manifest_json.manifests).reduce((acc, k) => acc + (d.raw_manifest_json.manifests[k].assertions?.length || 0), 0);
  }
  document.getElementById('kpi-manifests').textContent  = mCount;
  document.getElementById('kpi-assertions').textContent = aCount;
  document.getElementById('kpi-certs').textContent      = (d.active_manifest && d.active_manifest.issuer) ? '1' : '0';
  document.getElementById('kpi-time').textContent       = `${d.processing_time_sec}s`;

  // UI CLEANUP: Strip verbose backend error messages at the em-dash
  let signalText = d.signal || 'None';
  if (signalText.includes('—')) {
      signalText = signalText.split('—')[0].trim();
  } else if (signalText.includes('-')) {
      signalText = signalText.split('-')[0].trim();
  }
  document.getElementById('sum-signal').textContent = signalText;

  document.getElementById('sum-embedded').textContent = d.is_embedded ? 'Embedded' : 'Detached';
  
  const fullSha = d.file_sha256 || '';
  if (fullSha) {
    const shortSha = fullSha.slice(0, 16);
    document.getElementById('sum-sha').innerHTML = `${shortSha} <button class="copy-btn" onclick="navigator.clipboard.writeText('${fullSha}')" title="Copy Full SHA"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>`;
  } else {
    document.getElementById('sum-sha').textContent = 'None';
  }

  document.getElementById('warn-no-manifest').classList.toggle('visible', d.status === 'NO_MANIFEST');
  document.getElementById('warn-invalid').classList.toggle('visible',     d.status === 'INVALID');
  document.getElementById('warn-partial').classList.toggle('visible',     d.status === 'PARTIAL');
  document.getElementById('warn-remote').classList.toggle('visible',      d.status === 'REMOTE_MANIFEST');
}

function renderMetrics(d) {
  const m = d.active_manifest;
  document.getElementById('mc-type').textContent = d.media_type || 'N/A';
  document.getElementById('mc-alg').textContent  = m?.signing_algorithm || 'N/A';
  
  const tl = d.edit_timeline || [];
  const mcActions = document.getElementById('mc-actions');
  if (tl.length === 0) {
     mcActions.innerHTML = `<span style="font-size:15px; font-weight:700; color:var(--text-hi);">0</span>`;
  } else {
     let listHTML = tl.map(a => {
         const actionName = a.action.split('.').pop().toUpperCase();
         const timeStr = a.timestamp ? formatDateTime(a.timestamp) : 'Unknown Date';
         const softStr = a.software_agent ? (a.software_agent.length > 18 ? a.software_agent.slice(0, 18) + '…' : a.software_agent) : 'Unknown Software';

         return `
         <div style="font-size:10px; padding:6px 0; border-bottom:1px solid var(--border); display:flex; flex-direction:column; gap:4px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="color:var(--cyan); font-weight:700; font-family:var(--mono);">${actionName}</span>
                <span style="color:var(--text-dim); font-size:8px; font-family:var(--mono);">${timeStr}</span>
            </div>
            <span style="color:var(--text-mid); font-size:9px;" title="${a.software_agent}">▶ ${softStr}</span>
         </div>`;
     }).join('');
     mcActions.innerHTML = `<div class="mini-ledger" style="display:flex; flex-direction:column; max-height: 80px; overflow-y:auto; padding-right:4px;">${listHTML}</div>`;
  }
}

function renderCertPanel(d) {
  const m = d.active_manifest;
  if (!m || (!m.issuer && !m.cert_serial)) return;

  const panel = document.getElementById('cert-panel');
  const card  = document.getElementById('cert-card');
  const isDev = m.issuer?.includes('Veritas') || m.issuer?.includes('Dev') || m.issuer?.includes('self');

  if (isDev) document.getElementById('warn-dev-cert').classList.add('visible');

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
  const drawer= document.getElementById('pg-drawer');
  drawer.classList.remove('visible');

  window.__timelineMeta = {
      origin: { title: "Asset Origin", software: tl[0]?.software_agent || "Unknown", time: tl[0]?.timestamp || "Unknown", details: "Initial asset generation or capture." }
  };
  
  const formatSoft = (soft) => {
      if(!soft) return "Unknown";
      return soft.length > 20 ? soft.substring(0, 18) + '...' : soft;
  };

  let nodesHTML = `
    <div class="pg-node origin" data-step="origin">
      <div class="pg-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg></div>
      <span class="pg-label">Origin</span>
      <span class="pg-sub" style="color:var(--text-mid)">${formatSoft(tl[0]?.software_agent)}</span>
      <span class="pg-sub" style="opacity:0.6">${formatDateTime(tl[0]?.timestamp)}</span>
    </div>
  `;

  tl.forEach((action, i) => {
    let type = action.action.includes('created') ? 'origin' : 'edit';
    if(type === 'edit') {
      const stepId = `edit_${i}`;
      window.__timelineMeta[stepId] = {
          title: action.action.split('.').pop().toUpperCase(),
          software: action.software_agent || "Unknown Editor",
          time: action.timestamp || "Unknown Time",
          details: action.parameters ? JSON.stringify(action.parameters) : `Action: ${action.action}`
      };
      nodesHTML += `
        <div class="pg-node edit" data-step="${stepId}">
          <div class="pg-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg></div>
          <span class="pg-label">${action.action.split('.').pop().toUpperCase()}</span>
          <span class="pg-sub" style="color:var(--text-mid)">${formatSoft(action.software_agent)}</span>
          <span class="pg-sub" style="opacity:0.6">${formatDateTime(action.timestamp)}</span>
        </div>
      `;
    }
  });

  if (d.status !== 'NO_MANIFEST') {
    window.__timelineMeta['sign'] = {
        title: "Cryptographic Signature",
        software: d.active_manifest?.issuer || "Unknown Issuer",
        time: "At Signature Time",
        details: `Algorithm: ${d.active_manifest?.signing_algorithm || 'Unknown'}`
    };
    nodesHTML += `
      <div class="pg-node sign" data-step="sign">
        <div class="pg-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg></div>
        <span class="pg-label">Signed</span>
        <span class="pg-sub" style="color:var(--text-mid)">${formatSoft(d.active_manifest?.issuer)}</span>
        <span class="pg-sub" style="opacity:0.6">--</span>
      </div>
    `;
  }

  window.__timelineMeta['verify'] = {
      title: "Verification",
      software: "C2PA Veritas Engine",
      time: new Date().toISOString(),
      details: `Status: ${d.status}`
  };
  nodesHTML += `
    <div class="pg-node verify" data-step="verify">
      <div class="pg-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg></div>
      <span class="pg-label">Verified</span>
      <span class="pg-sub" style="color:var(--text-mid)">C2PA Veritas</span>
      <span class="pg-sub" style="opacity:0.6">${formatDateTime(new Date().toISOString())}</span>
    </div>
  `;

  graph.innerHTML = nodesHTML;
  panel.classList.add('visible');

  // Bind interactive timeline drawers
  document.querySelectorAll('.pg-node').forEach(node => {
     node.addEventListener('click', () => {
         document.querySelectorAll('.pg-node').forEach(n => n.classList.remove('active'));
         node.classList.add('active');
         const meta = window.__timelineMeta[node.dataset.step];
         if(meta) {
             document.getElementById('drawer-title').textContent = meta.title;
             document.getElementById('drawer-software').textContent = meta.software;
             document.getElementById('drawer-time').textContent = formatDateTime(meta.time);
             document.getElementById('drawer-details').textContent = meta.details;
             drawer.classList.add('visible');
         }
     });
  });
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
      <div class="data-item val-${useClass}">
        <span class="data-label">${LABEL_MAP[key] || key.split('.').pop()}</span>
        <span class="data-val">${useLabel}</span>
      </div>
    `;
  }).join('');

  panel.classList.add('visible');
}

function renderRawJson(json) {
  if (!json) {
    document.getElementById('manifest-size').textContent = '0 KB';
    document.getElementById('json-content').innerHTML = '';
    window.__currentRawJson = null;
    return;
  }
  
  const strJson = JSON.stringify(json, null, 2);
  const sizeKB = (new Blob([strJson]).size / 1024).toFixed(1);
  document.getElementById('manifest-size').textContent = `${sizeKB} KB`;
  window.__currentRawJson = strJson;

  const lines = strJson.split('\n');
  let html = '';
  lines.forEach((line, index) => {
    let highlighted = line.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
      let cls = 'number';
      if (/^"/.test(match)) {
          if (/:$/.test(match)) { cls = 'key'; } 
          else { cls = 'string'; }
      } else if (/true|false/.test(match)) { cls = 'boolean'; } 
      else if (/null/.test(match)) { cls = 'null'; }
      return '<span class="json-' + cls + '">' + match + '</span>';
    });
    html += `<div class="json-line"><span class="json-line-num">${index + 1}</span><span class="json-line-code">${highlighted}</span></div>`;
  });
  
  document.getElementById('json-content').innerHTML = html;
}

document.getElementById('json-toggle').addEventListener('click', (e) => {
  if(e.target.closest('.json-actions')) return; 
  
  const bar = e.currentTarget;
  const isExpanded = bar.classList.toggle('open');
  document.getElementById('json-viewer').classList.toggle('open');
  document.getElementById('json-expand-text').textContent = isExpanded ? 'Collapse ▲' : 'Expand ▼';
});

document.getElementById('json-copy-btn').addEventListener('click', (e) => {
  if(window.__currentRawJson) {
      navigator.clipboard.writeText(window.__currentRawJson);
      const btn = e.currentTarget;
      const orig = btn.innerHTML;
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polyline points="20 6 9 17 4 12"></polyline></svg> COPIED`;
      setTimeout(() => btn.innerHTML = orig, 2000);
  }
});

document.getElementById('json-dl-btn').addEventListener('click', (e) => {
  if(window.__currentRawJson) {
      const blob = new Blob([window.__currentRawJson], {type: 'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `manifest_${currentFile?.name || 'export'}.json`;
      a.click();
      URL.revokeObjectURL(url);
  }
});

document.getElementById('history-list').addEventListener('click', e => {
  const item = e.target.closest('.hist-item');
  if (!item) return;
  const idx   = parseInt(item.dataset.idx);
  const entry = sessionHistory.find(h => h._idx === idx);
  if (!entry || entry.status === 'SIGNED') return;
  
  if (entry.filename && currentFile && currentFile.name === entry.filename) {
     const isVid = entry.media_type && entry.media_type.startsWith('video');
     if (isVid) {
         document.getElementById('video-preview').style.display = 'block';
     } else {
         document.getElementById('preview-img').style.display = 'block';
     }
  }
  
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
  applyHistoryFilters();
  resetResults();
  document.getElementById('idle-state').style.display = 'flex';
  document.getElementById('result-state').classList.remove('visible');
  currentFile = null;
  actionBtn.disabled    = true;
  actionBtn.textContent = 'AWAITING EVIDENCE';
});

function showResults() {
  document.getElementById('preview-wrapper').style.display = 'flex';
  document.getElementById('executive-panel').style.display = 'flex';
  document.querySelector('.kpi-strip').style.display = 'flex';
  document.querySelector('.metrics-row').style.display = 'grid';
  document.getElementById('json-panel-container').classList.add('visible');
  
  document.getElementById('idle-state').style.display = 'none';
  document.getElementById('result-state').classList.add('visible');
}

function resetResults() {
  ['warn-no-manifest','warn-invalid','warn-partial','warn-remote', 'warn-sys-error', 'warn-dev-cert'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('visible');
  });
  
  ['cert-panel', 'timeline-panel', 'ai-policy-panel', 'download-bar'].forEach(id => {
    document.getElementById(id).classList.remove('visible');
  });
  
  document.getElementById('pg-drawer').classList.remove('visible');
  document.getElementById('json-toggle').classList.remove('open');
  document.getElementById('json-viewer').classList.remove('open');
  document.getElementById('json-expand-text').textContent = 'Expand ▼';
  document.getElementById('result-state').classList.remove('visible');
  
  document.getElementById('gauge-fill').style.strokeDashoffset = 295.3;
  document.getElementById('status-icon').innerHTML = "";
  signedBlob = null;
  window.__currentRawJson = null;
}

function setLoading(on) {
  actionBtn.disabled = on;
  if (!on) {
    clearInterval(loadingInterval);
    const label = currentMode === 'verify' ? 'RUN VERIFICATION' : 'APPLY SIGNATURE';
    actionBtn.textContent = `${label}: ${currentFile.name.length > 20 ? currentFile.name.slice(0,18)+'…' : currentFile.name}`;
    return;
  }
  
  const steps = ['Reading Manifest...', 'Checking Signature...', 'Validating Certificate...', 'Parsing Assertions...'];
  let i = 0;
  actionBtn.textContent = steps[0];
  loadingInterval = setInterval(() => {
    i = (i + 1) % steps.length;
    actionBtn.textContent = steps[i];
  }, 400);
}

function showBanner(id, msg) {
  const el = document.getElementById(id);
  if (id === 'warn-sys-error') {
     document.getElementById('warn-sys-text').textContent = msg;
  }
  el.classList.add('visible');
}

applyHistoryFilters();
