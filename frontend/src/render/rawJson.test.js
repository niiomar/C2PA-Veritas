import { beforeEach, describe, expect, it } from 'vitest';
import { renderRawJson } from './rawJson.js';

function mountFixture() {
  document.body.innerHTML = `
    <span id="manifest-size"></span>
    <div id="json-content"></div>
  `;
}

describe('renderRawJson', () => {
  beforeEach(mountFixture);

  it('clears the panel and returns early for null input', () => {
    renderRawJson(null);
    expect(document.getElementById('manifest-size').textContent).toBe('0 KB');
    expect(document.getElementById('json-content').innerHTML).toBe('');
  });

  it('renders a plain manifest with syntax-highlighting spans', () => {
    renderRawJson({ active_manifest: 'urn:c2pa:abc', title: 'photo.jpg' });
    const html = document.getElementById('json-content').innerHTML;
    expect(html).toContain('json-key');
    expect(html).toContain('json-string');
  });

  it('neutralizes a script-tag payload embedded in manifest content (the XSS this panel was fixed for)', () => {
    // Renders the ENTIRE raw manifest — this is the widest attack surface,
    // since it needs no crafted filename, just any string field in the
    // manifest (e.g. a malicious issuer or title from an untrusted file).
    const malicious = { title: '<img src=x onerror=alert(document.domain)>' };
    renderRawJson(malicious);

    const container = document.getElementById('json-content');
    expect(container.innerHTML).not.toContain('<img src=x onerror=');
    expect(container.querySelectorAll('img').length).toBe(0);
    // The escaped text should still be visible as inert text content.
    expect(container.textContent).toContain('<img src=x onerror=alert(document.domain)>');
  });

  it('preserves quote characters so the highlighter still tags JSON keys/strings correctly', () => {
    renderRawJson({ issuer: 'C2PA-Veritas Dev Signer' });
    const html = document.getElementById('json-content').innerHTML;
    expect(html).toContain('"issuer"');
    expect(html).toContain('"C2PA-Veritas Dev Signer"');
  });

  it('sets the manifest size label and the raw JSON clipboard cache', () => {
    renderRawJson({ a: 1 });
    expect(document.getElementById('manifest-size').textContent).toMatch(/KB$/);
    expect(window.__currentRawJson).toContain('"a": 1');
  });
});
