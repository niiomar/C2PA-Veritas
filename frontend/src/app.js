import './styles.css';
import { renderSidebar }   from './components/sidebar.js';
import { renderWorkspace } from './components/workspace.js';
import { updateHistory }   from './components/history.js';
import { verifyFile, signFile, verifyBatch, exportHistoryCsv, fetchHistory, fetchTrustListStatus, uploadTrustList, refreshTrustList } from './utils/api.js';
import { escapeHtml } from './utils/escape.js';
import { formatDateTime } from './utils/format.js';
import { renderVerdict }        from './render/verdict.js';
import { renderMetrics }        from './render/metrics.js';
import { renderSequencePanel }  from './render/sequencePanel.js';
import { renderCertPanel }      from './render/certPanel.js';
import { renderTimeline }       from './render/timeline.js';
import { renderAiPolicy }       from './render/aiPolicy.js';
import { renderRawJson }        from './render/rawJson.js';

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

// Dismiss buttons on warning banners (moved off inline onclick= so a strict
// script-src CSP can be enforced without an 'unsafe-inline' carve-out).
document.querySelectorAll('.banner-close').forEach(btn => {
  btn.addEventListener('click', () => btn.parentElement.classList.remove('visible'));
});

// Copy-SHA button is re-created on every scan (innerHTML), so it's wired via
// delegation on a static ancestor rather than addEventListener at render time.
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.copy-btn');
  if (btn && btn.dataset.sha) navigator.clipboard.writeText(btn.dataset.sha);
});

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

// Trust List Panel — status display, manual PEM upload, and refresh.
async function refreshTrustListStatusDisplay() {
  const el = document.getElementById('trust-list-status');
  try {
    const s = await fetchTrustListStatus();
    if (!s.cache_present) {
      el.textContent = s.configured_url_present
        ? 'No cached bundle yet — click Refresh to fetch from TRUST_LIST_URL.'
        : 'No trust list cached. Upload a PEM bundle or configure TRUST_LIST_URL.';
    } else {
      const staleness = s.stale ? ' (stale)' : '';
      el.textContent = `${s.anchor_count} anchor${s.anchor_count === 1 ? '' : 's'} cached from ${s.source}${staleness}`;
    }
  } catch {
    el.textContent = 'Failed to load trust list status.';
  }
}

document.getElementById('trust-list-refresh-btn').addEventListener('click', async () => {
  const el = document.getElementById('trust-list-status');
  el.textContent = 'Refreshing…';
  try {
    await refreshTrustList();
  } catch (err) {
    el.textContent = err.message;
    return;
  }
  refreshTrustListStatusDisplay();
});

document.getElementById('trust-list-upload-btn').addEventListener('click', () => {
  document.getElementById('trust-list-file-input').click();
});

document.getElementById('trust-list-file-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const el = document.getElementById('trust-list-status');
  el.textContent = 'Uploading…';
  try {
    await uploadTrustList(file);
  } catch (err) {
    el.textContent = err.message;
    return;
  }
  refreshTrustListStatusDisplay();
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

  // Log each result to session history first, capturing each entry's _idx
  // so the rendered list below can link back to it for click-to-detail.
  const idxByResult = data.results.map(r => {
    const idx = sessionHistory.length;
    sessionHistory.unshift({ ...r, _idx: idx, _time: formatDateTime(new Date().toISOString()) });
    return idx;
  });

  const listEl = document.getElementById('batch-results-list');
  listEl.innerHTML = data.results.map((r, i) => {
    const statusClass = r.status || 'NO_MANIFEST';
    const shaShort = r.file_sha256 ? r.file_sha256.slice(0, 12) : '--';
    return `
      <div class="hist-item ${escapeHtml(statusClass)}" data-idx="${idxByResult[i]}" style="cursor:pointer;">
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

document.getElementById('json-dl-btn').addEventListener('click', () => {
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
// Loads a past scan (from the sidebar session log or a batch result) into
// the full detail view — shared by both click handlers below.
function renderEntryDetail(entry) {
  // Conditionally restore the media preview window
  if (entry.filename && currentFile && currentFile.name === entry.filename) {
     const isVid = entry.media_type && entry.media_type.startsWith('video');
     if (isVid) document.getElementById('video-preview').style.display = 'block';
     else document.getElementById('preview-img').style.display = 'block';
  }

  resetResults();
  renderVerdict(entry);
  renderMetrics(entry);
  renderCertPanel(entry);
  renderTimeline(entry);
  renderSequencePanel(entry);
  renderAiPolicy(entry);
  renderRawJson(entry.raw_manifest_json);
  showResults();
}

// Allows an analyst to click an old file scan in the sidebar and reload the UI state
document.getElementById('history-list').addEventListener('click', e => {
  const item = e.target.closest('.hist-item');
  if (!item) return;
  const idx   = parseInt(item.dataset.idx);
  const entry = sessionHistory.find(h => h._idx === idx);
  // Persisted (backend-loaded) rows only carry audit-log summary fields, not
  // the full report needed to redraw the detail panels — same as SIGNED rows.
  if (!entry || entry.status === 'SIGNED' || entry._persisted) return;
  renderEntryDetail(entry);
});

// Allows an analyst to click a row in the batch results list to load its full detail view.
document.getElementById('batch-results-list').addEventListener('click', e => {
  const item = e.target.closest('.hist-item');
  if (!item) return;
  const idx   = parseInt(item.dataset.idx);
  const entry = sessionHistory.find(h => h._idx === idx);
  if (!entry) return;
  renderEntryDetail(entry);
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

  // Single-file-only panels are shown via inline style by showResults(), not
  // via a CSS class, so they must be explicitly hidden here too — otherwise
  // switching into batch mode (which never calls showResults()) leaves the
  // previous single-file trust ring/KPI strip/evidence summary visible
  // underneath the new batch results list.
  document.getElementById('preview-wrapper').style.display = 'none';
  document.getElementById('executive-panel').style.display = 'none';
  document.querySelector('.kpi-strip').style.display = 'none';
  document.querySelector('.metrics-row').style.display = 'none';
  document.getElementById('json-panel-container').classList.remove('visible');

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
refreshTrustListStatusDisplay();
