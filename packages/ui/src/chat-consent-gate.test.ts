import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  isChatHistorySyncAllowed,
  readStoredChatSessionId,
  resolveChatPrivacyCapabilities,
  resolveEffectiveChatSessionWithMeta,
} from './epir-session-browser';

const SESSION_KEY = 'epir-assistant-session';
const runtimePath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../extensions/asystent-klienta/assets/assistant-runtime.js',
);

function memoryStorage(initial: Record<string, string> = {}) {
  const bag: Record<string, string> = {...initial};
  const writes: string[] = [];
  return {
    bag,
    writes,
    storage: {
      getItem: (k: string) => (Object.prototype.hasOwnProperty.call(bag, k) ? bag[k] : null),
      setItem: (k: string, v: string) => {
        writes.push(k);
        bag[k] = String(v);
      },
      removeItem: (k: string) => {
        delete bag[k];
      },
    },
  };
}

function fakeSection(opts: {panelOpen?: boolean} = {}) {
  const messagesEl = {querySelectorAll: () => [], innerHTML: '', scrollTop: 0, scrollHeight: 0};
  const panel = {classList: {contains: (c: string) => c === 'is-closed' && !opts.panelOpen}};
  return {
    dataset: {} as Record<string, string>,
    classList: {contains: () => false},
    querySelector: (sel: string) => {
      if (sel === '#assistant-messages-embed') return messagesEl;
      if (sel === '#assistant-panel-embed') return panel;
      return null;
    },
  };
}

function loadRuntime(opts: {
  session?: Record<string, string>;
  local?: Record<string, string>;
  shopifyPrivacy?: {analytics?: boolean; preferences?: boolean};
}) {
  const session = memoryStorage(opts.session);
  const local = memoryStorage(opts.local);
  const fetchMock = vi.fn().mockResolvedValue({ok: true, json: async () => ({history: []})});
  const privacy = opts.shopifyPrivacy ?? {};
  const sandbox: Record<string, unknown> = {
    document: {cookie: '', readyState: 'loading', addEventListener() {}},
    sessionStorage: session.storage,
    localStorage: local.storage,
    window: {
      Shopify: {
        customerPrivacy: {
          analyticsProcessingAllowed: () => privacy.analytics === true,
          preferencesProcessingAllowed: () => privacy.preferences === true,
        },
      },
      location: {hostname: 'epirbizuteria.pl', pathname: '/'},
    },
    console,
    fetch: fetchMock,
    crypto: {randomUUID: () => '00000000-0000-4000-8000-000000000001'},
    setTimeout,
    clearTimeout,
    URL,
    URLSearchParams,
    AbortController,
    Date,
    JSON,
    Math,
    Object,
    String,
    Number,
    Promise,
  };
  vm.runInNewContext(readFileSync(runtimePath, 'utf8'), sandbox, {filename: 'assistant-runtime.js'});
  return {sandbox, session, local, fetchMock};
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('TAE assistant-runtime: chat bez bramki banera, zgoda Shopify', () => {
  it('debug ingest to 127.0.0.1 is gone', () => {
    const src = readFileSync(runtimePath, 'utf8');
    expect(src).not.toContain('epirAgentDebugLog');
    expect(src).not.toContain('127.0.0.1:7457');
  });

  it('read path never mints sess_ nor anonymous id', async () => {
    const {sandbox, session, fetchMock} = loadRuntime({});
    const section = fakeSection();
    expect((sandbox.readStoredAssistantSessionId as (k?: string) => string)(SESSION_KEY)).toBe('');
    expect(
      (sandbox.fetchAssistantTranscriptFromBackend as (s: unknown, k: string) => Promise<unknown[]>)(
        section,
        SESSION_KEY,
      ),
    ).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(session.writes).toEqual([]);
  });

  it('syncAssistantHistoryIfAllowed fetches history without banner chat flag', async () => {
    const stored = {[SESSION_KEY]: 'sess_existing-0001'};
    const r = loadRuntime({session: stored, local: {'epir-customer-privacy-chat': 'false'}});
    (r.sandbox.syncAssistantHistoryIfAllowed as (s: unknown) => void)(fakeSection({panelOpen: true}));
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(r.fetchMock).toHaveBeenCalledTimes(1);
    const [url] = r.fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/apps/assistant/history');
  });

  it('getChatCapabilities: necessary-equivalent → analytics/preferences false', () => {
    const r = loadRuntime({shopifyPrivacy: {analytics: false, preferences: false}});
    const caps = (r.sandbox.getChatCapabilities as () => {analytics: boolean; preferences: boolean})();
    expect(caps).toEqual({analytics: false, preferences: false});
  });

  it('purges legacy consent keys on initAllAssistantSections', () => {
    const r = loadRuntime({
      local: {
        'epir-customer-privacy-chat': 'false',
        'epir-consent:epir-theme-liquid-chat-v1': 'false',
      },
    });
    (r.sandbox.purgeLegacyChatConsentStorage as () => void)();
    expect(r.local.bag['epir-customer-privacy-chat']).toBeUndefined();
    expect(r.local.bag['epir-consent:epir-theme-liquid-chat-v1']).toBeUndefined();
  });

  it('send path still mints sess_', () => {
    const r = loadRuntime({});
    const meta = (r.sandbox.resolveAssistantSessionIdMeta as (k: string) => {sessionId: string})(
      SESSION_KEY,
    );
    expect(meta.sessionId).toMatch(/^sess_/);
    expect(r.session.bag[SESSION_KEY]).toBe(meta.sessionId);
  });
});

describe('Hydrogen ChatWidget helpers', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('readStoredChatSessionId never mints and scrubs invalid values', () => {
    const empty = memoryStorage();
    vi.stubGlobal('window', {});
    vi.stubGlobal('sessionStorage', empty.storage);
    expect(readStoredChatSessionId(SESSION_KEY)).toBeNull();
    expect(empty.writes).toEqual([]);

    const legacy = memoryStorage({[SESSION_KEY]: 'not-a-sess-id'});
    vi.stubGlobal('sessionStorage', legacy.storage);
    expect(readStoredChatSessionId(SESSION_KEY)).toBeNull();
    expect(legacy.bag[SESSION_KEY]).toBeUndefined();

    const ok = memoryStorage({[SESSION_KEY]: 'sess_ok-0001'});
    vi.stubGlobal('sessionStorage', ok.storage);
    expect(readStoredChatSessionId(SESSION_KEY)).toBe('sess_ok-0001');
  });

  it('history sync: open panel; Kazka still needs consentGranted', () => {
    expect(isChatHistorySyncAllowed({isOpen: false, consentGranted: true})).toBe(false);
    expect(isChatHistorySyncAllowed({isOpen: true, consentGranted: false})).toBe(false);
    expect(isChatHistorySyncAllowed({isOpen: true, consentGranted: undefined})).toBe(false);
    expect(isChatHistorySyncAllowed({isOpen: true, consentGranted: true})).toBe(true);
    expect(
      isChatHistorySyncAllowed({isOpen: true, consentGranted: false, requireChatConsent: false}),
    ).toBe(true);
  });

  it('resolveChatPrivacyCapabilities defaults false without API', () => {
    vi.stubGlobal('window', {});
    expect(resolveChatPrivacyCapabilities()).toEqual({analytics: false, preferences: false});
  });

  it('send path still mints sess_', () => {
    const s = memoryStorage();
    vi.stubGlobal('window', {});
    vi.stubGlobal('sessionStorage', s.storage);
    vi.stubGlobal('crypto', {randomUUID: () => '00000000-0000-4000-8000-000000000002'});
    const meta = resolveEffectiveChatSessionWithMeta(SESSION_KEY);
    expect(meta.sessionId).toBe('sess_00000000-0000-4000-8000-000000000002');
    expect(s.bag[SESSION_KEY]).toBe(meta.sessionId);
  });
});
