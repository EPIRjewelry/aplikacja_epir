import { describe, it, expect } from 'vitest';
import { yesterdayUtcDate } from './ga4';

describe('yesterdayUtcDate', () => {
  it('returns YYYY-MM-DD', () => {
    const s = yesterdayUtcDate();
    expect(s).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
