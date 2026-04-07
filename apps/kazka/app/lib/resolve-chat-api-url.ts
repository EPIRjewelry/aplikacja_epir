/**
 * Hydrogen (kazka) wysyła czat na same-origin `POST /api/chat`,
 * a resource route robi S2S proxy do workera z wymaganym sekretem.
 */
export function resolveChatApiUrl(_configured: string | undefined): string {
  return '/api/chat';
}
