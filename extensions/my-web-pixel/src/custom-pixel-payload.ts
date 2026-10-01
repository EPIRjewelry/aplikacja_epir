/**
 * Body POST /pixel dla custom pixela w Customer Events (lax).
 * Live (2026-10-01) wysyłał tylko `{ event, data: event.data }` i gubił `event.clientId`.
 */
export function buildCustomPixelPostBody(event: {
  name?: unknown;
  clientId?: unknown;
  data?: unknown;
  context?: unknown;
}): { type: string; data: Record<string, unknown> } {
  const sessionId = typeof event.clientId === 'string' ? event.clientId.trim() : '';
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
