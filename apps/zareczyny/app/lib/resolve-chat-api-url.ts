/**
 * Hydrogen (zareczyny) — czat w przeglądarce musi iść na **ten sam origin** (`/api/chat`),
 * żeby uniknąć CORS: fetch z `zareczyny.*` na `epirbizuteria.pl/apps/assistant/*` przez App Proxy
 * często kończy się `TypeError: Failed to fetch` (Shopify nie przekazuje poprawnie CORS).
 *
 * Trasa `api.chat` proxy’uje na worker: `POST https://asystent.epirbizuteria.pl/chat` (S2S + sekret).
 * Theme / TAE nadal może wołać bezpośrednio `/apps/assistant/chat` na domenie sklepu (same-origin).
 */
export function resolveChatApiUrl(_configured: string | undefined): string {
  return '/api/chat';
}
