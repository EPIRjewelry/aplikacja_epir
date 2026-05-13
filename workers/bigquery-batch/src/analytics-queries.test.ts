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
});
