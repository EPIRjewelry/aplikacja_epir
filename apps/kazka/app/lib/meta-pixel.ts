import {readShopifyMarketingProcessingAllowed} from '@epir/ui';
import {useEffect, useState} from 'react';
import {META_PIXEL_ID} from '~/lib/meta-pixel-id';

export {META_PIXEL_ID};

type FbqFn = ((...args: unknown[]) => void) & {
  queue?: unknown[][];
  loaded?: boolean;
  version?: string;
  callMethod?: (...args: unknown[]) => void;
};

declare global {
  interface Window {
    fbq?: FbqFn;
    _fbq?: FbqFn;
  }
}

let initialized = false;

/** Meta Pixel po zgodzie marketingowej z banera Shopify Customer Privacy. */
export function isMetaPixelConsentGranted(): boolean {
  return readShopifyMarketingProcessingAllowed() === true;
}

/** Reaguje na baner Shopify (`visitorConsentCollected`) i odczyt API. */
export function useMetaPixelConsent(): boolean {
  const [granted, setGranted] = useState(false);

  useEffect(() => {
    const sync = () => {
      const marketing = readShopifyMarketingProcessingAllowed();
      if (marketing === true) setGranted(true);
      else if (marketing === false) setGranted(false);
    };
    sync();
    document.addEventListener('visitorConsentCollected', sync);
    return () => document.removeEventListener('visitorConsentCollected', sync);
  }, []);

  return granted;
}

function callFbq(...args: unknown[]): void {
  if (!isMetaPixelConsentGranted()) return;
  if (typeof window === 'undefined') return;
  const fbq = window.fbq;
  if (typeof fbq !== 'function') return;
  fbq(...args);
}

/** Load fbevents.js and init pixel once (after marketing consent). */
export function ensureMetaPixelInitialized(): void {
  if (!isMetaPixelConsentGranted()) return;
  if (typeof window === 'undefined') return;

  if (!window.fbq) {
    const n: FbqFn = (...args: unknown[]) => {
      n.queue = n.queue ?? [];
      n.queue.push(args);
    };
    n.queue = [];
    n.loaded = true;
    n.version = '2.0';
    window.fbq = n;
    if (!window._fbq) window._fbq = n;
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    const first = document.getElementsByTagName('script')[0];
    first?.parentNode?.insertBefore(script, first);
  }

  if (!initialized) {
    callFbq('init', META_PIXEL_ID);
    initialized = true;
  }
}

export function trackMetaPageView(): void {
  ensureMetaPixelInitialized();
  callFbq('track', 'PageView');
}

export type MetaProductPayload = {
  contentId: string;
  value?: number;
  currency?: string;
};

export function trackMetaViewContent(payload: MetaProductPayload): void {
  ensureMetaPixelInitialized();
  const {contentId, value, currency = 'PLN'} = payload;
  if (!contentId.trim()) return;
  callFbq('track', 'ViewContent', {
    content_ids: [contentId],
    content_type: 'product',
    ...(value != null && value > 0 ? {value, currency} : {currency}),
  });
}

export function trackMetaAddToCart(payload: MetaProductPayload): void {
  ensureMetaPixelInitialized();
  const {contentId, value, currency = 'PLN'} = payload;
  if (!contentId.trim()) return;
  callFbq('track', 'AddToCart', {
    content_ids: [contentId],
    content_type: 'product',
    ...(value != null && value > 0 ? {value, currency} : {currency}),
  });
}
