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
}: CustomerPrivacyConsentBridgeProps) {
  const {customerPrivacy} = useCustomerPrivacy({
    checkoutDomain,
    storefrontAccessToken,
    withPrivacyBanner: false,
    country,
    locale,
  });

  useEffect(() => {
    if (!customerPrivacy) return;

    customerPrivacy.setTrackingConsent(
      {
        analytics: consentGranted,
        marketing: consentGranted,
        preferences: consentGranted,
        sale_of_data: consentGranted,
      },
      (data) => {
        if (data?.error) {
          // eslint-disable-next-line no-console -- diagnostyka integracji consent (dev / Pages logs)
          console.warn('[EPIR Customer Privacy]', data.error);
        }
      },
    );
  }, [customerPrivacy, consentGranted]);

  return null;
}
