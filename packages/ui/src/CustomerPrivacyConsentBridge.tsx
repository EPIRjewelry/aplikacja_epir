import {useCustomerPrivacy} from '@shopify/hydrogen';
import type {CountryCode, LanguageCode} from '@shopify/hydrogen/storefront-api-types';
import {useEffect} from 'react';

export type CustomerPrivacyConsentBridgeProps = {
  checkoutDomain: string;
  storefrontAccessToken: string;
  country?: CountryCode;
  locale?: LanguageCode;
  /** Stan zgody powiązany z istniejącym UI (np. ConsentToggle czatu) — mapowany na zgody Shopify Customer Privacy. */
  consentGranted: boolean;
  /**
   * Gdy storefront SFAPI nie jest na tej samej origin co headless site (bez proxy jak w Oxygen),
   * musi być false — Hydrogen inaczej używa `window.location.host` jako domenę checkout (Failed to fetch).
   */
  sameDomainForStorefrontApi?: boolean;
};

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

  return null;
}
