import { describe, expect, it } from 'vitest';
import { formatDateTime } from './format.js';

describe('formatDateTime', () => {
  it('returns "--" for falsy input', () => {
    expect(formatDateTime(null)).toBe('--');
    expect(formatDateTime(undefined)).toBe('--');
    expect(formatDateTime('')).toBe('--');
  });

  it('formats a valid ISO string', () => {
    const out = formatDateTime('2026-03-05T12:00:00Z');
    expect(out).toContain('2026');
    expect(out).toContain('Mar');
  });

  it('falls back to the raw string for unparseable input', () => {
    expect(formatDateTime('not-a-date')).toBe('not-a-date');
  });
});
