import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const sqlDir = join(dirname(fileURLToPath(import.meta.url)), '../pipelines-schemas');

describe('pixel-pipeline-production.sql', () => {
  it('uses stream id column (not constant 0)', () => {
    const sql = readFileSync(join(sqlDir, 'pixel-pipeline-production.sql'), 'utf8');
    expect(sql).not.toMatch(/0\s+AS\s+id/i);
    expect(sql).toMatch(/^\s*id,/m);
    expect(sql).toContain('customer_id');
    expect(sql).toContain('order_id');
  });
});
