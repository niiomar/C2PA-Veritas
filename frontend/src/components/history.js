export function renderHistoryItem(entry) {
  const statusClass = entry.status;
  
  const ICONS = {
    VALID: `<svg viewBox="0 0 24 24" fill="none" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
    INVALID: `<svg viewBox="0 0 24 24" fill="none" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
    PARTIAL: `<svg viewBox="0 0 24 24" fill="none" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`,
    NO_MANIFEST: `<svg viewBox="0 0 24 24" fill="none" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
    REMOTE_MANIFEST: `<svg viewBox="0 0 24 24" fill="none" stroke-width="2.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`,
    SIGNED: `<svg viewBox="0 0 24 24" fill="none" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`
  };

  const icon = ICONS[statusClass] || ICONS.NO_MANIFEST;
  const mCount = entry.manifests?.length || 0;
  
  // Format Explicit Status String
  let explicitStatus = statusClass.replace('_', ' ');
  if (statusClass === 'VALID') explicitStatus = "Verified";
  else if (statusClass === 'INVALID') explicitStatus = "Failed";

  return `
    <div class="hist-item ${statusClass}" data-idx="${entry._idx}">
      <div class="hist-top">
        <div class="hist-status-icon ${statusClass}">${icon}</div>
        <span class="hist-badge-text ${statusClass}">${explicitStatus}</span>
        <span class="hist-name" title="${entry.filename}">${entry.filename}</span>
      </div>
      <div class="hist-bot">
        <span class="hist-time">${entry._time}</span>
        <div class="hist-meta">
          <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg> ${mCount} Manifest${mCount === 1 ? '' : 's'}</span>
          <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> ${entry.processing_time_sec || '0.00'}s</span>
        </div>
      </div>
    </div>
  `;
}

export function updateHistory(sessionHistory) {
  const list   = document.getElementById('history-list');
  const total  = document.getElementById('stat-total');
  const valid  = document.getElementById('stat-valid');
  const absent = document.getElementById('stat-absent');

  if (!list) return;

  list.innerHTML = sessionHistory.length
    ? sessionHistory.map(renderHistoryItem).join('')
    : '<p style="font-size:10px;color:var(--text-dim);text-align:center;padding:12px 0;font-family:var(--mono)">NO LOGS AVAILABLE</p>';

  total.textContent  = sessionHistory.length;
  valid.textContent  = sessionHistory.filter(e => e.status === 'VALID').length;
  absent.textContent = sessionHistory.filter(e => e.status === 'NO_MANIFEST').length;
}
