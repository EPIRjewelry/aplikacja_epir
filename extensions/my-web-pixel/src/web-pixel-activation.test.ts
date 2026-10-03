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

  it('loads on analytics consent without also requiring marketing or data sale', () => {
    const toml = readFileSync(join(root, 'extensions/my-web-pixel/shopify.extension.toml'), 'utf8');
    expect(toml).toMatch(/analytics\s*=\s*true/);
    expect(toml).toMatch(/marketing\s*=\s*false/);
    expect(toml).toMatch(/sale_of_data\s*=\s*"disabled"/);
  });

  it('activation script creates the web pixel record and does not subscribe like a paste', () => {
    const script = readFileSync(join(root, 'scripts/shopify/ensure-epir-web-pixel.mjs'), 'utf8');
    expect(script).toContain('webPixelCreate');
    expect(script).toContain('webPixelUpdate');
    expect(script).toContain('https://asystent.epirbizuteria.pl');
    expect(script).toContain('accountID');
    expect(script).toContain('--dry-run');
    expect(script).not.toContain('analytics.subscribe');
  });
});
