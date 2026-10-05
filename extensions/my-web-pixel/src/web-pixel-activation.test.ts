import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('web pixel ships with the app, not a Customer Events paste', () => {
  it('requests the Admin scopes webPixelCreate needs', () => {
    const toml = readFileSync(join(root, 'shopify.app.toml'), 'utf8');
    expect(toml).toContain('write_pixels');
    expect(toml).toContain('read_customer_events');
  });

  it('loads without a privacy purpose, on the same visits as the Customer Events paste', () => {
    const toml = readFileSync(join(root, 'extensions/my-web-pixel/shopify.extension.toml'), 'utf8');
    const privacy = toml.slice(toml.indexOf('[customer_privacy]'));
    // App pixels stay strict. Lax is the custom-pixel sandbox, not a valid switch here.
    expect(toml).toMatch(/runtime_context\s*=\s*"strict"/);
    expect(privacy).toMatch(/analytics\s*=\s*false/);
    expect(privacy).toMatch(/marketing\s*=\s*false/);
    expect(privacy).toMatch(/preferences\s*=\s*false/);
    expect(privacy).toMatch(/sale_of_data\s*=\s*"disabled"/);
    expect(privacy).not.toMatch(/analytics\s*=\s*true/);
  });

  it('activation script creates the web pixel record and does not subscribe like a paste', () => {
    const script = [
      readFileSync(join(root, 'scripts/shopify/ensure-epir-web-pixel.mjs'), 'utf8'),
      readFileSync(join(root, 'scripts/shopify/epir-web-pixel-record.mjs'), 'utf8'),
    ].join('\n');
    expect(script).toContain('reconcileEpirWebPixel');
    expect(script).toContain('webPixelCreate');
    expect(script).toContain('webPixelUpdate');
    expect(script).toContain('https://asystent.epirbizuteria.pl');
    expect(script).toContain('accountID');
    expect(script).toContain('--dry-run');
    expect(script).toContain('no web pixel was found');
    expect(script).not.toContain('analytics.subscribe');
    expect(script).not.toContain('webPixelDelete');
  });
});
