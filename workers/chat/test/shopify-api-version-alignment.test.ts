import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { SHOPIFY_ADMIN_API_VERSION } from '../src/config/shopify-api-version';

const testDir = dirname(fileURLToPath(import.meta.url));
/** `workers/chat/test` → repo root */
const repoRoot = join(testDir, '..', '..', '..');

describe('Shopify Admin API version alignment', () => {
  it('matches shopify.app.toml [webhooks] api_version', () => {
    const toml = readFileSync(join(repoRoot, 'shopify.app.toml'), 'utf8');
    const idx = toml.indexOf('[webhooks]');
    expect(idx).toBeGreaterThanOrEqual(0);
    const chunk = toml.slice(idx, idx + 600);
    const m = /api_version\s*=\s*"([^"]+)"/.exec(chunk);
    expect(m?.[1]).toBe(SHOPIFY_ADMIN_API_VERSION);
  });
});
