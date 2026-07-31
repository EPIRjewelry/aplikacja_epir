/**
 * Smoke wiring: whitelist Q* + allowlist D1 for Cursor Kustosz / epir-data-ops.
 * Run: npm test -w @epir/mcp-data-ops
 */
import { describe, expect, it } from 'vitest';
import { D1_DATABASES, WAREHOUSE_QUERY_IDS, sampleColumnsFor } from '../src/config.js';

describe('epir-data-ops config (Kustosz wiring)', () => {
  it('exposes Q1–Q10 whitelist', () => {
    expect(WAREHOUSE_QUERY_IDS).toHaveLength(10);
    expect(WAREHOUSE_QUERY_IDS[0]).toBe('Q1_CONVERSION_CHAT');
    expect(WAREHOUSE_QUERY_IDS).toContain('Q3_TOP_CHAT_QUESTIONS');
    expect(WAREHOUSE_QUERY_IDS).toContain('Q9_TOOL_USAGE');
  });

  it('allows operator_daily_reports without message content sample cols', () => {
    const allowed = D1_DATABASES.ai_assistant_sessions.allowedTables;
    expect(allowed).toContain('operator_daily_reports');
    const cols = sampleColumnsFor('operator_daily_reports');
    expect(cols).toEqual(['report_date', 'edog_verdict', 'created_at']);
    expect(cols?.join(',')).not.toMatch(/markdown|content/i);
  });

  it('does not sample messages.content', () => {
    const cols = sampleColumnsFor('messages');
    expect(cols).toEqual(['id', 'session_id', 'role', 'timestamp']);
  });
});
