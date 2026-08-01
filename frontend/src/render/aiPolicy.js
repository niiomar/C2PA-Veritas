import { escapeHtml } from '../utils/escape.js';

// Parses and renders the AI Training assertion policies.
export function renderAiPolicy(d) {
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
