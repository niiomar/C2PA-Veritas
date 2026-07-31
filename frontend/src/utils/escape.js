// HTML-escaping helpers for values pulled from untrusted sources (uploaded
// filenames, C2PA manifest content) before they're interpolated into
// innerHTML. This app renders arbitrary user-supplied files, so any
// manifest-derived string (issuer, action names, software agent, AI policy
// keys, raw manifest JSON, etc.) must be escaped before reaching the DOM.

// Full escape, safe for both text-node and attribute-value contexts.
export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

// Escapes only the characters that can break out of a text node (&, <, >).
// Quotes are intentionally left intact — used by the raw-JSON syntax
// highlighter, whose regex matches on literal " characters after escaping.
export function escapeHtmlKeepQuotes(str) {
  return String(str ?? '').replace(/[&<>]/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;',
  }[ch]));
}
