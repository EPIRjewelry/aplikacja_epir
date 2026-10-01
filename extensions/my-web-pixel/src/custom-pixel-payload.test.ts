import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildCustomPixelPostBody } from './custom-pixel-payload';

describe('custom pixel POST body (live Customer Events sender)', () => {
  it('copies event.clientId onto session_id', () => {
    const body = buildCustomPixelPostBody({
      name: 'page_viewed',
      clientId: 'shopify-client-abc',
      data: {},
      context: { document: { location: { href: 'https://epirbizuteria.pl/' } } },
    });
    expect(body.type).toBe('page_viewed');
    expect(body.data.session_id).toBe('shopify-client-abc');
    expect(body.data.sessionId).toBe('shopify-client-abc');
    expect(body.data.clientId).toBe('shopify-client-abc');
  });

  it('sends empty session_id when clientId is missing (§A.2)', () => {
    const body = buildCustomPixelPostBody({ name: 'page_viewed', data: {} });
    expect(body.data.session_id).toBe('');
    expect(body.data.sessionId).toBe('');
  });

  it('paste-ready script includes clientId and session_id', () => {
    const scriptPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'storefront-custom-pixel.js');
    const script = readFileSync(scriptPath, 'utf8');
    expect(script).toContain('event.clientId');
    expect(script).toContain('session_id');
    expect(script).toContain('asystent.epirbizuteria.pl/pixel');
    expect(script).not.toContain('data: event?.data');
  });
});
