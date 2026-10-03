import {
  EPIR_SESSION_COOKIE_NAME,
  EPIR_SHOPIFY_Y_COOKIE_NAME,
  resolveEpirAnalyticsSessionId,
} from '@epir/utils';

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

/** Odczyt `_epir_session_id` w przeglądarce (alias `_shopify_y`). */
export function readEpirSessionIdFromDocumentCookie(): string | null {
  return readNamedDocumentCookie(EPIR_SESSION_COOKIE_NAME);
}

/** Shopify `_shopify_y` — ta sama wartość co Web Pixel `event.clientId`. */
export function readShopifyYFromDocumentCookie(): string | null {
  return readNamedDocumentCookie(EPIR_SHOPIFY_Y_COOKIE_NAME);
}

/**
 * Klucz joina czat↔pixel.
 * 1. `_epir_session_id` (alias `_shopify_y`, gdy snippet go skopiował)
 * 2. inaczej `_shopify_y`
 * Bez generowania UUID.
 */
export function readBrowserAnalyticsSessionId(): string | null {
  return resolveEpirAnalyticsSessionId({
    epirSessionId: readEpirSessionIdFromDocumentCookie(),
    shopifyY: readShopifyYFromDocumentCookie(),
  }).sessionId;
}

/**
 * Id sesji czatu wysyłane do workera.
 * Gdy cookie istnieje, wygrywa z `epir-assistant-session` i z id zwróconym przez worker.
 * Nowa sesja (pusta sessionStorage) zapisuje wartość cookie.
 * Już zapisany, inny identyfikator nie jest nadpisywany.
 */
export function resolveEffectiveChatSessionId(
  sessionStorageKey = 'epir-assistant-session',
): string | null {
  if (typeof window === 'undefined') return null;
  const fromCookie = readBrowserAnalyticsSessionId();
  if (fromCookie) {
    try {
      const existing = sessionStorage.getItem(sessionStorageKey)?.trim() ?? '';
      if (!existing) sessionStorage.setItem(sessionStorageKey, fromCookie);
    } catch {
      /* tryb prywatny / zablokowany storage */
    }
    return fromCookie;
  }
  try {
    const existing = sessionStorage.getItem(sessionStorageKey)?.trim();
    return existing || null;
  } catch {
    return null;
  }
}

/**
 * Echo `session_id` z workera nie zastępuje cookie.
 * Bez cookie: zapisuje echo tylko do pustego klucza (nie migruje już rozjechanej sesji).
 */
export function persistChatSessionIdFromWorker(
  workerSessionId: string | null | undefined,
  sessionStorageKey = 'epir-assistant-session',
): void {
  if (typeof window === 'undefined') return;
  const echoed = typeof workerSessionId === 'string' ? workerSessionId.trim() : '';
  if (!echoed) return;
  if (readBrowserAnalyticsSessionId()) return;
  try {
    const existing = sessionStorage.getItem(sessionStorageKey)?.trim() ?? '';
    if (existing && existing !== echoed) return;
    if (!existing) sessionStorage.setItem(sessionStorageKey, echoed);
  } catch {
    /* ignore */
  }
}
