import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { mapPixelRowToPipelineRecord } from './pixel-pipeline-record';
import { mapOrderAttributionToPipelineRecord } from './order-pipeline-record';

const schemaPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../specs/schemas/pixel-events-stream.schema.json',
);

function schemaFieldNames(): Set<string> {
  const raw = JSON.parse(readFileSync(schemaPath, 'utf8')) as {
    fields: Array<{ name: string }>;
  };
  return new Set(raw.fields.map((f) => f.name));
}

describe('pixel stream contract', () => {
  it('extended pixel record keys match specs/schemas/pixel-events-stream.schema.json', () => {
    const allowed = schemaFieldNames();
    const rec = mapPixelRowToPipelineRecord(
      {
        id: 'evt-1',
        session_id: 's1',
        event_type: 'page_viewed',
        created_at: 1_700_000_000_000,
        page_url: 'https://epirbizuteria.pl/',
        customer_id: 'gid://shopify/Customer/1',
        order_id: null,
      },
      true,
    );
    for (const key of Object.keys(rec)) {
      expect(allowed.has(key)).toBe(true);
    }
    expect(rec.id).toBe('evt-1');
    expect(rec.customer_id).toBe('gid://shopify/Customer/1');
  });

  it('legacy mapper omits extended-only fields', () => {
    const rec = mapPixelRowToPipelineRecord(
      { id: 'x', session_id: 's', event_type: 'page_viewed', created_at: 1 },
      false,
    );
    expect(rec.id).toBeUndefined();
    expect(rec.customer_id).toBeUndefined();
  });

  it('order_attributed record fits schema', () => {
    const allowed = schemaFieldNames();
    const rec = mapOrderAttributionToPipelineRecord({
      shopify_order_gid: 'gid://shopify/Order/1',
      epir_session_id: 's1',
      received_at: 1_700_000_000_000,
    })!;
    for (const key of Object.keys(rec)) {
      expect(allowed.has(key)).toBe(true);
    }
  });
});
