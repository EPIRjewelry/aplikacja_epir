import { describe, it, expect } from 'vitest';
import {
  SHOPIFYQL_PRESET_DEFINITIONS,
  SHOPIFYQL_PRESET_IDS,
  interpretShopifyqlToolPayload,
  isShopifyqlPresetId,
} from '../src/internal-analytics-tools';

describe('internal-analytics-tools / ShopifyQL presets', () => {
  it('exposes a small fixed whitelist', () => {
    expect(SHOPIFYQL_PRESET_IDS.length).toBe(6);
    expect(SHOPIFYQL_PRESET_DEFINITIONS.length).toBe(6);
    expect(SHOPIFYQL_PRESET_IDS).toContain('S1_SALES_SESSIONS_DAILY_30D');
    expect(SHOPIFYQL_PRESET_IDS).toContain('S6_SALES_MONTHLY_13M');
  });

  it('isShopifyqlPresetId rejects arbitrary strings', () => {
    expect(isShopifyqlPresetId('S1_SALES_SESSIONS_DAILY_30D')).toBe(true);
    expect(isShopifyqlPresetId('DROP TABLE')).toBe(false);
  });
});

describe('interpretShopifyqlToolPayload', () => {
  const metaDay = { timeGrain: 'day' as const, maxLookbackDays: 7 };

  it('returns ShopifyQLPresetExecutionError when parseErrors is non-empty (no masked success)', () => {
    const r = interpretShopifyqlToolPayload(
      'S5_SALES_SESSIONS_DAILY_7D',
      'FROM sales SHOW day',
      {
        parseErrors: [{ code: 'PARSE', message: 'example' }],
        tableData: { columns: [], rows: [{ day: '2025-01-01' }] },
      },
      metaDay,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.message).toBe('ShopifyQLPresetExecutionError');
      expect(r.error.code).toBe(-32002);
      expect(r.error.presetId).toBe('S5_SALES_SESSIONS_DAILY_7D');
      expect(r.error.rawQuery).toBe('FROM sales SHOW day');
      expect(Array.isArray(r.error.parseErrors)).toBe(true);
      expect(r.error.parseErrors.length).toBeGreaterThan(0);
    }
  });

  it('returns success with empty:true when rows empty and parseErrors empty', () => {
    const r = interpretShopifyqlToolPayload(
      'S5_SALES_SESSIONS_DAILY_7D',
      'FROM sales SHOW day',
      { parseErrors: [], tableData: { columns: [{ name: 'day' }], rows: [] } },
      metaDay,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.empty).toBe(true);
      expect(r.result.rowCount).toBe(0);
      expect(r.result.source).toBe('shopify_shopifyql');
    }
  });

  it('treats missing parseErrors as none (valid empty)', () => {
    const r = interpretShopifyqlToolPayload(
      'S1_SALES_SESSIONS_DAILY_30D',
      'FROM sales',
      { tableData: { rows: [] } },
      { timeGrain: 'day', maxLookbackDays: 30 },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.empty).toBe(true);
    }
  });
});
