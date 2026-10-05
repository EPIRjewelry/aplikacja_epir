/**
 * Body POST /pixel dla custom pixela w Customer Events (lax).
 * Live (2026-10-01) wysyłał tylko `{ event, data: event.data }` i gubił `event.clientId`.
 * Część zdarzeń ma puste `event.clientId` przy ustawionym `init.clientId`.
 * Worker (`handlePixelPost`) czyta `data.sessionId`, potem `data.session_id`, potem `data.clientId`.
 * Nie czyta nagłówka Cookie.
 */
function trimmedId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Ta sama kolejność co `extractClientIdFromInit` w app pixelu. */
export function clientIdFromPixelInit(init: unknown): string {
  if (!init || typeof init !== 'object') return '';
  const record = init as { clientId?: unknown; data?: unknown };
  const direct = trimmedId(record.clientId);
  if (direct) return direct;
  if (record.data && typeof record.data === 'object') {
    return trimmedId((record.data as { clientId?: unknown }).clientId);
  }
  return '';
}

export function buildCustomPixelPostBody(
  event: {
    name?: unknown;
    clientId?: unknown;
    data?: unknown;
    context?: unknown;
  },
  init?: unknown,
): { type: string; data: Record<string, unknown> } {
  const fromEvent = trimmedId(event.clientId);
  const sessionId = fromEvent || clientIdFromPixelInit(init);
  const commerce =
    event.data && typeof event.data === 'object'
      ? { ...(event.data as Record<string, unknown>) }
      : {};
  const data: Record<string, unknown> = {
    ...commerce,
    clientId: sessionId,
    sessionId,
    session_id: sessionId,
  };
  if (event.context && typeof event.context === 'object') {
    data.context = event.context;
  }
  return {
    type: typeof event.name === 'string' ? event.name : '',
    data,
  };
}
