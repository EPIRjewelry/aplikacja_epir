import {
  EPIR_SESSION_COOKIE_NAME,
  EPIR_SHOPIFY_Y_COOKIE_NAME,
} from '@epir/utils';

const CHAT_SESSION_STORAGE_PREFIX = 'sess_';

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

/** Odczyt `_epir_session_id` w przeglądarce. */
export function readEpirSessionIdFromDocumentCookie(): string | null {
  return readNamedDocumentCookie(EPIR_SESSION_COOKIE_NAME);
}

/** Shopify `_shopify_y` — ta sama wartość co Web Pixel `event.clientId`. */
export function readShopifyYFromDocumentCookie(): string | null {
  return readNamedDocumentCookie(EPIR_SHOPIFY_Y_COOKIE_NAME);
}

/** `_epir_session_id` skopiowany z piksela (`_shopify_y`) — nie jest osobnym id czatu. */
export function isEpirSessionCookiePixelCopy(
  epirSessionId?: string | null,
  shopifyY?: string | null,
): boolean {
  const epir = epirSessionId?.trim() || null;
  const y = shopifyY?.trim() || null;
  return Boolean(epir && y && epir === y);
}

/**
 * Id joina pixel (tylko przy zgodzie analitycznej) — osobne od `session_id` czatu.
 * Nie wysyłaj bez `analyticsProcessingAllowed() === true`.
 */
export function readAnalyticsClientIdForChat(consent: boolean | null): string | null {
  if (consent !== true) return null;
  const shopifyY = readShopifyYFromDocumentCookie();
  if (shopifyY) return shopifyY;
  const epir = readEpirSessionIdFromDocumentCookie();
  if (epir && !isEpirSessionCookiePixelCopy(epir, shopifyY)) return epir;
  return null;
}

/**
 * Cookie `_epir_session_id` jako session_id czatu tylko przy zgodzie i gdy to nie kopia `_shopify_y`.
 */
function readChatSessionIdFromEpirCookie(consent: boolean | null): string | null {
  if (consent !== true) return null;
  const epir = readEpirSessionIdFromDocumentCookie();
  if (!epir) return null;
  const shopifyY = readShopifyYFromDocumentCookie();
  if (isEpirSessionCookiePixelCopy(epir, shopifyY)) return null;
  return epir;
}

/**
 * @deprecated Pixel/apex SSOT — nie używać jako `session_id` czatu (Customer Privacy).
 */
export function readBrowserAnalyticsSessionId(): string | null {
  const epir = readEpirSessionIdFromDocumentCookie();
  if (epir) return epir;
  return readShopifyYFromDocumentCookie();
}

export type ChatSessionIdSource = 'cookie' | 'session_storage';

export type ResolvedChatSession = {
  sessionId: string | null;
  sessionIdSource: ChatSessionIdSource | null;
  /** Pixel `clientId` / `_shopify_y` — tylko przy zgodzie; nie zastępuje `sessionId`. */
  analyticsClientId?: string | null;
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

function isValidChatSessionStorageValue(value: string): boolean {
  return value.startsWith(CHAT_SESSION_STORAGE_PREFIX);
}

const LAST_CHAT_SESSION_FOR_PRIVACY_KEY = 'epir-last-chat-session-for-privacy';

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
        sessionIdSource: sessionIdSource ?? null,
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
    if (!id) return null;
    return {
      sessionId: id,
      sessionIdSource:
        parsed.sessionIdSource === 'cookie' || parsed.sessionIdSource === 'session_storage'
          ? parsed.sessionIdSource
          : null,
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
    ...(remembered.sessionIdSource ? {session_id_source: remembered.sessionIdSource} : {}),
  });
  scrubInvalidChatSessionStorage(sessionStorageKey);
}

/** Usuwa legacy wartości (np. `_shopify_y`) z sessionStorage czatu. */
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

export function resolveEffectiveChatSessionWithMeta(
  sessionStorageKey = 'epir-assistant-session',
): ResolvedChatSession {
  if (typeof window === 'undefined') {
    return {sessionId: null, sessionIdSource: null};
  }

  const consent = readShopifyAnalyticsProcessingAllowed();
  const analyticsClientId = readAnalyticsClientIdForChat(consent);

  const fromEpirCookie = readChatSessionIdFromEpirCookie(consent);
  if (fromEpirCookie) {
    return {
      sessionId: fromEpirCookie,
      sessionIdSource: 'cookie',
      analyticsClientId,
    };
  }

  const fromStorage = readOrMintChatSessionStorage(sessionStorageKey);
  return {...fromStorage, analyticsClientId};
}

export function resolveEffectiveChatSessionId(
  sessionStorageKey = 'epir-assistant-session',
): string | null {
  return resolveEffectiveChatSessionWithMeta(sessionStorageKey).sessionId;
}

/**
 * Echo `session_id` z workera nie zastępuje cookie.
 * Zapisuje echo tylko do pustego klucza (wartości muszą mieć prefiks `sess_`).
 */
export function persistChatSessionIdFromWorker(
  workerSessionId: string | null | undefined,
  sessionStorageKey = 'epir-assistant-session',
): void {
  if (typeof window === 'undefined') return;
  const echoed = typeof workerSessionId === 'string' ? workerSessionId.trim() : '';
  if (!echoed || !isValidChatSessionStorageValue(echoed)) return;

  const consent = readShopifyAnalyticsProcessingAllowed();
  if (readChatSessionIdFromEpirCookie(consent)) return;

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

let customerPrivacyListenerInstalled = false;

/**
 * Cofnięcie zgody analitycznej w trakcie sesji → `analytics_consent: false` do workera.
 */
export function installShopifyCustomerPrivacyChatListeners(
  chatApiUrl: string,
  sessionStorageKey = 'epir-assistant-session',
): void {
  if (typeof document === 'undefined' || customerPrivacyListenerInstalled) return;
  customerPrivacyListenerInstalled = true;

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
