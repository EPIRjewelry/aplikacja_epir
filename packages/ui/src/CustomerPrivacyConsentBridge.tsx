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
  /** Stan zgody powiązany z istniejącym UI (np. ConsentToggle czatu) — mapowany na zgody Shopify Customer Privacy. */
  consentGranted: boolean;
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

/**
 * Iteracja 1: bez natywnego bannera Shopify (`withPrivacyBanner: false` jest ustawiane w wywołaniu hooka).
 * Przekazuje decyzję użytkownika z EPIR UI do `customerPrivacy.setTrackingConsent`, żeby Hydrogen Analytics / Shopify
 * mogły filtrować eventy zgodnie z Customer Privacy API.
 *
 * Uwaga produktowa: checkbox czatu i „tracking” są spięte — jeśli kiedyś rozdzielicie zgody (czat vs analityka),
 * rozdzielcie tu pola analytics/marketing/preferences osobno.
 */
export function CustomerPrivacyConsentBridge({
  checkoutDomain,
  storefrontAccessToken,
  country,
  locale,
  consentGranted,
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
    if (!customerPrivacy) return;

    queueMicrotask(() => {
      if (!customerPrivacy) return;

      customerPrivacy.setTrackingConsent(
        {
          analytics: consentGranted,
          marketing: consentGranted,
          preferences: consentGranted,
          sale_of_data: consentGranted,
        },
        (data) => {
          if (!data?.error) return;
          const isProd =
            typeof process !== 'undefined' &&
            process.env.NODE_ENV === 'production';
          if (isProd) return;
          const err = data.error;
          // eslint-disable-next-line no-console -- diagnostyka integracji consent (tylko dev)
          console.warn(
            '[EPIR Customer Privacy]',
            typeof err === 'string' ? err : JSON.stringify(err),
          );
        },
      );
    });
  }, [customerPrivacy, consentGranted]);

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
    if (chatApiUrl && prevConsentGranted.current && !consentGranted) {
      syncChatSessionPrivacyRevoke(chatApiUrl, chatSessionStorageKey);
    }
    prevConsentGranted.current = consentGranted;
  }, [consentGranted, chatApiUrl, chatSessionStorageKey]);

  return null;
}
