/**
 * Wspólne typy i persystencja zgody (Consent Gate) dla storefrontów EPIR / Hydrogen.
 * Backend: workers/chat — POST /consent (S2S) lub App Proxy.
 *
 * `consentId` i `source` definiuje warstwa aplikacji (np. Kazka / zaręczyny), nie ten pakiet.
 */

export type ConsentPayload = {
  consentId: string;
  granted: boolean;
  source: string;
  storefrontId: string;
  channel: string;
  shopDomain: string;
  route: string;
  sessionId: string;
  anonymousId: string;
  customerId: string | null;
  timestamp: number;
};

const DEFAULT_STORAGE_PREFIX = 'epir-consent';

/** Ten sam klucz co sesja czatu w ChatWidget (`epir-assistant-session`). */
const CHAT_SESSION_STORAGE_KEY = 'epir-assistant-session';

export function getConsentStorageKey(consentId: string): string {
  return `${DEFAULT_STORAGE_PREFIX}:${consentId}`;
}

export function buildConsentPayload(args: {
  consentId: string;
  granted: boolean;
  source: string;
  storefrontId: string;
  channel: string;
  shopDomain: string;
  route: string;
  sessionId: string;
  anonymousId: string;
  customerId?: string | null;
  timestamp?: number;
}): ConsentPayload {
  return {
    consentId: args.consentId,
    granted: args.granted,
    source: args.source,
    storefrontId: args.storefrontId,
    channel: args.channel,
    shopDomain: args.shopDomain,
    route: args.route,
    sessionId: args.sessionId,
    anonymousId: args.anonymousId,
    customerId: args.customerId ?? null,
    timestamp: args.timestamp ?? Date.now(),
  };
}

/**
 * Odczyt zapisanej zgody w localStorage.
 * @returns `true` / `false` albo `null` gdy brak wpisu lub SSR.
 */
export function getStoredConsent(storageKey: string): boolean | null {
  const key = storageKey;
  if (typeof window === 'undefined') return null;
  const v = localStorage.getItem(key);
  if (v === null) return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return null;
}

export function storeConsent(granted: boolean, storageKey: string): void {
  const key = storageKey;
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, granted ? 'true' : 'false');
}

/** Id sesji asystenta (sessionStorage) — spójne z ChatWidget. */
export function getConsentSessionId(): string {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem(CHAT_SESSION_STORAGE_KEY) ?? '';
}
