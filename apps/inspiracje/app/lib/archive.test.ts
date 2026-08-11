import {describe, expect, it} from 'vitest';
import {
  getArchiveSnapshot,
  plainTextFromHtml,
  resolveCtaUrl,
} from './archive';

describe('archive helpers', () => {
  it('loads snapshot without price fields', () => {
    const snap = getArchiveSnapshot();
    const raw = JSON.stringify(snap);
    expect(raw).not.toMatch(/"price"/);
    expect(raw).not.toMatch(/"variants"/);
    expect(snap.ctaUrl).toContain('epirbizuteria.pl');
    expect(Array.isArray(snap.items)).toBe(true);
  });

  it('strips html for excerpts', () => {
    expect(plainTextFromHtml('<p>Hello <b>world</b></p>')).toBe('Hello world');
  });

  it('prefers env CTA', () => {
    expect(resolveCtaUrl('https://epirbizuteria.pl/pages/kontakt')).toBe(
      'https://epirbizuteria.pl/pages/kontakt',
    );
  });
});
