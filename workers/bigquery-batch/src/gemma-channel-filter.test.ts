import { describe, expect, it } from 'vitest';
import { gemmaCustomerMessagesSql } from './gemma-channel-filter';

describe('gemmaCustomerMessagesSql', () => {
  it('includes operator studio channels, storefront_id and NOT EXISTS sessions', () => {
    const sql = gemmaCustomerMessagesSql('m');
    expect(sql).toContain('operator');
    expect(sql).toContain('internal-dashboard');
    expect(sql).toMatch(/storefront_id/);
    expect(sql).toMatch(/NOT EXISTS[\s\S]*sessions/);
    expect(sql.startsWith('(')).toBe(true);
    expect(sql.endsWith(')')).toBe(true);
  });

  it('throws on invalid alias', () => {
    expect(() => gemmaCustomerMessagesSql('m; DROP')).toThrow(/invalid alias/);
    expect(() => gemmaCustomerMessagesSql('')).toThrow(/invalid alias/);
  });
});
