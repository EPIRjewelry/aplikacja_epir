import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { buildCustomPixelPostBody } from './custom-pixel-payload';

const scriptPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'storefront-custom-pixel.js');
const pasteScript = readFileSync(scriptPath, 'utf8');

/** Uruchamia wklejkę tak, jak sandbox Customer Events: globalne `analytics` i `init`. */
function runPasteScript(event: unknown, init?: unknown): { session_id?: unknown; sessionId?: unknown; clientId?: unknown } {
  const captured: Array<{ data?: { session_id?: unknown; sessionId?: unknown; clientId?: unknown } }> = [];
  const sandbox: Record<string, unknown> = {
    analytics: {
      subscribe(_name: string, handler: (pixelEvent: unknown) => void) {
        sandbox.__handler = handler;
      },
    },
    fetch(_url: string, opts: { body: string }) {
      captured.push(JSON.parse(opts.body));
      return Promise.resolve({ ok: true });
    },
  };
  if (init !== undefined) sandbox.init = init;
  const context = createContext(sandbox);
  runInContext(pasteScript, context);
  const handler = sandbox.__handler as ((pixelEvent: unknown) => void) | undefined;
  if (!handler) throw new Error('paste script did not subscribe');
  handler(event);
  return captured[0]?.data ?? {};
}

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
    expect(body.data.clientId).toBe('');
  });

  it('uses init.clientId when event.clientId is empty (no cookie on this sender)', () => {
    const body = buildCustomPixelPostBody(
      { name: 'page_viewed', clientId: '   ', data: { cart: { id: 'c1' } } },
      { clientId: '  init-shopify-client-abc  ' },
    );
    expect(body.data.session_id).toBe('init-shopify-client-abc');
    expect(body.data.sessionId).toBe('init-shopify-client-abc');
    expect(body.data.clientId).toBe('init-shopify-client-abc');
    expect(body.data.cart).toEqual({ id: 'c1' });
  });

  it('uses init.data.clientId when init.clientId is empty', () => {
    const body = buildCustomPixelPostBody(
      { name: 'product_viewed', data: {} },
      { clientId: '', data: { clientId: 'nested-init-client' } },
    );
    expect(body.data.session_id).toBe('nested-init-client');
    expect(body.data.sessionId).toBe('nested-init-client');
    expect(body.data.clientId).toBe('nested-init-client');
  });

  it('prefers event.clientId over init.clientId', () => {
    const body = buildCustomPixelPostBody(
      { name: 'page_viewed', clientId: 'from-event', data: {} },
      { clientId: 'from-init' },
    );
    expect(body.data.session_id).toBe('from-event');
  });

  it('sends empty session_id when neither event nor init clientId is present (§A.2)', () => {
    const body = buildCustomPixelPostBody({ name: 'page_viewed', clientId: '', data: {} }, { data: {} });
    expect(body.data.session_id).toBe('');
    expect(body.data.sessionId).toBe('');
    expect(body.data.clientId).toBe('');
  });

  it('paste script: no cookie and a present clientId → session_id is set (§A.2)', () => {
    const fromEvent = runPasteScript({ name: 'page_viewed', clientId: 'shopify-client-abc', data: {} });
    expect(fromEvent.session_id).toBe('shopify-client-abc');
    expect(fromEvent.sessionId).toBe('shopify-client-abc');
    expect(fromEvent.clientId).toBe('shopify-client-abc');

    const fromInit = runPasteScript(
      { name: 'page_viewed', clientId: '', data: {} },
      { clientId: 'init-shopify-client-abc' },
    );
    expect(fromInit.session_id).toBe('init-shopify-client-abc');
    expect(fromInit.sessionId).toBe('init-shopify-client-abc');
    expect(fromInit.clientId).toBe('init-shopify-client-abc');

    const fromNested = runPasteScript(
      { name: 'page_viewed', clientId: '   ', data: {} },
      { clientId: '', data: { clientId: 'nested-init-client' } },
    );
    expect(fromNested.session_id).toBe('nested-init-client');
  });

  it('paste script: neither cookie nor clientId → empty session_id (§A.2)', () => {
    const data = runPasteScript({ name: 'page_viewed', data: {} }, { data: {} });
    expect(data.session_id).toBe('');
    expect(data.sessionId).toBe('');
    expect(data.clientId).toBe('');
  });

  it('paste-ready script includes clientId and session_id', () => {
    const script = pasteScript;
    expect(script).toContain('event.clientId');
    expect(script).toContain('init.clientId');
    expect(script).toContain('init.data.clientId');
    expect(script).toContain('sessionId');
    expect(script).toContain('session_id');
    expect(script).toContain('clientId');
    expect(script).toContain('asystent.epirbizuteria.pl/pixel');
    expect(script).not.toContain('data: event?.data');
  });
});
