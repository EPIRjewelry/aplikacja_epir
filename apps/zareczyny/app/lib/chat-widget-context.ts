import {getConsentStorageKey} from '@epir/ui';

/** Kanoniczny kontekst czatu dla headless „zareczyny” — zgodny z workerem i api.chat S2S. */
export const ZARECZYNY_STOREFRONT_ID = 'zareczyny' as const;
export const ZARECZYNY_CHANNEL = 'hydrogen-zareczyny' as const;

/** Id logicznej zgody (Consent Gate) — specyficzny dla storefrontu Zaręczyny. */
export const ZARECZYNY_CONSENT_ID = 'epir-zareczyny-chat-v1' as const;

/** Klucz `localStorage` dla zapisu zgody w storefrontzie Zaręczyny. */
export const ZARECZYNY_CONSENT_STORAGE_KEY =
  getConsentStorageKey(ZARECZYNY_CONSENT_ID);
