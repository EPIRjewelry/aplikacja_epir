import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  isChatHistorySyncAllowed,
  readChatPrivacyConsentFieldsForWorker,
  readShopifyAnalyticsProcessingAllowed,
  readShopifyPreferencesProcessingAllowed,
  readStoredChatSessionId,
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
  const keys = () => Object.keys(bag);
  return {
    bag,
    writes,
    storage: {
      get length() {
        return keys().length;
      },
      key: (index: number) => {
        const k = keys()[index];
        return k === undefined ? null : k;
      },
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

function fakeSection() {
  const messagesEl = {querySelectorAll: () => [], innerHTML: '', scrollTop: 0, scrollHeight: 0};
  return {
    dataset: {} as Record<string, string>,
    classList: {contains: () => false},
    querySelector: (sel: string) => (sel === '#assistant-messages-embed' ? messagesEl : null),
  };
}

function loadRuntime(opts: {
  session?: Record<string, string>;
  local?: Record<string, string>;
  shopifyPrivacy?: {analytics?: () => boolean; preferences?: () => boolean} | null;
}) {
  const session = memoryStorage(opts.session);
  const local = memoryStorage(opts.local);
  const fetchMock = vi.fn().mockResolvedValue({ok: true, json: async () => ({history: []})});
  const privacy = opts.shopifyPrivacy;
  const sandbox: Record<string, unknown> = {
    document: {cookie: '', readyState: 'loading', addEventListener() {}},
    sessionStorage: session.storage,
    localStorage: local.storage,
    window: {
      Shopify: privacy
        ? {
            customerPrivacy: {
              analyticsProcessingAllowed: privacy.analytics ?? (() => false),
              preferencesProcessingAllowed: privacy.preferences ?? (() => false),
            },
          }
        : {},
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

function privacyFieldsFromRuntime(sandbox: Record<string, unknown>) {
  const analytics = (sandbox.isShopifyAnalyticsProcessingAllowed as () => boolean | null)();
  const preferences = (sandbox.isShopifyPreferencesProcessingAllowed as () => boolean | null)();
  const body: Record<string, boolean> = {};
  if (analytics !== null) body.analytics_consent = analytics;
  if (preferences !== null) body.preferences_consent = preferences;
  return body;
}

describe('TAE assistant-runtime: consent at send time (no cache)', () => {
  it('accept-all equivalent: analytics_consent true when API allows', () => {
    const r = loadRuntime({
      shopifyPrivacy: {analytics: () => true, preferences: () => true},
    });
    expect(privacyFieldsFromRuntime(r.sandbox)).toEqual({
      analytics_consent: true,
      preferences_consent: true,
    });
  });

  it('necessary: analytics/preferences false when API denies', () => {
    const r = loadRuntime({
      shopifyPrivacy: {analytics: () => false, preferences: () => false},
    });
    expect(privacyFieldsFromRuntime(r.sandbox)).toEqual({
      analytics_consent: false,
      preferences_consent: false,
    });
  });

  it('before decision / API unknown: omit consent fields (no false)', () => {
    const r = loadRuntime({shopifyPrivacy: null});
    expect(privacyFieldsFromRuntime(r.sandbox)).toEqual({});
  });

  it('late API load: second read sees grant without startup cache', () => {
    const r = loadRuntime({shopifyPrivacy: null});
    expect(privacyFieldsFromRuntime(r.sandbox)).toEqual({});
    (r.sandbox.window as {Shopify: unknown}).Shopify = {
      customerPrivacy: {
        analyticsProcessingAllowed: () => true,
        preferencesProcessingAllowed: () => false,
      },
    };
    expect(privacyFieldsFromRuntime(r.sandbox)).toEqual({
      analytics_consent: true,
      preferences_consent: false,
    });
  });

  it('history sync without banner chat flag; no POST /consent', async () => {
    const stored = {[SESSION_KEY]: 'sess_existing-0001'};
    const r = loadRuntime({session: stored, shopifyPrivacy: {analytics: () => false, preferences: () => false}});
    (r.sandbox.syncAssistantHistoryIfAllowed as (s: unknown) => void)(fakeSection());
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(r.fetchMock).toHaveBeenCalledTimes(1);
    const [url] = r.fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/apps/assistant/history');
    expect(url).not.toContain('/consent');
    expect(url).not.toContain('/pixel');
  });

  it('purges legacy consent keys', () => {
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
});

describe('Hydrogen ChatWidget helpers', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('readChatPrivacyConsentFieldsForWorker: Kazka default — analytics only (348fa60)', () => {
    vi.stubGlobal('window', {});
    expect(readChatPrivacyConsentFieldsForWorker()).toEqual({});
    vi.stubGlobal('window', {
      Shopify: {
        customerPrivacy: {
          analyticsProcessingAllowed: () => true,
          preferencesProcessingAllowed: () => false,
        },
      },
    });
    expect(readChatPrivacyConsentFieldsForWorker()).toEqual({
      analytics_consent: true,
    });
  });

  it('readChatPrivacyConsentFieldsForWorker: includePreferencesConsent adds preferences_consent', () => {
    vi.stubGlobal('window', {
      Shopify: {
        customerPrivacy: {
          analyticsProcessingAllowed: () => true,
          preferencesProcessingAllowed: () => false,
        },
      },
    });
    expect(
      readChatPrivacyConsentFieldsForWorker({includePreferencesConsent: true}),
    ).toEqual({
      analytics_consent: true,
      preferences_consent: false,
    });
  });

  it('history sync: Kazka default requires consentGranted; Zaręczyny requireChatConsent=false', () => {
    expect(isChatHistorySyncAllowed({isOpen: true, consentGranted: false})).toBe(false);
    expect(isChatHistorySyncAllowed({isOpen: true, consentGranted: true})).toBe(true);
    expect(
      isChatHistorySyncAllowed({isOpen: true, consentGranted: false, requireChatConsent: false}),
    ).toBe(true);
  });

  it('readStoredChatSessionId never mints', () => {
    const empty = memoryStorage();
    vi.stubGlobal('window', {});
    vi.stubGlobal('sessionStorage', empty.storage);
    expect(readStoredChatSessionId(SESSION_KEY)).toBeNull();
  });

  it('send path still mints sess_', () => {
    const s = memoryStorage();
    vi.stubGlobal('window', {});
    vi.stubGlobal('sessionStorage', s.storage);
    vi.stubGlobal('crypto', {randomUUID: () => '00000000-0000-4000-8000-000000000002'});
    const meta = resolveEffectiveChatSessionWithMeta(SESSION_KEY);
    expect(meta.sessionId).toBe('sess_00000000-0000-4000-8000-000000000002');
  });

  it('direct API readers return null without Shopify', () => {
    vi.stubGlobal('window', {});
    expect(readShopifyAnalyticsProcessingAllowed()).toBeNull();
    expect(readShopifyPreferencesProcessingAllowed()).toBeNull();
  });
});
