import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCustomPixelPostBody } from '../../../extensions/my-web-pixel/src/custom-pixel-payload';
import {
  persistChatSessionIdFromWorker,
  resolveEffectiveChatSessionId,
} from './epir-session-browser';

const SHARED = 'shopify-y-join-8f3c1a0b';
const DIVERGED = 'epir-assistant-session-diverged-uuid';
const WORKER_MINTED = 'worker-minted-session-uuid';
const SESSION_KEY = 'epir-assistant-session';

type PixelApi = {
  analytics: { subscribe: (name: string, handler: (event: unknown) => void) => void };
  init: { data?: { customer?: { id: string } | null } };
  settings: { pixelEndpoint?: string };
  browser: {
    cookie?: { get: (name: string) => Promise<string | null> };
    sessionStorage: {
      getItem: (key: string) => Promise<string | null>;
      setItem: (key: string, value: string) => Promise<void>;
    };
  };
};

const pixelRegister = vi.hoisted(() => ({
  callback: null as ((api: PixelApi) => Promise<void>) | null,
}));

vi.mock('@shopify/web-pixels-extension', () => ({
  register: (callback: (api: PixelApi) => Promise<void>) => {
    pixelRegister.callback = callback;
  },
}));

import '../../../extensions/my-web-pixel/src/index';

const runtimePath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../extensions/asystent-klienta/assets/assistant-runtime.js',
);

function memoryBag(initial: Record<string, string> = {}) {
  const bag: Record<string, string> = { ...initial };
  return {
    bag,
    storage: {
      getItem(key: string) {
        return Object.prototype.hasOwnProperty.call(bag, key) ? bag[key] : null;
      },
      setItem(key: string, value: string) {
        bag[key] = String(value);
      },
      removeItem(key: string) {
        delete bag[key];
      },
    },
  };
}

function installBrowser(cookie: string, stored: Record<string, string> = {}) {
  const memory = memoryBag(stored);
  vi.stubGlobal('window', {});
  vi.stubGlobal('document', { cookie });
  vi.stubGlobal('sessionStorage', memory.storage);
  return memory.bag;
}

function loadLiquidRuntime(cookie: string, stored: Record<string, string> = {}) {
  const memory = memoryBag(stored);
  const minted: string[] = [];
  const sandbox: Record<string, unknown> = {
    document: {
      cookie,
      readyState: 'loading',
      addEventListener() {},
    },
    sessionStorage: memory.storage,
    window: {},
    console,
    fetch: () => Promise.resolve({ ok: true, json: async () => ({}), text: async () => '' }),
    crypto: {
      randomUUID: () => {
        const id = `consent-only-${minted.length + 1}`;
        minted.push(id);
        return id;
      },
    },
    setTimeout,
    clearTimeout,
    URL,
    URLSearchParams,
    AbortController,
    performance: { now: () => 0 },
    Date,
    JSON,
    Math,
    Object,
    String,
    Number,
    Promise,
    decodeURIComponent,
    encodeURIComponent,
  };
  vm.runInNewContext(readFileSync(runtimePath, 'utf8'), sandbox, {
    filename: 'assistant-runtime.js',
  });
  return { sandbox, bag: memory.bag, minted };
}

async function extensionPixelSessionId(options: {
  clientId?: string;
  epirCookie?: string | null;
}): Promise<string> {
  const subscriptions = new Map<string, (event: unknown) => void>();
  const api: PixelApi = {
    analytics: {
      subscribe: (name, handler) => {
        subscriptions.set(name, handler);
      },
    },
    init: { data: { customer: null } },
    settings: { pixelEndpoint: 'https://test-pixel.example.com' },
    browser: {
      cookie: {
        get: async (name: string) =>
          name === '_epir_session_id' ? (options.epirCookie ?? null) : null,
      },
      sessionStorage: {
        getItem: async () => null,
        setItem: async () => undefined,
      },
    },
  };
  if (!pixelRegister.callback) throw new Error('pixel register() did not run');
  await pixelRegister.callback(api);
  const handler = subscriptions.get('page_viewed');
  if (!handler) throw new Error('page_viewed handler missing');
  await handler({
    clientId: options.clientId,
    context: { customerPrivacy: { analyticsProcessingAllowed: true } },
  });
  const call = vi.mocked(fetch).mock.calls.at(-1);
  if (!call) throw new Error('pixel did not fetch');
  const init = call[1] as RequestInit;
  const body = JSON.parse(String(init.body)) as { data: { session_id: string } };
  return body.data.session_id;
}

describe('chat session_id joins pixel session_id on _shopify_y', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ ok: true, activate_chat: false }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the same _shopify_y cookie for the chat session_id and the pixel session_id', async () => {
    const cookie = `_epir_session_id=${SHARED}; _shopify_y=${SHARED}`;
    const stored = installBrowser(cookie, { [SESSION_KEY]: DIVERGED });

    const hydrogenSessionId = resolveEffectiveChatSessionId();
    persistChatSessionIdFromWorker(WORKER_MINTED);
    const hydrogenAfterWorker = resolveEffectiveChatSessionId();

    const liquid = loadLiquidRuntime(cookie, { [SESSION_KEY]: DIVERGED });
    const resolveLiquid = liquid.sandbox.resolveEffectiveAssistantSessionId as (
      key?: string,
    ) => string | null;
    const persistLiquid = liquid.sandbox.persistAssistantSessionIdFromWorker as (
      key: string,
      id: string,
    ) => void;
    const buildConsent = liquid.sandbox.buildConsentEvent as (section: {
      dataset: Record<string, string>;
    }) => { sessionId: string; anonymousId: string };
    const liquidSessionId = resolveLiquid(SESSION_KEY);
    persistLiquid(SESSION_KEY, WORKER_MINTED);
    const consent = buildConsent({ dataset: {} });

    const customPixelSessionId = buildCustomPixelPostBody({
      name: 'page_viewed',
      clientId: SHARED,
      data: {},
    }).data.session_id;

    const extensionSessionId = await extensionPixelSessionId({
      clientId: SHARED,
      epirCookie: SHARED,
    });

    expect(hydrogenSessionId).toBe(SHARED);
    expect(hydrogenAfterWorker).toBe(SHARED);
    expect(liquidSessionId).toBe(SHARED);
    expect(customPixelSessionId).toBe(SHARED);
    expect(extensionSessionId).toBe(SHARED);
    expect(hydrogenSessionId).toBe(customPixelSessionId);
    expect(hydrogenSessionId).toBe(extensionSessionId);
    expect(liquidSessionId).toBe(extensionSessionId);

    expect(stored[SESSION_KEY]).toBe(DIVERGED);
    expect(liquid.bag[SESSION_KEY]).toBe(DIVERGED);
    expect(consent.sessionId).toBe(SHARED);
    expect(consent.anonymousId).not.toBe(SHARED);
    expect(liquid.bag['epir-chat-anonymous-id']).toBe(consent.anonymousId);
    expect(liquid.minted).not.toContain(SHARED);
  });

  it('adopts _shopify_y for a new session and does not mint a second id', async () => {
    const cookie = `_shopify_y=${encodeURIComponent(SHARED)}`;
    const stored = installBrowser(cookie);

    const hydrogenSessionId = resolveEffectiveChatSessionId();
    persistChatSessionIdFromWorker(WORKER_MINTED);

    const liquid = loadLiquidRuntime(cookie);
    const resolveLiquid = liquid.sandbox.resolveEffectiveAssistantSessionId as (
      key?: string,
    ) => string | null;
    const persistLiquid = liquid.sandbox.persistAssistantSessionIdFromWorker as (
      key: string,
      id: string,
    ) => void;
    const liquidSessionId = resolveLiquid();
    persistLiquid(SESSION_KEY, WORKER_MINTED);

    const customPixelSessionId = buildCustomPixelPostBody({
      name: 'product_viewed',
      clientId: SHARED,
      data: {},
    }).data.session_id;
    const extensionId = await extensionPixelSessionId({
      clientId: SHARED,
      epirCookie: null,
    });

    expect(hydrogenSessionId).toBe(SHARED);
    expect(resolveEffectiveChatSessionId()).toBe(SHARED);
    expect(stored[SESSION_KEY]).toBe(SHARED);
    expect(stored[SESSION_KEY]).not.toBe(WORKER_MINTED);
    expect(liquidSessionId).toBe(SHARED);
    expect(liquid.bag[SESSION_KEY]).toBe(SHARED);
    expect(liquid.bag[SESSION_KEY]).not.toBe(WORKER_MINTED);
    expect(liquid.minted).toEqual([]);
    expect(customPixelSessionId).toBe(SHARED);
    expect(extensionId).toBe(SHARED);
    expect(hydrogenSessionId).toBe(extensionId);
  });
});
