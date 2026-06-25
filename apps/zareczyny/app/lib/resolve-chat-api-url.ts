/**
 * Hydrogen — czat w przeglądarce na same-origin `POST /api/chat` (BFF → worker S2S).
 * Theme / TAE woła `/apps/assistant/chat` na domenie sklepu (App Proxy).
 */
export function resolveChatApiUrl(_configured?: string): string {
  return '/api/chat';
}
