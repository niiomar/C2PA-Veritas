import { escapeHtml } from '../utils/escape.js';
import { formatDateTime } from '../utils/format.js';

// Renders the Edits Ledger and basic file metrics.
export function renderMetrics(d) {
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
