/**
 * Ten sam klucz co czat (assistant-runtime / epir-session-browser).
 * Piksel nie wymyśla drugiego identyfikatora.
 */
export const EPIR_CHAT_SESSION_STORAGE_KEY = 'epir-assistant-session';

export type PixelSessionSources = {
  /** Cookie `_epir_session_id` (top frame, `browser.cookie`). */
  epirSessionId?: string | null;
  /** Cookie `_shopify_y`. Shopify przestał je ustawiać 2026-01-01; zostaje dla starych przeglądarek. */
  shopifyY?: string | null;
  /** `sessionStorage['epir-assistant-session']` — to, co czat wysyła, gdy oba cookie są puste. */
  chatSessionStorage?: string | null;
  /** `event.clientId` (albo `event.data.clientId`). Zamiennik `_shopify_y` przy zgodzie analitycznej. */
  eventClientId?: string | null;
  /** `init.clientId` / `init.data.clientId`. */
  initClientId?: string | null;
  /** Id już wybrane w tym uruchomieniu piksela, gdy kolejne zdarzenie nie niesie clientId. */
  remembered?: string | null;
};

export type PixelSessionPick = {
  sessionId: string;
  /** Cookie `_epir_session_id` było puste — zapisz `sessionId`, żeby czat czytał ten sam klucz. */
  pinEpirCookie: boolean;
  /** Klucz czatu w sessionStorage był pusty — zapisz `sessionId`. Nie nadpisuj już istniejącego. */
  pinChatStorage: boolean;
};

function trimId(value: string | null | undefined): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

/**
 * Kolejność jak w żywym czacie (`resolveEffectiveAssistantSessionId`), potem clientId Shopify.
 * 1. `_epir_session_id`
 * 2. `_shopify_y`
 * 3. `epir-assistant-session`
 * 4. `event.clientId` / `init.clientId`
 * 5. id zapamiętane z wcześniejszego zdarzenia w tym samym pikselu
 */
export function pickEpirPixelSessionId(sources: PixelSessionSources): PixelSessionPick {
  const epir = trimId(sources.epirSessionId);
  const shopifyY = trimId(sources.shopifyY);
  const chat = trimId(sources.chatSessionStorage);
  const eventClientId = trimId(sources.eventClientId);
  const initClientId = trimId(sources.initClientId);
  const remembered = trimId(sources.remembered);
  const sessionId = epir || shopifyY || chat || eventClientId || initClientId || remembered;
  if (!sessionId) {
    return {sessionId: '', pinEpirCookie: false, pinChatStorage: false};
  }
  return {
    sessionId,
    pinEpirCookie: epir.length === 0,
    pinChatStorage: chat.length === 0,
  };
}
