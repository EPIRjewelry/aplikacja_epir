import { EPIR_SESSION_COOKIE_NAME } from '@epir/utils';

/** Odczyt `_epir_session_id` w przeglądarce (ten sam cookie co Web Pixel). */
export function readEpirSessionIdFromDocumentCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const parts = document.cookie.split(';');
  for (const part of parts) {
    const t = part.trim();
    const i = t.indexOf('=');
    if (i === -1) continue;
    if (t.slice(0, i).trim() !== EPIR_SESSION_COOKIE_NAME) continue;
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

/**
 * Id sesji czatu: istniejąca rozmowa w sessionStorage ma pierwszeństwo;
 * inaczej cookie analityczne (nowa sesja wyrównana z pikselem).
 */
export function resolveEffectiveChatSessionId(
  sessionStorageKey = 'epir-assistant-session',
): string | null {
  if (typeof window === 'undefined') return null;
  const existing = sessionStorage.getItem(sessionStorageKey)?.trim();
  if (existing) return existing;
  const fromCookie = readEpirSessionIdFromDocumentCookie();
  if (fromCookie) {
    sessionStorage.setItem(sessionStorageKey, fromCookie);
    return fromCookie;
  }
  return null;
}
