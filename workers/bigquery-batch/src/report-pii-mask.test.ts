import { describe, expect, it } from 'vitest';
import {
  hashNormalizedPii,
  maskPiiInObject,
  normalizeEmailForCustomerMatch,
  normalizePhoneForCustomerMatch,
  sanitizeReportForWorkspaceExport,
  sha256Hex,
} from './report-pii-mask';

describe('normalizeEmailForCustomerMatch', () => {
  it('lowercases and trims whitespace', () => {
    expect(normalizeEmailForCustomerMatch('  User@Gmail.COM  ')).toBe('user@gmail.com');
  });

  it('removes dots in Gmail local part', () => {
    expect(normalizeEmailForCustomerMatch('User.A.B@gmail.com')).toBe('userab@gmail.com');
    expect(normalizeEmailForCustomerMatch('userab@gmail.com')).toBe('userab@gmail.com');
  });

  it('strips + subaddress on Gmail', () => {
    expect(normalizeEmailForCustomerMatch('user+promo@gmail.com')).toBe('user@gmail.com');
    expect(normalizeEmailForCustomerMatch('user@gmail.com')).toBe('user@gmail.com');
  });

  it('applies same rules on googlemail.com', () => {
    expect(normalizeEmailForCustomerMatch('a.b.c+d@googlemail.com')).toBe('abc@googlemail.com');
  });

  it('preserves dots on non-Gmail domains', () => {
    expect(normalizeEmailForCustomerMatch('a.b@test.com')).toBe('a.b@test.com');
    expect(normalizeEmailForCustomerMatch('ab@test.com')).toBe('ab@test.com');
  });
});

describe('normalizePhoneForCustomerMatch', () => {
  it('normalizes E.164 when + is present', () => {
    expect(normalizePhoneForCustomerMatch('+48 501-234-567')).toBe('+48501234567');
    expect(normalizePhoneForCustomerMatch('+48501234567')).toBe('+48501234567');
  });

  it('strips separators without + and does not guess country code', () => {
    expect(normalizePhoneForCustomerMatch('501 234 567')).toBe('501234567');
  });
});

describe('hashNormalizedPii', () => {
  it('sha256Hex is deterministic', async () => {
    const a = await sha256Hex('test@example.com');
    const b = await sha256Hex('test@example.com');
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it('Gmail variants produce identical hashes after normalization', async () => {
    const h1 = await hashNormalizedPii(normalizeEmailForCustomerMatch('User.A.B@gmail.com'));
    const h2 = await hashNormalizedPii(normalizeEmailForCustomerMatch('userab@gmail.com'));
    expect(h1).toBe(h2);
  });

  it('Gmail + tag variants produce identical hashes', async () => {
    const h1 = await hashNormalizedPii(normalizeEmailForCustomerMatch('user+promo@gmail.com'));
    const h2 = await hashNormalizedPii(normalizeEmailForCustomerMatch('user@gmail.com'));
    expect(h1).toBe(h2);
  });

  it('non-Gmail dots yield different hashes', async () => {
    const h1 = await hashNormalizedPii(normalizeEmailForCustomerMatch('a.b@test.com'));
    const h2 = await hashNormalizedPii(normalizeEmailForCustomerMatch('ab@test.com'));
    expect(h1).not.toBe(h2);
  });

  it('E.164 phone variants produce identical hashes', async () => {
    const h1 = await hashNormalizedPii(normalizePhoneForCustomerMatch('+48 501-234-567'));
    const h2 = await hashNormalizedPii(normalizePhoneForCustomerMatch('+48501234567'));
    expect(h1).toBe(h2);
  });

  it('phone without + hashes digits only', async () => {
    const h = await hashNormalizedPii(normalizePhoneForCustomerMatch('501 234 567'));
    const expected = await hashNormalizedPii('501234567');
    expect(h).toBe(expected);
  });
});

describe('maskPiiInObject', () => {
  it('masks known PII keys with field-aware normalization', async () => {
    const masked = await maskPiiInObject({
      event_count: 5,
      customer_id: 'gid://shopify/Customer/123',
      email: '  User.A.B@gmail.com  ',
      phone: '+48 501-234-567',
    });
    expect(masked.event_count).toBe(5);
    expect(String(masked.customer_id)).toMatch(/^sha256:[a-f0-9]{64}$/);
    const emailHash = await hashNormalizedPii('userab@gmail.com');
    expect(masked.email).toBe(emailHash);
    const phoneHash = await hashNormalizedPii('+48501234567');
    expect(masked.phone).toBe(phoneHash);
  });
});

describe('sanitizeReportForWorkspaceExport', () => {
  it('masks emails in markdown and json blocks', async () => {
    const md = [
      '# Raport',
      '',
      'Kontakt: leak@epir.test',
      'Gmail: User.A.B@gmail.com',
      '',
      '```json',
      JSON.stringify({ session_id: 'sess-abc', event_count: 1 }),
      '```',
    ].join('\n');
    const out = await sanitizeReportForWorkspaceExport(md);
    expect(out).not.toContain('leak@epir.test');
    expect(out).not.toContain('User.A.B@gmail.com');
    expect(out).toContain('sha256:');
    expect(out).not.toContain('sess-abc');
    expect(out).toContain('SSOT: D1');
  });
});
