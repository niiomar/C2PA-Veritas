export function renderHistoryItem(entry) {
  const statusClass = entry.status.replace('_', '-');
  return `
    <div class="hist-item" data-idx="${entry._idx}">
      <div class="hist-row">
        <span class="hist-name" title="${entry.filename}">${entry.filename}</span>
        <span class="hist-badge ${entry.status}">${entry.status.replace('_', ' ')}</span>
      </div>
      <div class="hist-meta">${entry._time} · ${entry.media_type}</div>
    </div>
  `;
}

export function updateHistory(sessionHistory) {
  const list  = document.getElementById('history-list');
  const total = document.getElementById('stat-total');
  const valid = document.getElementById('stat-valid');
  const absent= document.getElementById('stat-absent');

  if (!list) return;

  list.innerHTML = sessionHistory.length
    ? sessionHistory.map(renderHistoryItem).join('')
    : '<p style="font-size:11px;color:var(--text-dim);text-align:center;padding:12px 0">No checks yet</p>';

  total.textContent  = sessionHistory.length;
  valid.textContent  = sessionHistory.filter(e => e.status === 'VALID').length;
  absent.textContent = sessionHistory.filter(e => e.status === 'NO_MANIFEST').length;
}
