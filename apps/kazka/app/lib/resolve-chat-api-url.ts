/**
 * Hydrogen (kazka) — same-origin `POST /api/chat`; BFF proxy do workera z sekretem S2S.
 */
export function resolveChatApiUrl(_configured?: string): string {
  return '/api/chat';
}
