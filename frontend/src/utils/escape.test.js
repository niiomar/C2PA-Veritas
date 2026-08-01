import { describe, expect, it } from 'vitest';
import { escapeHtml, escapeHtmlKeepQuotes } from './escape.js';

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml(`& < > " '`)).toBe('&amp; &lt; &gt; &quot; &#39;');
  });

  it('neutralizes a script-tag XSS payload', () => {
    const payload = '<script>alert(document.cookie)</script>';
    const out = escapeHtml(payload);
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });

  it('neutralizes an attribute-breakout payload', () => {
    // e.g. a filename like `x" onerror="alert(1)` used inside title="${...}"
    const payload = `x" onerror="alert(1)`;
    const out = escapeHtml(payload);
    expect(out).not.toContain('"');
  });

  it('is null/undefined-safe', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('passes plain text through unchanged', () => {
    expect(escapeHtml('C2PA-Veritas Dev Root CA')).toBe('C2PA-Veritas Dev Root CA');
  });
});

describe('escapeHtmlKeepQuotes', () => {
  it('escapes & < > but leaves quotes intact', () => {
    const out = escapeHtmlKeepQuotes(`<b>"quoted"</b> & 'single'`);
    expect(out).toBe(`&lt;b&gt;"quoted"&lt;/b&gt; &amp; 'single'`);
  });

  it('still neutralizes a script tag', () => {
    const out = escapeHtmlKeepQuotes('<script>alert(1)</script>');
    expect(out).not.toContain('<script>');
  });

  it('preserves the exact quote characters the JSON syntax highlighter regex depends on', () => {
    const line = '  "issuer": "C2PA-Veritas Dev Signer",';
    const out = escapeHtmlKeepQuotes(line);
    // The highlighter matches on literal " — this must not have become &quot;
    expect((out.match(/"/g) || []).length).toBe(4);
  });
});
