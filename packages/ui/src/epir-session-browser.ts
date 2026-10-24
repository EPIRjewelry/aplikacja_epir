import {EPIR_SESSION_COOKIE_NAME} from '@epir/utils';

const CHAT_SESSION_STORAGE_PREFIX = 'sess_';
/** Id czatu w sessionStorage — ten sam wzorzec, który piksel linkuje. */
const CHAT_SESSION_ID_RE = /^sess_[A-Za-z0-9-]{1,123}$/;
const LAST_CHAT_SESSION_FOR_PRIVACY_KEY = 'epir-last-chat-session-for-privacy';

function readNamedDocumentCookie(name: string): string | null {
  if (typeof document === 'undefined' || !name) return null;
  const parts = document.cookie.split(';');
  for (const part of parts) {
    const t = part.trim();
    const i = t.indexOf('=');
    if (i === -1) continue;
    if (t.slice(0, i).trim() !== name) continue;
    try {
      const v = decodeURIComponent(t.slice(i + 1).trim());
      return v.trim() || null;
    } catch {
      const v = t.slice(i + 1).trim();
      return v || null;
    }
  }
  return null;
}

/** Odczyt `_epir_session_id` (landing / koszyk) — nie używać jako `session_id` czatu. */
export function readEpirSessionIdFromDocumentCookie(): string | null {
  return readNamedDocumentCookie(EPIR_SESSION_COOKIE_NAME);
}

/**
 * @deprecated Nie czytać `_shopify_y` w JS sklepu — id piksela = Web Pixels `event.clientId`.
 */
export function readShopifyYFromDocumentCookie(): string | null {
  return null;
}

/** @deprecated Link czat↔piksel idzie przez web pixel `chat_session_linked`, nie z widżetu. */
export function isEpirSessionCookiePixelCopy(
  _epirSessionId?: string | null,
  _shopifyY?: string | null,
): boolean {
  return false;
}

/** @deprecated Widżet nie wysyła `analytics_client_id`. */
export function readAnalyticsClientIdForChat(_consent: boolean | null): string | null {
  return null;
}

/**
 * @deprecated Pixel/apex SSOT — nie używać jako `session_id` czatu (Customer Privacy).
 */
export function readBrowserAnalyticsSessionId(): string | null {
  return readEpirSessionIdFromDocumentCookie();
}

export type ChatSessionIdSource = 'cookie' | 'session_storage';

export type ResolvedChatSession = {
  sessionId: string | null;
  sessionIdSource: ChatSessionIdSource | null;
};

/** Shopify Customer Privacy API — brak API = `null` (unknown, nie wysyłaj do workera). */
export function readShopifyAnalyticsProcessingAllowed(): boolean | null {
  if (typeof window === 'undefined') return null;
  try {
    const shopify = (window as {Shopify?: {customerPrivacy?: {analyticsProcessingAllowed?: () => boolean}}})
      .Shopify;
    const fn = shopify?.customerPrivacy?.analyticsProcessingAllowed;
    if (typeof fn !== 'function') return null;
    return fn() === true;
  } catch {
    return null;
  }
}

/** Shopify Customer Privacy API — brak API = `null` (nieznane). */
export function readShopifyPreferencesProcessingAllowed(): boolean | null {
  if (typeof window === 'undefined') return null;
  try {
    const shopify = (window as {
      Shopify?: {customerPrivacy?: {preferencesProcessingAllowed?: () => boolean}};
    }).Shopify;
    const fn = shopify?.customerPrivacy?.preferencesProcessingAllowed;
    if (typeof fn !== 'function') return null;
    return fn() === true;
  } catch {
    return null;
  }
}

export function resolveChatPrivacyCapabilities(): {analytics: boolean; preferences: boolean} {
  const analytics = readShopifyAnalyticsProcessingAllowed();
  const preferences = readShopifyPreferencesProcessingAllowed();
  return {
    analytics: analytics === true,
    preferences: preferences === true,
  };
}

function isValidChatSessionStorageValue(value: string): boolean {
  return CHAT_SESSION_ID_RE.test(value);
}

export type RememberedChatSessionForPrivacy = {
  sessionId: string;
  sessionIdSource: ChatSessionIdSource | null;
};

/** Ostatni `session_id` wysłany w `/chat` — używany przy cofnięciu zgody (bez remintu). */
export function rememberChatSessionIdForPrivacy(
  sessionId: string | null | undefined,
  sessionIdSource?: ChatSessionIdSource | null,
): void {
  if (typeof window === 'undefined') return;
  const id = sessionId?.trim();
  if (!id || !isValidChatSessionStorageValue(id)) return;
  try {
    sessionStorage.setItem(
      LAST_CHAT_SESSION_FOR_PRIVACY_KEY,
      JSON.stringify({
        sessionId: id,
        sessionIdSource: 'session_storage',
      }),
    );
  } catch {
    /* storage niedostępny */
  }
}

export function readLastChatSessionIdForPrivacy(): RememberedChatSessionForPrivacy | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(LAST_CHAT_SESSION_FOR_PRIVACY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      sessionId?: string;
      sessionIdSource?: ChatSessionIdSource | null;
    };
    const id = parsed.sessionId?.trim();
    if (!id || !isValidChatSessionStorageValue(id)) return null;
    return {
      sessionId: id,
      sessionIdSource: 'session_storage',
    };
  } catch {
    return null;
  }
}

function postChatSessionPrivacyRevoke(
  chatApiUrl: string,
  sessionStorageKey: string,
): void {
  const remembered = readLastChatSessionIdForPrivacy();
  if (!remembered?.sessionId) return;
  void postChatSessionPrivacyUpdate(chatApiUrl, {
    session_id: remembered.sessionId,
    analytics_consent: false,
    analytics_client_id: null,
    session_id_source: 'session_storage',
  });
  scrubInvalidChatSessionStorage(sessionStorageKey);
}

/** Usuwa legacy wartości (np. id piksela) z sessionStorage czatu. */
export function scrubInvalidChatSessionStorage(sessionStorageKey = 'epir-assistant-session'): void {
  if (typeof window === 'undefined') return;
  try {
    const stored = sessionStorage.getItem(sessionStorageKey)?.trim() ?? '';
    if (stored && !isValidChatSessionStorageValue(stored)) {
      sessionStorage.removeItem(sessionStorageKey);
    }
  } catch {
    /* storage niedostępny */
  }
}

/**
 * Tylko odczyt `sess_*` (ścieżka odczytu: historia, klucze transkryptu). Nigdy nie mintuje.
 * Mint wyłącznie w ścieżce wysyłki (`resolveEffectiveChatSessionWithMeta`).
 */
export function readStoredChatSessionId(
  sessionStorageKey = 'epir-assistant-session',
): string | null {
  if (typeof window === 'undefined') return null;
  scrubInvalidChatSessionStorage(sessionStorageKey);
  try {
    const stored = sessionStorage.getItem(sessionStorageKey)?.trim() ?? '';
    return isValidChatSessionStorageValue(stored) ? stored : null;
  } catch {
    return null;
  }
}

/**
 * Odczyt historii z serwera: panel otwarty; opcjonalnie lokalna zgoda czatu (Hydrogen Kazka).
 * Zaręczyny: `requireChatConsent={false}` — historia bez checkboxa zgody na czat.
 */
export function isChatHistorySyncAllowed(input: {
  isOpen: boolean;
  consentGranted?: boolean;
  requireChatConsent?: boolean;
}): boolean {
  if (input.isOpen !== true) return false;
  if (input.requireChatConsent === false) return true;
  return input.consentGranted === true;
}

function mintChatSessionStorageId(sessionStorageKey: string): ResolvedChatSession {
  const minted = `${CHAT_SESSION_STORAGE_PREFIX}${crypto.randomUUID()}`;
  try {
    sessionStorage.setItem(sessionStorageKey, minted);
  } catch {
    /* nadal zwróć mint */
  }
  return {sessionId: minted, sessionIdSource: 'session_storage'};
}

function readOrMintChatSessionStorage(sessionStorageKey: string): ResolvedChatSession {
  scrubInvalidChatSessionStorage(sessionStorageKey);
  try {
    const existing = sessionStorage.getItem(sessionStorageKey)?.trim();
    if (existing && isValidChatSessionStorageValue(existing)) {
      return {sessionId: existing, sessionIdSource: 'session_storage'};
    }
  } catch {
    /* mint poniżej */
  }
  try {
    return mintChatSessionStorageId(sessionStorageKey);
  } catch {
    return {sessionId: null, sessionIdSource: null};
  }
}

/**
 * `session_id` czatu = wyłącznie `sess_*` w sessionStorage.
 * Link do piksela: web pixel czyta ten klucz i wysyła `chat_session_linked` z `event.clientId`.
 */
export function resolveEffectiveChatSessionWithMeta(
  sessionStorageKey = 'epir-assistant-session',
): ResolvedChatSession {
  if (typeof window === 'undefined') {
    return {sessionId: null, sessionIdSource: null};
  }
  return readOrMintChatSessionStorage(sessionStorageKey);
}

export function resolveEffectiveChatSessionId(
  sessionStorageKey = 'epir-assistant-session',
): string | null {
  return resolveEffectiveChatSessionWithMeta(sessionStorageKey).sessionId;
}

/**
 * Echo `session_id` z workera — zapis tylko do pustego klucza (`sess_*`).
 */
export function persistChatSessionIdFromWorker(
  workerSessionId: string | null | undefined,
  sessionStorageKey = 'epir-assistant-session',
): void {
  if (typeof window === 'undefined') return;
  const echoed = typeof workerSessionId === 'string' ? workerSessionId.trim() : '';
  if (!echoed || !isValidChatSessionStorageValue(echoed)) return;

  try {
    scrubInvalidChatSessionStorage(sessionStorageKey);
    const existing = sessionStorage.getItem(sessionStorageKey)?.trim() ?? '';
    if (existing && existing !== echoed) return;
    if (!existing) sessionStorage.setItem(sessionStorageKey, echoed);
  } catch {
    /* ignore */
  }
}

/** Ten sam wzorzec ścieżki co historia czatu (GE App Proxy + Hydrogen `/api/chat`). */
export function resolveChatSessionPrivacyApiUrl(chatApiUrl: string): string | null {
  if (!chatApiUrl?.trim()) return null;

  const rewritePath = (pathname: string): string | null => {
    if (pathname.endsWith('/api/chat')) {
      return pathname.slice(0, -'/api/chat'.length) + '/api/chat-session-privacy';
    }
    if (pathname.endsWith('/chat')) {
      return pathname.slice(0, -'/chat'.length) + '/session-privacy';
    }
    return null;
  };

  try {
    const base =
      typeof window !== 'undefined' ? window.location.origin : 'https://epir.invalid';
    const url = new URL(chatApiUrl, base);
    const nextPath = rewritePath(url.pathname);
    if (!nextPath) return null;
    url.pathname = nextPath;
    return typeof window !== 'undefined' && url.origin === window.location.origin
      ? `${url.pathname}${url.search}`
      : url.toString();
  } catch {
    if (chatApiUrl.endsWith('/api/chat')) {
      return chatApiUrl.replace(/\/api\/chat$/, '/api/chat-session-privacy');
    }
    if (chatApiUrl.endsWith('/chat')) {
      return chatApiUrl.replace(/\/chat$/, '/session-privacy');
    }
    return null;
  }
}

/** App Proxy lub Hydrogen BFF — SessionDO + D1 przez worker `/session-privacy`. */
export async function postChatSessionPrivacyUpdate(
  chatApiUrl: string,
  body: Record<string, unknown>,
): Promise<void> {
  const url = resolveChatSessionPrivacyApiUrl(chatApiUrl);
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      credentials: 'include',
      body: JSON.stringify(body),
    });
  } catch {
    /* sieć / brak route — kolejna tura czatu nadal niesie analytics_consent */
  }
}

/** Per-document — stuby testowe podmieniają `document`, więc flaga boolean blokowałaby re-install. */
let customerPrivacyListenerDoc: Document | null = null;

/**
 * Cofnięcie zgody analitycznej w trakcie sesji → `analytics_consent: false` do workera.
 */
export function installShopifyCustomerPrivacyChatListeners(
  chatApiUrl: string,
  sessionStorageKey = 'epir-assistant-session',
): void {
  if (typeof document === 'undefined' || customerPrivacyListenerDoc === document) return;
  customerPrivacyListenerDoc = document;

  document.addEventListener(
    'visitorConsentCollected',
    (ev) => {
      const detail = (ev as CustomEvent<{analyticsAllowed?: boolean}>).detail;
      if (!detail || detail.analyticsAllowed !== false) return;
      postChatSessionPrivacyRevoke(chatApiUrl, sessionStorageKey);
    },
    false,
  );
}
