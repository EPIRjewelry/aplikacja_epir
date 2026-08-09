import { describe, expect, it } from 'vitest';
import {
  hashEmailForCustomerMatch,
  normalizeEmailForCustomerMatch,
} from './customer-match-pii';

describe('normalizeEmailForCustomerMatch', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmailForCustomerMatch('  User@Gmail.COM  ')).toBe('user@gmail.com');
  });

  it('strips gmail dots', () => {
    expect(normalizeEmailForCustomerMatch('User.A.B@gmail.com')).toBe('userab@gmail.com');
  });

  it('strips gmail plus tags', () => {
    expect(normalizeEmailForCustomerMatch('user+promo@gmail.com')).toBe('user@gmail.com');
  });
});

describe('hashEmailForCustomerMatch', () => {
  it('returns 64-char hex', async () => {
    const h = await hashEmailForCustomerMatch('user@gmail.com');
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns null for invalid email', async () => {
    expect(await hashEmailForCustomerMatch('')).toBeNull();
    expect(await hashEmailForCustomerMatch('not-an-email')).toBeNull();
  });
});
