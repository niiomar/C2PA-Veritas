import './styles.css';
import { renderSidebar }   from './components/sidebar.js';
import { renderWorkspace } from './components/workspace.js';
import { updateHistory }   from './components/history.js';
import { verifyFile, signFile, verifyBatch, exportHistoryCsv, fetchHistory } from './utils/api.js';
import { escapeHtml, escapeHtmlKeepQuotes } from './utils/escape.js';

// Mount Layout
// Injects the sidebar and workspace components into the main #app container
document.getElementById('app').innerHTML = `
  <div class="layout">
    ${renderSidebar()}
    ${renderWorkspace()}
  </div>
`;

// Application State
let currentFile    = null;      // Holds the currently uploaded File object
let currentFiles   = [];        // Holds the currently uploaded File objects in batch mode
let currentMode    = 'verify';  // Tracks active mode: 'verify' or 'sign'
let sessionHistory = [];        // Stores all scans run during this session
let signedBlob     = null;      // Holds the output file after signing
let signedFilename = null;      // Stores the generated filename for downloads
let loadingInterval= null;      // Controls the UI loading text animation

// Filter Engine State
let activeFilter = 'ALL';       // Tracks the active history filter (ALL, VALID, INVALID)
let searchQuery = '';           // Tracks current text in the history search bar

// Persisted History Pagination State
const HISTORY_PAGE_SIZE = 50;
let historyOffset = 0;
let historyTotal  = 0;

// Cache for the source media viewer to prevent memory leaks
let objectUrlCache = null;

// DOM Element References
const dropZone   = document.getElementById('drop-zone');
const fileInput  = document.getElementById('file-input');
const actionBtn  = document.getElementById('action-btn');
const modeVerify = document.getElementById('mode-verify');
const modeSigning= document.getElementById('mode-sign');
const signOpts   = document.getElementById('sign-options');

const previewImg   = document.getElementById('preview-img');
const videoPreview = document.getElementById('video-preview');
const batchModeChk = document.getElementById('batch-mode');

// Strict Forensic Date Formatter
// Forces all timestamps into a standard, readable chronological format
function formatDateTime(isoString) {
  if (!isoString) return "--";
  const d = new Date(isoString);
  if (isNaN(d)) return isoString;
  return d.toLocaleString('en-US', { 
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' 
  });
}

// Filter Engine
// Filters the session history array based on the active chip and search query
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

// Loads a page of persisted audit-log history from the backend and appends
// it to the in-memory session history (which otherwise starts empty on
// every page refresh).
async function loadPersistedHistory(offset = 0) {
  try {
    const data = await fetchHistory(HISTORY_PAGE_SIZE, offset);
    const mapped = (data.entries || []).map((e, i) => ({
      ...e,
      _idx:       sessionHistory.length + i,
      _time:      e.timestamp ? formatDateTime(new Date(e.timestamp * 1000).toISOString()) : '--',
      _persisted: true, // summary-only row from the audit log — no full report to reload
    }));
    sessionHistory.push(...mapped);
    historyOffset = offset + (data.entries || []).length;
    historyTotal  = data.total || 0;
    applyHistoryFilters();
    updateLoadMoreVisibility();
  } catch (err) {
    console.warn('Failed to load persisted history:', err);
  }
}

// Shows the "Load more" button only while more persisted history remains.
function updateLoadMoreVisibility() {
  const btn = document.getElementById('load-more-btn');
  btn.style.display = historyOffset < historyTotal ? 'block' : 'none';
}

document.getElementById('load-more-btn').addEventListener('click', () => loadPersistedHistory(historyOffset));

// Search bar listener
document.getElementById('history-search').addEventListener('input', (e) => {
    searchQuery = e.target.value;
    applyHistoryFilters();
});

// Filter chip listeners
document.querySelectorAll('.filter-chip').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        activeFilter = e.target.dataset.filter;
        applyHistoryFilters();
    });
});

// Batch mode toggle — switches the file input between single and multi-select
batchModeChk.addEventListener('change', () => {
  fileInput.multiple = batchModeChk.checked;
  currentFile  = null;
  currentFiles = [];
  resetResults();
  actionBtn.disabled    = true;
  actionBtn.textContent = 'AWAITING EVIDENCE';
});

// File Ingestion Listeners
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => {
  if (batchModeChk.checked) handleFiles(e.target.files);
  else handleFile(e.target.files[0]);
});

// Drag and drop UX handling
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if (batchModeChk.checked) handleFiles(e.dataTransfer.files);
  else handleFile(e.dataTransfer.files[0]);
});

// Processes a set of files for batch verification
function handleFiles(fileList) {
  const files = Array.from(fileList || []);
  if (files.length === 0) return;
  currentFile  = null;
  currentFiles = files;

  resetResults();
  actionBtn.disabled    = false;
  actionBtn.textContent = `VERIFY BATCH: ${files.length} file${files.length === 1 ? '' : 's'}`;
}

// Processes the raw file, sets up the media preview, and resets UI state
function handleFile(file) {
  if (!file) return;
  currentFile = file;
  
  // Clear old memory cache to prevent UI slow down
  if (objectUrlCache) URL.revokeObjectURL(objectUrlCache);
  objectUrlCache = URL.createObjectURL(file);
  
  const isVid = file.type.startsWith('video/');
  previewImg.style.display = 'none';
  videoPreview.style.display = 'none';
  
  // Route media to the correct HTML tag
  if (isVid) { 
    videoPreview.src = objectUrlCache; 
    videoPreview.style.display = 'block'; 
  } else { 
    previewImg.src = objectUrlCache; 
    previewImg.style.display = 'block'; 
  }

  // Update action button text based on active mode
  const label = currentMode === 'verify' ? 'RUN VERIFICATION' : 'APPLY SIGNATURE';
  actionBtn.disabled   = false;
  actionBtn.textContent= `${label}: ${file.name.length > 20 ? file.name.slice(0,18)+'…' : file.name}`;
  resetResults();
}

// Operation Mode Switching (Verify vs. Sign)
[modeVerify, modeSigning].forEach(btn => {
  btn.addEventListener('click', () => {
    currentMode = btn.dataset.mode;
    
    // Toggle active UI classes
    modeVerify.classList.toggle('active', currentMode === 'verify');
    modeSigning.classList.toggle('active', currentMode === 'sign');
    signOpts.classList.toggle('visible', currentMode === 'sign');
    
    // Update button dynamically if a file is already loaded
    if (currentFile) {
      const label = currentMode === 'verify' ? 'RUN VERIFICATION' : 'APPLY SIGNATURE';
      actionBtn.textContent = `${label}: ${currentFile.name}`;
    }
    resetResults();
  });
});

// Main Execution Pipeline
actionBtn.addEventListener('click', async () => {
  const batchMode = batchModeChk.checked;
  if (batchMode) {
    if (currentFiles.length === 0) return;
  } else if (!currentFile) {
    return;
  }
  setLoading(true);
  resetResults();

  try {
    if (batchMode) {
      await runBatchVerify();
    } else if (currentMode === 'verify') {
      await runVerify();
    } else {
      await runSign();
    }
  } catch (err) {
    // Handle total pipeline failure (e.g. backend server is down)
    document.getElementById('warn-sys-text').textContent = `PIPELINE ERROR: ${err.message}`;
    document.getElementById('warn-sys-error').classList.add('visible');
    
    // Hide standard result panels since the pipeline failed
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

// 1. Verification Flow
async function runVerify() {
  const useTrustList = document.getElementById('use-trust-list').checked;
  const data = await verifyFile(currentFile, null, useTrustList);

  if (data._rateLimited) {
    document.getElementById('warn-sys-text').textContent = 'Rate limit reached — please wait before retrying.';
    document.getElementById('warn-sys-error').classList.add('visible');
    showResults();
    return;
  }

  // Trigger all UI rendering functions
  renderVerdict(data);
  renderMetrics(data);
  renderCertPanel(data);
  renderTimeline(data);
  renderSequencePanel(data); // Injects the custom omission detection UI
  renderAiPolicy(data);
  renderRawJson(data.raw_manifest_json);
  showResults();

  // Log to session history
  const entry = {
    ...data,
    _idx:  sessionHistory.length,
    _time: formatDateTime(new Date().toISOString()),
  };
  sessionHistory.unshift(entry);
  applyHistoryFilters();
}

// Batch Verification Flow
async function runBatchVerify() {
  const useTrustList = document.getElementById('use-trust-list').checked;
  const data = await verifyBatch(currentFiles, useTrustList);

  const listEl = document.getElementById('batch-results-list');
  listEl.innerHTML = data.results.map(r => {
    const statusClass = r.status || 'NO_MANIFEST';
    const shaShort = r.file_sha256 ? r.file_sha256.slice(0, 12) : '--';
    return `
      <div class="hist-item ${escapeHtml(statusClass)}">
        <div class="hist-top">
          <span class="hist-badge-text ${escapeHtml(statusClass)}">${escapeHtml(statusClass.replace('_', ' '))}</span>
          <span class="hist-name" title="${escapeHtml(r.filename)}">${escapeHtml(r.filename)}</span>
        </div>
        <div class="hist-bot">
          <span class="hist-time">${escapeHtml(shaShort)}</span>
          <span class="hist-meta">${escapeHtml(r.processing_time_sec ?? 0)}s</span>
        </div>
      </div>`;
  }).join('');

  document.getElementById('idle-state').style.display = 'none';
  document.getElementById('result-state').classList.add('visible');
  document.getElementById('batch-results-panel').classList.add('visible');

  data.results.forEach(r => {
    sessionHistory.unshift({ ...r, _idx: sessionHistory.length, _time: formatDateTime(new Date().toISOString()) });
  });
  applyHistoryFilters();
}

// 2. Signing Flow
async function runSign() {
  const opts = {
    action:          document.getElementById('sign-action').value,
    softwareAgent:   document.getElementById('sign-agent').value.trim() || null,
    noAiTraining:    document.getElementById('sign-no-ai').checked,
    claimGenerator:  'C2PA-Veritas/2.0',
    batchId:             document.getElementById('sign-batch-id').value.trim() || null,
    batchExpectedCount:  parseInt(document.getElementById('sign-batch-expected').value, 10) || null,
  };

  const result = await signFile(currentFile, opts);
  signedBlob     = result.blob;
  signedFilename = result.filename;

  // Show the download export bar
  const dlBar = document.getElementById('download-bar');
  dlBar.classList.add('visible');
  showResults();

  // Log the signature event to history
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

// Download newly signed asset
document.getElementById('dl-btn').addEventListener('click', () => {
  if (!signedBlob) return;
  const url = URL.createObjectURL(signedBlob);
  const a   = document.createElement('a');
  a.href = url; a.download = signedFilename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000); // Cleanup memory
});

// UI Render Helpers

// Renders the main Trust Ring and Evidence Summary logic
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

  // Calculate dynamic fill for the SVG trust ring based on status
  let fillPercent = 0;
  if (d.status === 'VALID' || d.status === 'REMOTE_MANIFEST') fillPercent = 100;
  else if (d.status === 'PARTIAL') fillPercent = 50;
  else if (d.status === 'INVALID') fillPercent = 100; // Complete red ring
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

  // Extract total assertions from the raw manifest to populate the KPI strip
  const mCount = d.manifests?.length || 0;
  let aCount = 0;
  if(d.raw_manifest_json && d.raw_manifest_json.manifests) {
      aCount = Object.keys(d.raw_manifest_json.manifests).reduce((acc, k) => acc + (d.raw_manifest_json.manifests[k].assertions?.length || 0), 0);
  }
  
  document.getElementById('kpi-manifests').textContent  = mCount;
  document.getElementById('kpi-assertions').textContent = aCount;
  document.getElementById('kpi-certs').textContent      = (d.active_manifest && d.active_manifest.issuer) ? '1' : '0';
  document.getElementById('kpi-time').textContent       = `${d.processing_time_sec}s`;

  // UI CLEANUP
  let signalText = d.signal || 'None';
  if (signalText.includes('—')) signalText = signalText.split('—')[0].trim();
  else if (signalText.includes('-')) signalText = signalText.split('-')[0].trim();
  document.getElementById('sum-signal').textContent = signalText;

  document.getElementById('sum-embedded').textContent = d.is_embedded ? 'Embedded' : 'Detached';
  
  // Format the SHA fingerprint with a copy button
  const fullSha = d.file_sha256 || '';
  if (fullSha) {
    const shortSha = fullSha.slice(0, 16);
    document.getElementById('sum-sha').innerHTML = `${shortSha} <button class="copy-btn" onclick="navigator.clipboard.writeText('${fullSha}')" title="Copy Full SHA"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>`;
  } else {
    document.getElementById('sum-sha').textContent = 'None';
  }

  // Toggle contextual warning banners
  document.getElementById('warn-no-manifest').classList.toggle('visible', d.status === 'NO_MANIFEST');
  document.getElementById('warn-invalid').classList.toggle('visible',     d.status === 'INVALID');
  document.getElementById('warn-partial').classList.toggle('visible',     d.status === 'PARTIAL');
  document.getElementById('warn-remote').classList.toggle('visible',      d.status === 'REMOTE_MANIFEST');
}

// Renders the Edits Ledger and basic file metrics
function renderMetrics(d) {
  const m = d.active_manifest;
  document.getElementById('mc-type').textContent = d.media_type || 'N/A';
  document.getElementById('mc-alg').textContent  = m?.signing_algorithm || 'N/A';
  
  // Build the scrolling mini-ledger for Historical Actions
  const tl = d.edit_timeline || [];
  const mcActions = document.getElementById('mc-actions');
  if (tl.length === 0) {
     mcActions.innerHTML = `<span style="font-size:15px; font-weight:700; color:var(--text-hi);">0</span>`;
  } else {
     let listHTML = tl.map(a => {
         const actionName = escapeHtml(a.action.split('.').pop().toUpperCase());
         const timeStr = escapeHtml(a.timestamp ? formatDateTime(a.timestamp) : 'Unknown Date');
         const softStr = escapeHtml(a.software_agent ? (a.software_agent.length > 18 ? a.software_agent.slice(0, 18) + '…' : a.software_agent) : 'Unknown Software');

         return `
         <div style="font-size:10px; padding:6px 0; border-bottom:1px solid var(--border); display:flex; flex-direction:column; gap:4px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="color:var(--cyan); font-weight:700; font-family:var(--mono);">${actionName}</span>
                <span style="color:var(--text-dim); font-size:8px; font-family:var(--mono);">${timeStr}</span>
            </div>
            <span style="color:var(--text-mid); font-size:9px;" title="${escapeHtml(a.software_agent)}">▶ ${softStr}</span>
         </div>`;
     }).join('');
     mcActions.innerHTML = `<div class="mini-ledger" style="display:flex; flex-direction:column; max-height: 80px; overflow-y:auto; padding-right:4px;">${listHTML}</div>`;
  }
}

// CUSTOM LOGIC: Sequence Completeness (Omission Detection)
function renderSequencePanel(d) {
  const panel = document.getElementById('sequence-panel');
  const grid = document.getElementById('sequence-grid');
  const warn = document.getElementById('warn-omission');
  
  // Check if the backend detected a sequence invariant block in the manifest
  const seq = d.active_manifest?.sequence_invariants || d.sequence_invariants;
  
  if (!seq) {
    panel.classList.remove('visible');
    warn.classList.remove('visible');
    return;
  }

  // Detect omission if actual assets present don't match the expected batch size
  const isOmitted = seq.actual_count < seq.expected_count;
  
  if (isOmitted) {
      warn.classList.add('visible');
      // Override the main trust ring to explicitly flag the omission attack
      document.getElementById('trust-title').textContent = 'SEQUENCE BROKEN';
      document.getElementById('trust-title').className = 'trust-title title-INVALID';
      document.getElementById('gauge-fill').className.baseVal = 'gauge-fill INVALID';
      document.getElementById('status-icon').innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
  }

  // Populate the invariant data grid
  grid.innerHTML = `
    <div class="data-item">
      <span class="data-label">Sequence ID (Batch Hash)</span>
      <span class="data-val" style="color:var(--cyan); text-transform:none;">${escapeHtml(seq.batch_id || 'N/A')}</span>
    </div>
    <div class="data-item ${isOmitted ? 'val-notAllowed' : 'val-allowed'}">
      <span class="data-label">Asset Completeness</span>
      <span class="data-val">${seq.actual_count} / ${seq.expected_count} Present</span>
    </div>
    <div class="data-item ${isOmitted ? 'val-notAllowed' : 'val-allowed'}">
      <span class="data-label">Audit Log Cross-Check</span>
      <span class="data-val">${isOmitted ? 'INCOMPLETE' : 'COMPLETE'}</span>
    </div>
  `;

  panel.classList.add('visible');
}

// Renders the X.509 Certificate details panel
function renderCertPanel(d) {
  const m = d.active_manifest;
  if (!m || (!m.issuer && !m.cert_serial)) return;

  const panel = document.getElementById('cert-panel');
  const card  = document.getElementById('cert-card');
  
  // Flag known development certificates to warn analysts
  const isDev = m.issuer?.includes('Veritas') || m.issuer?.includes('Dev') || m.issuer?.includes('self');
  if (isDev) document.getElementById('warn-dev-cert').classList.add('visible');

  let fp = d.file_sha256 ? d.file_sha256.slice(0,16).toUpperCase() : 'N/A';

  card.innerHTML = `
    <div class="cert-grid">
      <div class="cg-item"><span class="cg-label">Issuer</span><span class="cg-val" style="color:var(--blue)">${escapeHtml(m.issuer || 'Unknown')}</span></div>
      <div class="cg-item"><span class="cg-label">Subject</span><span class="cg-val">${escapeHtml(m.issuer || 'Self-Signed')}</span></div>
      <div class="cg-item"><span class="cg-label">Algorithm</span><span class="cg-val">${escapeHtml(m.signing_algorithm || 'N/A')}</span></div>
      <div class="cg-item"><span class="cg-label">Fingerprint</span><span class="cg-val">${fp}...</span></div>
      <div class="cg-item" style="grid-column: span 2"><span class="cg-label">Serial Number</span><span class="cg-val" style="color:var(--text-dim)">${escapeHtml(m.cert_serial || 'N/A')}</span></div>
    </div>
  `;
  panel.classList.add('visible');
}

// Renders the interactive Provenance Graph timeline
function renderTimeline(d) {
  const tl = d.edit_timeline;
  if (!tl || tl.length === 0) return;

  const panel = document.getElementById('timeline-panel');
  const graph = document.getElementById('pg-container');
  const drawer= document.getElementById('pg-drawer');
  drawer.classList.remove('visible'); // Close drawer on new load

  // Global object to map graph nodes to their raw metadata payload for the drawer
  window.__timelineMeta = {
      origin: { title: "Asset Origin", software: tl[0]?.software_agent || "Unknown", time: tl[0]?.timestamp || "Unknown", details: "Initial asset generation or capture." }
  };
  
  const formatSoft = (soft) => {
      if(!soft) return "Unknown";
      return soft.length > 20 ? soft.substring(0, 18) + '...' : soft;
  };

  // Build the Origin Node
  let nodesHTML = `
    <div class="pg-node origin" data-step="origin">
      <div class="pg-icon"><svg viewBox="0 0 24 24" fill="none" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg></div>
      <span class="pg-label">Origin</span>
      <span class="pg-sub" style="color:var(--text-mid)">${escapeHtml(formatSoft(tl[0]?.software_agent))}</span>
      <span class="pg-sub" style="opacity:0.6">${escapeHtml(formatDateTime(tl[0]?.timestamp))}</span>
    </div>
  `;

  // Dynamically inject all subsequent edits
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
          <span class="pg-label">${escapeHtml(action.action.split('.').pop().toUpperCase())}</span>
          <span class="pg-sub" style="color:var(--text-mid)">${escapeHtml(formatSoft(action.software_agent))}</span>
          <span class="pg-sub" style="opacity:0.6">${escapeHtml(formatDateTime(action.timestamp))}</span>
        </div>
      `;
    }
  });

  // Inject the Cryptographic Signature node
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
        <span class="pg-sub" style="color:var(--text-mid)">${escapeHtml(formatSoft(d.active_manifest?.issuer))}</span>
        <span class="pg-sub" style="opacity:0.6">--</span>
      </div>
    `;
  }

  // Inject the Final Verification Engine node
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

  // Bind interactive click handlers to open metadata drawer below graph
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

// Parses and renders the AI Training assertion policies
function renderAiPolicy(d) {
  const policy = d.active_manifest?.ai_training_policy;
  if (!policy || Object.keys(policy).length === 0) return;

  const panel = document.getElementById('ai-policy-panel');
  const grid  = document.getElementById('policy-grid');

  // Human-readable map for the technical assertion keys
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
        <span class="data-label">${escapeHtml(LABEL_MAP[key] || key.split('.').pop())}</span>
        <span class="data-val">${escapeHtml(useLabel)}</span>
      </div>
    `;
  }).join('');

  panel.classList.add('visible');
}

// Raw Code JSON Viewer Logic
function renderRawJson(json) {
  if (!json) {
    document.getElementById('manifest-size').textContent = '0 KB';
    document.getElementById('json-content').innerHTML = '';
    window.__currentRawJson = null;
    return;
  }
  
  // Format the JSON data into a clean, pretty-printed string
  const strJson = JSON.stringify(json, null, 2);
  const sizeKB = (new Blob([strJson]).size / 1024).toFixed(1);
  document.getElementById('manifest-size').textContent = `${sizeKB} KB`;
  window.__currentRawJson = strJson;

  // Perform basic syntax highlighting using Regex and create line numbers
  const lines = strJson.split('\n');
  let html = '';
  lines.forEach((line, index) => {
    // Escape &, <, > before syntax-highlighting — the raw manifest is fully
    // attacker-controlled (issuer names, titles, custom assertions, etc.),
    // and this is rendered via innerHTML below. Quotes are left intact since
    // the highlighter regex matches on literal " characters.
    const safeLine = escapeHtmlKeepQuotes(line);
    let highlighted = safeLine.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
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

// JSON Action Listeners (Expand, Copy, Download)
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

// Session History State Logic
// Allows an analyst to click an old file scan in the sidebar and reload the UI state
document.getElementById('history-list').addEventListener('click', e => {
  const item = e.target.closest('.hist-item');
  if (!item) return;
  const idx   = parseInt(item.dataset.idx);
  const entry = sessionHistory.find(h => h._idx === idx);
  // Persisted (backend-loaded) rows only carry audit-log summary fields, not
  // the full report needed to redraw the detail panels — same as SIGNED rows.
  if (!entry || entry.status === 'SIGNED' || entry._persisted) return;

  // Conditionally restore the media preview window
  if (entry.filename && currentFile && currentFile.name === entry.filename) {
     const isVid = entry.media_type && entry.media_type.startsWith('video');
     if (isVid) document.getElementById('video-preview').style.display = 'block';
     else document.getElementById('preview-img').style.display = 'block';
  }
  
  // Re-run all rendering logic for the old data object
  resetResults();
  renderVerdict(entry);
  renderMetrics(entry);
  renderCertPanel(entry);
  renderTimeline(entry);
  renderSequencePanel(entry);
  renderAiPolicy(entry);
  renderRawJson(entry.raw_manifest_json);
  showResults();
});

// Downloads the persisted audit log as CSV
document.getElementById('export-csv-btn').addEventListener('click', async () => {
  try {
    const blob = await exportHistoryCsv();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'audit_log.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch (err) {
    console.error('CSV export failed:', err);
  }
});

// Wipes history completely
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

// UI Lifecycle Management Utilities

// Swaps visibility from the idle dashboard to the active results wrapper
function showResults() {
  document.getElementById('preview-wrapper').style.display = 'flex';
  document.getElementById('executive-panel').style.display = 'flex';
  document.querySelector('.kpi-strip').style.display = 'flex';
  document.querySelector('.metrics-row').style.display = 'grid';
  document.getElementById('json-panel-container').classList.add('visible');
  
  document.getElementById('idle-state').style.display = 'none';
  document.getElementById('result-state').classList.add('visible');
}

// Clears DOM and hides all panels prior to a new execution
function resetResults() {
  ['warn-no-manifest','warn-invalid','warn-partial','warn-remote', 'warn-sys-error', 'warn-dev-cert', 'warn-omission'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('visible');
  });
  
  ['cert-panel', 'timeline-panel', 'sequence-panel', 'ai-policy-panel', 'download-bar', 'batch-results-panel'].forEach(id => {
    document.getElementById(id).classList.remove('visible');
  });
  
  document.getElementById('pg-drawer').classList.remove('visible');
  document.getElementById('json-toggle').classList.remove('open');
  document.getElementById('json-viewer').classList.remove('open');
  document.getElementById('json-expand-text').textContent = 'Expand ▼';
  document.getElementById('result-state').classList.remove('visible');
  
  // Reset the Trust Ring SVG animation
  document.getElementById('gauge-fill').style.strokeDashoffset = 295.3;
  document.getElementById('status-icon').innerHTML = "";
  
  // Clear memory of previously signed blobs
  signedBlob = null;
  window.__currentRawJson = null;
}

// Controls action button UI during asynchronous API calls
function setLoading(on) {
  actionBtn.disabled = on;
  if (!on) {
    clearInterval(loadingInterval);
    if (batchModeChk.checked) {
      actionBtn.textContent = `VERIFY BATCH: ${currentFiles.length} file${currentFiles.length === 1 ? '' : 's'}`;
    } else if (currentFile) {
      const label = currentMode === 'verify' ? 'RUN VERIFICATION' : 'APPLY SIGNATURE';
      actionBtn.textContent = `${label}: ${currentFile.name.length > 20 ? currentFile.name.slice(0,18)+'…' : currentFile.name}`;
    }
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

// Initialize history view on page load, seeded from the persisted audit log
loadPersistedHistory(0);
