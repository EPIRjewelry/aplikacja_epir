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

  it('Q4/Q5 use page_url only (D-02); no stream url/payload', () => {
    const env = {};
    const q4 = getR2AnalyticsSql(env, 'Q4_STOREFRONT_SEGMENTATION')!;
    const q5 = getR2AnalyticsSql(env, 'Q5_TOP_PRODUCTS')!;
    expect(q4).toContain('page_url');
    expect(q4).not.toMatch(/\burl\b/);
    expect(q4).not.toContain('payload');
    expect(q5).toContain('page_url');
    expect(q5).not.toMatch(/\burl\b/);
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
    expect(q1).toMatch(/CASE\s*\n?\s*WHEN total_pixel_sessions >= sessions_with_chat/i);
    expect(q1).toContain('checkout_completed');
    expect(q1).not.toMatch(/\bUNION\b/i);
    const q9 = getR2AnalyticsSql(env, 'Q9_TOOL_USAGE')!;
    expect(q9).toContain('"name"');
    expect(q9).toContain('AS tool_name');
  });
});

describe('getQ9ToolUsageFallbackSql', () => {
  it('does not reference name column', async () => {
    const { getQ9ToolUsageFallbackSql, isMissingIcebergNameColumnError } = await import('./analytics-queries');
    const sql = getQ9ToolUsageFallbackSql({});
    expect(sql).toContain('missing_iceberg_name_column');
    expect(sql).not.toMatch(/"name"/);
    expect(isMissingIcebergNameColumnError('No field named name. Valid fields are...')).toBe(true);
    expect(isMissingIcebergNameColumnError('other')).toBe(false);
  });
});
