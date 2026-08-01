import { escapeHtmlKeepQuotes } from '../utils/escape.js';

// Raw Code JSON Viewer Logic.
export function renderRawJson(json) {
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
