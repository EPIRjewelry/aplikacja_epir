import { describe, it, expect } from 'vitest';
import { getR2AnalyticsSql, VALID_QUERY_IDS } from './analytics-queries';

describe('getR2AnalyticsSql', () => {
  it('returns SQL for each whitelist id', () => {
    const env = {};
    for (const id of VALID_QUERY_IDS) {
      const sql = getR2AnalyticsSql(env, id);
      expect(sql).toBeTruthy();
      expect(sql!.length).toBeGreaterThan(20);
      expect(sql).toContain('analytics.');
    }
  });

  it('rejects invalid namespace in env', () => {
    expect(() => getR2AnalyticsSql({ WAREHOUSE_SQL_NAMESPACE: 'bad-ns!' }, 'Q2_CONVERSION_PATHS')).toThrow();
  });

  it('Q4/Q5 target flattened Iceberg columns (not stream url/payload)', () => {
    const env = {};
    const q4 = getR2AnalyticsSql(env, 'Q4_STOREFRONT_SEGMENTATION')!;
    const q5 = getR2AnalyticsSql(env, 'Q5_TOP_PRODUCTS')!;
    expect(q4).toContain('page_url');
    expect(q4).not.toMatch(/\burl\b/);
    expect(q4).not.toContain('payload');
    expect(q5).toContain('page_url');
    expect(q5).toMatch(/page_url AS product_id/);
    expect(q5).toContain('GROUP BY page_url');
    expect(q5).not.toContain('payload');
    expect(q5).not.toMatch(/json_get_str\s*\(\s*payload/);
  });

  it('all whitelist SQL is R2-compatible (no SELECT/COUNT DISTINCT)', () => {
    const env = {};
    for (const id of VALID_QUERY_IDS) {
      const sql = getR2AnalyticsSql(env, id)!;
      expect(sql, id).not.toMatch(/SELECT\s+DISTINCT/i);
      expect(sql, id).not.toMatch(/COUNT\s*\(\s*DISTINCT/i);
    }
    const q1 = getR2AnalyticsSql(env, 'Q1_CONVERSION_CHAT')!;
    expect(q1).toContain('approx_distinct');
    expect(q1).toContain('GROUP BY session_id');
  });
});
