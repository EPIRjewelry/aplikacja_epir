/** Cookie analityczne — ten sam klucz co Web Pixel i landingi. */
export const EPIR_SESSION_COOKIE_NAME = '_epir_session_id';

/**
 * Shopify client token (`clientId` w Web Pixels API).
 * Gdy brak `_epir_session_id`, piksel wysyła `event.clientId` ≈ wartość tego cookie.
 */
export const EPIR_SHOPIFY_Y_COOKIE_NAME = '_shopify_y';

export function readNamedCookieFromHeader(
  cookieHeader: string | null | undefined,
  name: string,
): string | null {
  if (!cookieHeader?.trim() || !name) return null;
  for (const part of cookieHeader.split(';')) {
    const t = part.trim();
    const i = t.indexOf('=');
    if (i === -1) continue;
    const key = t.slice(0, i).trim();
    if (key !== name) continue;
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

export function readEpirSessionIdFromCookieHeader(
  cookieHeader: string | null | undefined,
): string | null {
  return readNamedCookieFromHeader(cookieHeader, EPIR_SESSION_COOKIE_NAME);
}

export function readShopifyYFromCookieHeader(
  cookieHeader: string | null | undefined,
): string | null {
  return readNamedCookieFromHeader(cookieHeader, EPIR_SHOPIFY_Y_COOKIE_NAME);
}

export type ResolveEpirAnalyticsSessionIdInput = {
  /** Wartość cookie `_epir_session_id` (już odczytana). */
  epirSessionId?: string | null;
  /**
   * Wartość cookie `_shopify_y` / Web Pixel `clientId`.
   * Używana tylko gdy brak `_epir_session_id`.
   */
  shopifyY?: string | null;
};

export type ResolveEpirAnalyticsSessionIdResult = {
  /** Identyfikator do pixel `session_id` i atrybutu koszyka `_epir_session_id`. */
  sessionId: string | null;
  /**
   * Gdy `true`, apex/landing powinien zapisać `sessionId` do cookie `_epir_session_id`,
   * żeby kolejne zdarzenia piksela czytały ten sam klucz (bez losowego ID).
   */
  shouldSetEpirCookie: boolean;
};

/**
 * SSOT tożsamości sesji (Web Pixel + koszyk apex):
 * 1. `_epir_session_id` jeśli niepusty
 * 2. inaczej `_shopify_y` (= Shopify `clientId`)
 * 3. inaczej brak (NULL / pusty) — bez generowania `s_*` / `session_*`
 *
 * Na głównym sklepie (Liquid) nikt wcześniej nie ustawiał `_epir_session_id`
 * (robią to landing Ads i Hydrogen tylko gdy cookie już istnieje). Snippet apex
 * ustawia cookie z `_shopify_y`, żeby atrybut koszyka = to, co piksel wysyła.
 */
export function resolveEpirAnalyticsSessionId(
  input: ResolveEpirAnalyticsSessionIdInput,
): ResolveEpirAnalyticsSessionIdResult {
  const epir = input.epirSessionId?.trim() || null;
  if (epir) return { sessionId: epir, shouldSetEpirCookie: false };
  const y = input.shopifyY?.trim() || null;
  if (y) return { sessionId: y, shouldSetEpirCookie: true };
  return { sessionId: null, shouldSetEpirCookie: false };
}

/** Odczyt z nagłówka Cookie: ta sama reguła co powyżej. */
export function resolveEpirAnalyticsSessionIdFromCookieHeader(
  cookieHeader: string | null | undefined,
): ResolveEpirAnalyticsSessionIdResult {
  return resolveEpirAnalyticsSessionId({
    epirSessionId: readEpirSessionIdFromCookieHeader(cookieHeader),
    shopifyY: readShopifyYFromCookieHeader(cookieHeader),
  });
}
