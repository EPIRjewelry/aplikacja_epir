import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {buildCustomPixelPostBody} from '../../../extensions/my-web-pixel/src/custom-pixel-payload';
import {
  installShopifyCustomerPrivacyChatListeners,
  persistChatSessionIdFromWorker,
  readAnalyticsClientIdForChat,
  readLastChatSessionIdForPrivacy,
  rememberChatSessionIdForPrivacy,
  resolveChatSessionPrivacyApiUrl,
  resolveEffectiveChatSessionId,
  resolveEffectiveChatSessionWithMeta,
  scrubInvalidChatSessionStorage,
} from './epir-session-browser';

const SHARED = 'shopify-y-join-8f3c1a0b';
const DIVERGED = 'epir-assistant-session-diverged-uuid';
const WORKER_MINTED = 'worker-minted-session-uuid';
const SESSION_KEY = 'epir-assistant-session';

type PixelApi = {
  analytics: {subscribe: (name: string, handler: (event: unknown) => void) => void};
  init: {data?: {customer?: {id: string} | null}};
  settings: {pixelEndpoint?: string};
  browser: {
    cookie?: {get: (name: string) => Promise<string | null>};
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
  const bag: Record<string, string> = {...initial};
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

function installBrowser(
  cookie: string,
  stored: Record<string, string> = {},
  analyticsAllowed: boolean | null = null,
) {
  const memory = memoryBag(stored);
  let mintSeq = 0;
  const shopify: Record<string, unknown> = {};
  if (analyticsAllowed !== null) {
    shopify.customerPrivacy = {
      analyticsProcessingAllowed: () => analyticsAllowed === true,
    };
  }
  vi.stubGlobal('window', {Shopify: shopify});
  vi.stubGlobal('document', {cookie});
  vi.stubGlobal('sessionStorage', memory.storage);
  vi.stubGlobal('crypto', {
    randomUUID: () => {
      mintSeq += 1;
      return `00000000-0000-4000-8000-${String(mintSeq).padStart(12, '0')}`;
    },
  });
  return memory.bag;
}

function loadLiquidRuntime(
  cookie: string,
  stored: Record<string, string> = {},
  analyticsAllowed: boolean | null = null,
) {
  const memory = memoryBag(stored);
  const minted: string[] = [];
  const shopify: Record<string, unknown> = {};
  if (analyticsAllowed !== null) {
    shopify.customerPrivacy = {
      analyticsProcessingAllowed: () => analyticsAllowed === true,
    };
  }
  const sandbox: Record<string, unknown> = {
    document: {
      cookie,
      readyState: 'loading',
      addEventListener() {},
    },
    sessionStorage: memory.storage,
    window: {Shopify: shopify},
    console,
    fetch: () => Promise.resolve({ok: true, json: async () => ({}), text: async () => ''}),
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
    performance: {now: () => 0},
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
  return {sandbox, bag: memory.bag, minted};
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
    init: {data: {customer: null}},
    settings: {pixelEndpoint: 'https://test-pixel.example.com'},
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
    context: {customerPrivacy: {analyticsProcessingAllowed: true}},
  });
  const call = vi.mocked(fetch).mock.calls.at(-1);
  if (!call) throw new Error('pixel did not fetch');
  const init = call[1] as RequestInit;
  const body = JSON.parse(String(init.body)) as {data: {session_id: string}};
  return body.data.session_id;
}

describe('resolveChatSessionPrivacyApiUrl', () => {
  it('maps Hydrogen /api/chat and GE /apps/assistant/chat', () => {
    vi.stubGlobal('window', {location: {origin: 'https://shop.example'}});
    expect(resolveChatSessionPrivacyApiUrl('/api/chat')).toBe('/api/chat-session-privacy');
    expect(resolveChatSessionPrivacyApiUrl('/apps/assistant/chat')).toBe(
      '/apps/assistant/session-privacy',
    );
    vi.unstubAllGlobals();
  });
});

describe('chat session_id vs pixel (Customer Privacy)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ok: true, activate_chat: false}),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('chat uses sess_* only; never _shopify_y; pixel uses clientId', async () => {
    const cookie = `_epir_session_id=${SHARED}; _shopify_y=${SHARED}`;
    const stored = installBrowser(cookie, {[SESSION_KEY]: DIVERGED}, false);

    const meta = resolveEffectiveChatSessionWithMeta(SESSION_KEY);
    expect(meta.sessionId).toMatch(/^sess_/);
    expect(meta.sessionId).not.toBe(SHARED);
    expect(meta.sessionIdSource).toBe('session_storage');
    expect(readAnalyticsClientIdForChat(true)).toBeNull();
    expect(stored[SESSION_KEY]).toMatch(/^sess_/);
    expect(stored[SESSION_KEY]).not.toBe(DIVERGED);

    const liquid = loadLiquidRuntime(cookie, {[SESSION_KEY]: DIVERGED}, false);
    const resolveLiquid = liquid.sandbox.resolveEffectiveAssistantSessionId as (
      key?: string,
    ) => string | null;
    const liquidSessionId = resolveLiquid(SESSION_KEY);
    expect(liquidSessionId).toMatch(/^sess_/);
    expect(liquidSessionId).not.toBe(SHARED);

    const customPixelSessionId = buildCustomPixelPostBody({
      name: 'page_viewed',
      clientId: SHARED,
      data: {},
    }).data.session_id;
    const extensionSessionId = await extensionPixelSessionId({
      clientId: SHARED,
      epirCookie: SHARED,
    });
    expect(customPixelSessionId).toBe(SHARED);
    expect(extensionSessionId).toBe(SHARED);
    expect(meta.sessionId).not.toBe(extensionSessionId);
  });

  it('does not put analytics_client_id on resolved chat meta', () => {
    installBrowser(`_shopify_y=${SHARED}`, {}, true);
    const meta = resolveEffectiveChatSessionWithMeta(SESSION_KEY);
    expect(meta.sessionId).toMatch(/^sess_/);
    expect(meta).not.toHaveProperty('analyticsClientId');
    expect(readAnalyticsClientIdForChat(true)).toBeNull();
  });

  it('ignores distinct _epir_session_id for chat session_id', () => {
    const cookie = `_epir_session_id=epir-first-party-session-id-9a2b; _shopify_y=${SHARED}`;
    installBrowser(cookie, {}, true);
    const meta = resolveEffectiveChatSessionWithMeta(SESSION_KEY);
    expect(meta.sessionId).toMatch(/^sess_/);
    expect(meta.sessionId).not.toBe('epir-first-party-session-id-9a2b');
    expect(meta.sessionIdSource).toBe('session_storage');
  });

  it('rejects legacy sessionStorage (non sess_*) and mints sess_*', () => {
    const cookie = `_shopify_y=${SHARED}`;
    const stored = installBrowser(cookie, {[SESSION_KEY]: SHARED}, false);
    scrubInvalidChatSessionStorage(SESSION_KEY);
    expect(stored[SESSION_KEY]).toBeUndefined();
    const id = resolveEffectiveChatSessionId(SESSION_KEY);
    expect(id).toMatch(/^sess_/);
    expect(stored[SESSION_KEY]).toBe(id);
  });

  it('mints sess_uuid when no cookie and empty storage', () => {
    const stored = installBrowser('', {}, false);
    const hydrogen1 = resolveEffectiveChatSessionId();
    const hydrogen2 = resolveEffectiveChatSessionId();
    expect(hydrogen1).toMatch(/^sess_[0-9a-f-]{36}$/i);
    expect(hydrogen2).toBe(hydrogen1);
    expect(stored[SESSION_KEY]).toBe(hydrogen1);

    const liquid = loadLiquidRuntime('', {}, false);
    const resolveLiquid = liquid.sandbox.resolveEffectiveAssistantSessionId as (
      key?: string,
    ) => string | null;
    const liquid1 = resolveLiquid(SESSION_KEY);
    expect(liquid1).toMatch(/^sess_/);
  });

  it('persistChatSessionIdFromWorker ignores non-sess_ echo', () => {
    const stored = installBrowser('', {}, true);
    persistChatSessionIdFromWorker(WORKER_MINTED, SESSION_KEY);
    expect(stored[SESSION_KEY]).toBeUndefined();
    persistChatSessionIdFromWorker('sess_from-worker-ok', SESSION_KEY);
    expect(resolveEffectiveChatSessionId(SESSION_KEY)).toBe('sess_from-worker-ok');
  });

  it('reuses valid sess_* in sessionStorage', () => {
    const existing = 'sess_already-stored-id-0001';
    const stored = installBrowser('', {[SESSION_KEY]: existing}, false);
    expect(resolveEffectiveChatSessionId()).toBe(existing);
    expect(stored[SESSION_KEY]).toBe(existing);
  });

  function installConsentDocument(cookie: string, stored: Record<string, string> = {}) {
    const consentHandlers = new Map<string, Set<(ev: Event) => void>>();
    const memory = memoryBag(stored);
    vi.stubGlobal('window', {
      Shopify: {customerPrivacy: {analyticsProcessingAllowed: () => true}},
    });
    vi.stubGlobal('document', {
      cookie,
      addEventListener(type: string, fn: (ev: Event) => void) {
        if (!consentHandlers.has(type)) consentHandlers.set(type, new Set());
        consentHandlers.get(type)!.add(fn);
      },
      removeEventListener(type: string, fn: (ev: Event) => void) {
        consentHandlers.get(type)?.delete(fn);
      },
      dispatchEvent(ev: Event) {
        consentHandlers.get(ev.type)?.forEach((fn) => fn(ev));
        return true;
      },
    });
    vi.stubGlobal('sessionStorage', memory.storage);
    return memory.bag;
  }

  async function dispatchAnalyticsRevoke(): Promise<{
    session_id: string;
    analytics_consent: boolean;
    analytics_client_id: null;
  }> {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockClear();
    document.dispatchEvent(
      new CustomEvent('visitorConsentCollected', {detail: {analyticsAllowed: false}}),
    );
    await Promise.resolve();
    const privacyCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes('session-privacy'),
    );
    expect(privacyCall).toBeDefined();
    return JSON.parse(String((privacyCall![1] as RequestInit).body));
  }

  it('privacy revoke uses remembered sess_* session_id', async () => {
    const existing = 'sess_privacy-revoke-0001';
    installConsentDocument('', {[SESSION_KEY]: existing});
    rememberChatSessionIdForPrivacy(existing, 'session_storage');
    installShopifyCustomerPrivacyChatListeners('/apps/assistant/chat', SESSION_KEY);

    const body = await dispatchAnalyticsRevoke();
    expect(body.session_id).toBe(existing);
    expect(body.analytics_consent).toBe(false);
    expect(body.analytics_client_id).toBeNull();
    expect(readLastChatSessionIdForPrivacy()?.sessionId).toBe(existing);
  });

  it('does not remember non-sess_* values for privacy revoke', () => {
    installConsentDocument(`_epir_session_id=${SHARED}; _shopify_y=${SHARED}`, {});
    rememberChatSessionIdForPrivacy(SHARED, 'cookie');
    expect(readLastChatSessionIdForPrivacy()).toBeNull();
  });
});
