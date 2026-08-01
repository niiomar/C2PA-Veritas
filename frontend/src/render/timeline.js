import { escapeHtml } from '../utils/escape.js';
import { formatDateTime } from '../utils/format.js';

// Renders the interactive Provenance Graph timeline.
export function renderTimeline(d) {
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
