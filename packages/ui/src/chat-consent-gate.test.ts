import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  isChatHistorySyncAllowed,
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

function fakeSection(opts: {locked?: boolean} = {}) {
  const classes = new Set<string>(opts.locked ? ['epir-assistant--consent-locked'] : []);
  const messagesEl = {querySelectorAll: () => [], innerHTML: '', scrollTop: 0, scrollHeight: 0};
  return {
    dataset: {} as Record<string, string>,
    classList: {contains: (c: string) => classes.has(c)},
    querySelector: (sel: string) => (sel === '#assistant-messages-embed' ? messagesEl : null),
  };
}

function loadRuntime(opts: {
  session?: Record<string, string>;
  local?: Record<string, string>;
}) {
  const session = memoryStorage(opts.session);
  const local = memoryStorage(opts.local);
  const fetchMock = vi.fn().mockResolvedValue({ok: true, json: async () => ({history: []})});
  const sandbox: Record<string, unknown> = {
    document: {cookie: '', readyState: 'loading', addEventListener() {}},
    sessionStorage: session.storage,
    localStorage: local.storage,
    window: {Shopify: {}, location: {hostname: 'epirbizuteria.pl', pathname: '/'}},
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

describe('TAE assistant-runtime: nothing stored or sent before chat consent + user action', () => {
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
      (sandbox.getAssistantTranscriptStorageKeys as (s: unknown, k: string) => string[])(section, SESSION_KEY),
    ).toEqual([]);
    expect(
      (sandbox.readAssistantTranscript as (s: unknown, k: string) => unknown[])(section, SESSION_KEY),
    ).toEqual([]);
    const history = await (
      sandbox.fetchAssistantTranscriptFromBackend as (s: unknown, k: string) => Promise<unknown[]>
    )(section, SESSION_KEY);
    expect(history).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(session.writes).toEqual([]);
  });

  it('no history request without banner chat consent or when locked', async () => {
    const stored = {[SESSION_KEY]: 'sess_existing-0001'};
    const noConsent = loadRuntime({session: stored});
    (noConsent.sandbox.syncAssistantHistoryIfAllowed as (s: unknown) => void)(fakeSection());
    const locked = loadRuntime({session: stored, local: {'epir-customer-privacy-chat': 'true'}});
    (locked.sandbox.syncAssistantHistoryIfAllowed as (s: unknown) => void)(fakeSection({locked: true}));
    await flush();
    expect(noConsent.fetchMock).not.toHaveBeenCalled();
    expect(locked.fetchMock).not.toHaveBeenCalled();
  });

  it('with chat consent and no stored sess_: no request, no mint', async () => {
    const r = loadRuntime({local: {'epir-customer-privacy-chat': 'true'}});
    (r.sandbox.syncAssistantHistoryIfAllowed as (s: unknown) => void)(fakeSection());
    await flush();
    expect(r.fetchMock).not.toHaveBeenCalled();
    expect(r.session.writes).toEqual([]);
  });

  it('with chat consent and stored sess_: restores history for that session', async () => {
    const r = loadRuntime({
      session: {[SESSION_KEY]: 'sess_existing-0001'},
      local: {'epir-customer-privacy-chat': 'true'},
    });
    (r.sandbox.syncAssistantHistoryIfAllowed as (s: unknown) => void)(fakeSection());
    // preflight tożsamości: do 3 prób co 75 ms
    await new Promise((r) => setTimeout(r, 400));
    expect(r.fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = r.fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/apps/assistant/history');
    expect(JSON.parse(String(init.body)).session_id).toBe('sess_existing-0001');
    expect(r.session.bag[SESSION_KEY]).toBe('sess_existing-0001');
  });

  it('send/consent path still mints sess_ (needed for chat + #176 pixel link)', () => {
    const r = loadRuntime({});
    const meta = (r.sandbox.resolveAssistantSessionIdMeta as (k: string) => {sessionId: string})(SESSION_KEY);
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

  it('history sync only when open AND consent === true', () => {
    expect(isChatHistorySyncAllowed({isOpen: false, consentGranted: true})).toBe(false);
    expect(isChatHistorySyncAllowed({isOpen: true, consentGranted: false})).toBe(false);
    expect(isChatHistorySyncAllowed({isOpen: true, consentGranted: undefined})).toBe(false);
    expect(isChatHistorySyncAllowed({isOpen: true, consentGranted: true})).toBe(true);
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
