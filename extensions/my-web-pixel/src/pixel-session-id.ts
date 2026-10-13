/**
 * Ten sam klucz co czat (assistant-runtime / epir-session-browser).
 * Piksel nie wymyśla drugiego identyfikatora czatu — czyta `sess_*` tylko do `chat_session_linked`.
 */
export const EPIR_CHAT_SESSION_STORAGE_KEY = 'epir-assistant-session';

/** Wartość sessionStorage czatu akceptowana do linku z pikselem. */
export const CHAT_SESSION_LINK_ID_RE = /^sess_[A-Za-z0-9-]{1,123}$/;

export type PixelSessionSources = {
  /** `event.clientId` (albo `event.data.clientId`). */
  eventClientId?: string | null;
  /** `init.clientId` / `init.data.clientId`. */
  initClientId?: string | null;
  /** Id już wybrane w tym uruchomieniu piksela, gdy kolejne zdarzenie nie niesie clientId. */
  remembered?: string | null;
};

export type PixelSessionPick = {
  /** Id do `pixel_events.session_id` — zawsze Shopify clientId, nigdy `sess_*`. */
  sessionId: string;
};

function trimId(value: string | null | undefined): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

export function isValidChatSessionLinkId(value: string | null | undefined): boolean {
  const id = trimId(value);
  return Boolean(id && CHAT_SESSION_LINK_ID_RE.test(id));
}

/**
 * Tożsamość zdarzeń piksela = Web Pixels `clientId` (bez `_shopify_y`, bez chat sessionStorage).
 */
export function pickEpirPixelSessionId(sources: PixelSessionSources): PixelSessionPick {
  const sessionId =
    trimId(sources.eventClientId) ||
    trimId(sources.initClientId) ||
    trimId(sources.remembered);
  return {sessionId};
}
