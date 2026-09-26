import {useFetcher, useLocation} from '@remix-run/react';
import {useEffect, useRef} from 'react';
import {
  ensureMetaPixelInitialized,
  trackMetaAddToCart,
  trackMetaPageView,
  trackMetaViewContent,
} from '~/lib/meta-pixel';
import {useKazkaConsent} from '~/lib/use-kazka-consent';

/** SPA PageView after consent (Remix client navigations). */
export function MetaPixelPageView() {
  const consentGranted = useKazkaConsent();
  const location = useLocation();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (!consentGranted) return;
    ensureMetaPixelInitialized();
    if (lastPath.current === location.pathname) return;
    lastPath.current = location.pathname;
    trackMetaPageView();
  }, [consentGranted, location.pathname]);

  return null;
}

type CartActionJson = {
  error?: string;
  cart?: unknown;
};

/** PDP: ViewContent + AddToCart (content_ids = product handle). */
export function MetaPixelProduct({
  handle,
  priceAmount,
  currencyCode,
}: {
  handle: string;
  priceAmount?: string | null;
  currencyCode?: string | null;
}) {
  const consentGranted = useKazkaConsent();
  const fetcher = useFetcher<CartActionJson>({key: 'add-to-cart'});
  const lastViewKey = useRef<string | null>(null);
  const lastCartSync = useRef<unknown>(null);

  const value = priceAmount ? Number.parseFloat(priceAmount) : undefined;
  const currency = currencyCode?.trim() || 'PLN';

  useEffect(() => {
    if (!consentGranted || !handle) return;
    const key = `${handle}:${priceAmount ?? ''}`;
    if (lastViewKey.current === key) return;
    lastViewKey.current = key;
    trackMetaViewContent({
      contentId: handle,
      value: value != null && !Number.isNaN(value) ? value : undefined,
      currency,
    });
  }, [consentGranted, handle, priceAmount, currency, value]);

  useEffect(() => {
    if (!consentGranted) return;
    if (fetcher.state !== 'idle' || !fetcher.data?.cart) return;
    if (fetcher.data === lastCartSync.current) return;
    if (fetcher.data.error) return;
    lastCartSync.current = fetcher.data;
    trackMetaAddToCart({
      contentId: handle,
      value: value != null && !Number.isNaN(value) ? value : undefined,
      currency,
    });
  }, [consentGranted, fetcher.state, fetcher.data, handle, value, currency]);

  return null;
}
