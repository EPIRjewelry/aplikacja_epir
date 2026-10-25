import {useCustomerPrivacy} from '@shopify/hydrogen';
import type {CountryCode, LanguageCode} from '@shopify/hydrogen/storefront-api-types';
import {useEffect, useRef} from 'react';
import {
  postChatSessionPrivacyUpdate,
  readLastChatSessionIdForPrivacy,
  scrubInvalidChatSessionStorage,
} from './epir-session-browser';

export type CustomerPrivacyConsentBridgeProps = {
  checkoutDomain: string;
  storefrontAccessToken: string;
  country?: CountryCode;
  locale?: LanguageCode;
  /**
   * Tylko przy `pushTrackingConsent={true}`: stan lokalnego UI mapowany na `setTrackingConsent`.
   * Przy banerze Shopify (`pushTrackingConsent={false}`) pomijany — nie przekazuj.
   */
  consentGranted?: boolean;
  /**
   * `false` — Hydrogen z `withPrivacyBanner: true` (Kazka, Zaręczyny): efekt `setTrackingConsent`
   * **nie uruchamia się** (wczesny return); zapis zgody wyłącznie z banera. Bridge nasłuchuje
   * `visitorConsentCollected` i przy `analyticsAllowed === false` cofa sesję czatu w workerze.
   * `true` — legacy: lokalny UI (ConsentToggle) steruje `setTrackingConsent`.
   */
  pushTrackingConsent?: boolean;
  /**
   * Gdy macie BFF `POST /api/{version}/graphql.json` (plik `api.$version.[graphql.json]` w `app/routes`),
   * ustawcie `true`, żeby Hydrogen trafiał na tę samą origin. Gdy proxy nie istnieje — `false`,
   * żeby nie używać `window.location.host` jako „sklepu”.
   */
  sameDomainForStorefrontApi?: boolean;
  /** Hydrogen BFF / App Proxy — cofnięcie zgody → POST `/session-privacy` z ostatnim `session_id` z czatu. */
  chatApiUrl?: string;
  chatSessionStorageKey?: string;
};

type CustomerPrivacyApi = {
  setTrackingConsent: (
    payload: {
      analytics: boolean;
      marketing: boolean;
      preferences: boolean;
      sale_of_data: boolean;
    },
    callback?: (data: {error?: unknown}) => void,
  ) => void;
};

/** Logika efektu sync — testowalna bez renderu React. */
export function syncTrackingConsentIfEnabled(input: {
  pushTrackingConsent: boolean;
  customerPrivacy: CustomerPrivacyApi | null | undefined;
  consentGranted: boolean;
}): void {
  if (!input.pushTrackingConsent || !input.customerPrivacy) return;

  input.customerPrivacy.setTrackingConsent(
    {
      analytics: input.consentGranted,
      marketing: input.consentGranted,
      preferences: input.consentGranted,
      sale_of_data: input.consentGranted,
    },
    (data) => {
      if (!data?.error) return;
      const isProd =
        typeof process !== 'undefined' && process.env.NODE_ENV === 'production';
      if (isProd) return;
      const err = data.error;
      // eslint-disable-next-line no-console -- diagnostyka integracji consent (tylko dev)
      console.warn(
        '[EPIR Customer Privacy]',
        typeof err === 'string' ? err : JSON.stringify(err),
      );
    },
  );
}

function syncChatSessionPrivacyRevoke(chatApiUrl: string, sessionStorageKey: string): void {
  const remembered = readLastChatSessionIdForPrivacy();
  if (!remembered?.sessionId) return;
  void postChatSessionPrivacyUpdate(chatApiUrl, {
    session_id: remembered.sessionId,
    analytics_consent: false,
    analytics_client_id: null,
    ...(remembered.sessionIdSource ? {session_id_source: remembered.sessionIdSource} : {}),
  });
  scrubInvalidChatSessionStorage(sessionStorageKey);
}

/** Most banera Shopify / lokalnego UI → cofnięcie sesji czatu w workerze. */
export function CustomerPrivacyConsentBridge({
  checkoutDomain,
  storefrontAccessToken,
  country,
  locale,
  consentGranted = false,
  pushTrackingConsent = true,
  sameDomainForStorefrontApi = false,
  chatApiUrl,
  chatSessionStorageKey = 'epir-assistant-session',
}: CustomerPrivacyConsentBridgeProps) {
  const {customerPrivacy} = useCustomerPrivacy({
    checkoutDomain,
    storefrontAccessToken,
    withPrivacyBanner: false,
    country,
    locale,
    sameDomainForStorefrontApi,
  });

  useEffect(() => {
    if (!pushTrackingConsent || !customerPrivacy) return;

    queueMicrotask(() => {
      syncTrackingConsentIfEnabled({
        pushTrackingConsent,
        customerPrivacy,
        consentGranted,
      });
    });
  }, [customerPrivacy, consentGranted, pushTrackingConsent]);

  useEffect(() => {
    if (!chatApiUrl) return;
    const onCollected = (ev: Event) => {
      const detail = (ev as CustomEvent<{analyticsAllowed?: boolean}>).detail;
      if (!detail || detail.analyticsAllowed !== false) return;
      syncChatSessionPrivacyRevoke(chatApiUrl, chatSessionStorageKey);
    };
    document.addEventListener('visitorConsentCollected', onCollected, false);
    return () => document.removeEventListener('visitorConsentCollected', onCollected, false);
  }, [chatApiUrl, chatSessionStorageKey]);

  const prevConsentGranted = useRef(consentGranted);
  useEffect(() => {
    if (!pushTrackingConsent) return;
    if (chatApiUrl && prevConsentGranted.current && !consentGranted) {
      syncChatSessionPrivacyRevoke(chatApiUrl, chatSessionStorageKey);
    }
    prevConsentGranted.current = consentGranted;
  }, [consentGranted, chatApiUrl, chatSessionStorageKey, pushTrackingConsent]);

  return null;
}
