import {getConsentStorageKey} from '@epir/ui';

export const KAZKA_STOREFRONT_ID = 'kazka' as const;
export const KAZKA_CHANNEL = 'hydrogen-kazka' as const;

/** Id logicznej zgody (Consent Gate) — specyficzny dla storefrontu Kazka. */
export const KAZKA_CONSENT_ID = 'epir-kazka-chat-v1' as const;

/** Klucz `localStorage` dla zapisu zgody w storefrontzie Kazka. */
export const KAZKA_CONSENT_STORAGE_KEY = getConsentStorageKey(KAZKA_CONSENT_ID);
