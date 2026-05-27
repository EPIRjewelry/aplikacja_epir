import {register} from "@shopify/web-pixels-extension";

// Zmienić przed deployem – fallback gdy brak ustawienia w extension settings
const DEFAULT_PIXEL_ENDPOINT = 'https://asystent.epirbizuteria.pl';

type PixelBrowser = {
  cookie?: {get: (name: string) => Promise<string | null | undefined>};
  sessionStorage: {
    getItem: (key: string) => Promise<string | null>;
    setItem: (key: string, value: string) => Promise<void>;
  };
};

type AttributionPayload = {
  traffic_source?: string;
  traffic_medium?: string;
  traffic_campaign?: string;
  traffic_content?: string;
  traffic_term?: string;
  gclid?: string;
  fbclid?: string;
  ttclid?: string;
  msclkid?: string;
};

/** Fragment Customer Privacy na obiekcie zdarzenia Web Pixel (event / event.context). */
type PixelEventPrivacy = {
  analyticsProcessingAllowed: boolean;
};

/** Wyłuskaj blok privacy z natywnego obiektu zdarzenia Shopify Web Pixels. */
function readPrivacyFromPixelEvent(event: unknown): PixelEventPrivacy | null {
  try {
    if (!event || typeof event !== "object") return null;
    const e = event as Record<string, unknown>;
    const direct = e.customerPrivacy;
    if (direct && typeof direct === "object") {
      const ap = (direct as Record<string, unknown>).analyticsProcessingAllowed;
      if (typeof ap === "boolean") return {analyticsProcessingAllowed: ap};
    }
    const ctx = e.context;
    if (ctx && typeof ctx === "object") {
      const nested = (ctx as Record<string, unknown>).customerPrivacy;
      if (nested && typeof nested === "object") {
        const ap = (nested as Record<string, unknown>).analyticsProcessingAllowed;
        if (typeof ap === "boolean") return {analyticsProcessingAllowed: ap};
      }
    }
  } catch (_) {
    /* silent — stabilność w piaskownicy */
  }
  return null;
}

/** Śledzenie analityczne dozwolone tylko przy jawnym analyticsProcessingAllowed === true na evencie. */
function isAnalyticsProcessingExplicitlyAllowedOnEvent(event: unknown): boolean {
  const p = readPrivacyFromPixelEvent(event);
  return p !== null && p.analyticsProcessingAllowed === true;
}

/** Shopify Web Pixels: `clientId` na evencie (fallback gdy brak ciasteczka Hydrogen). */
function extractClientIdFromEvent(event: unknown): string | null {
  if (!event || typeof event !== 'object') return null;
  const e = event as Record<string, unknown>;
  if (typeof e.clientId === 'string' && e.clientId.length > 0) return e.clientId;
  if (e.data && typeof e.data === 'object') {
    const d = e.data as Record<string, unknown>;
    if (typeof d.clientId === 'string' && d.clientId.length > 0) return d.clientId;
  }
  return null;
}

/**
 * Tożsamość analityczna: wyłącznie cookie `_epir_session_id` (Hydrogen) lub clientId z API Shopify.
 * Bez generowania ID po stronie klienta (Date/Math.random).
 */
async function resolveEpirSessionId(
  browserApi: PixelBrowser,
  event: unknown,
): Promise<string> {
  try {
    const getCookie = browserApi.cookie?.get;
    if (typeof getCookie === 'function') {
      const raw = await getCookie('_epir_session_id');
      if (typeof raw === 'string' && raw.trim().length > 0) return raw.trim();
    }
  } catch (_) {
    /* sandbox / brak uprawnień do cookie */
  }
  return extractClientIdFromEvent(event) ?? '';
}

register(async (api) => {
    const { analytics, browser, init, settings } = api;

    const browserApi = browser as PixelBrowser;

    // ============================================================================
    // CUSTOMER & SESSION TRACKING
    // ============================================================================
    // Extract customer_id from Shopify (null if not logged in)
    const customerId = init?.data?.customer?.id ?? null;

    
    // ============================================================================
    // STOREFRONT & CHANNEL (EPIR: kazka vs zareczyny vs online-store)
    // ============================================================================
    // Infer from URL (page.location from Web Pixels API init/event context)
    function inferStorefrontFromUrl(url: string | null | undefined): { storefront_id: string; channel: string } {
      if (!url || typeof url !== 'string') return { storefront_id: 'unknown', channel: 'unknown' };
      if (url.includes('kazka')) return { storefront_id: 'kazka', channel: 'hydrogen-kazka' };
      if (url.includes('zareczyny')) return { storefront_id: 'zareczyny', channel: 'hydrogen-zareczyny' };
      return { storefront_id: 'online-store', channel: 'online-store' };
    }
    async function getStorefrontContext(event: unknown): Promise<{ storefront_id: string; channel: string }> {
      let url: string | null = null;
      if (event && typeof event === 'object' && 'context' in event) {
        const ctx = (event as any).context;
        if (ctx?.document?.location?.href) url = ctx.document.location.href;
      }
      if (!url && init?.context?.document?.location?.href) {
        url = init.context.document.location.href;
      }
      const result = inferStorefrontFromUrl(url);
      if (result.storefront_id !== 'unknown') {
        try {
          await browser.sessionStorage.setItem('_epir_storefront', JSON.stringify(result));
        } catch (_) {}
      }
      return result;
    }
    async function getStorefrontForEvent(event: unknown): Promise<{ storefront_id: string; channel: string }> {
      const fromEvent = await getStorefrontContext(event);
      if (fromEvent.storefront_id !== 'unknown') return fromEvent;
      try {
        const stored = await browser.sessionStorage.getItem('_epir_storefront');
        if (stored) return JSON.parse(stored);
      } catch (_) {}
      return fromEvent;
    }

    function parseAttributionFromUrl(rawUrl: string | null | undefined): AttributionPayload {
      if (!rawUrl) return {};
      try {
        const u = new URL(rawUrl);
        const pick = (name: string) => (u.searchParams.get(name)?.trim().toLowerCase() || undefined);
        return {
          traffic_source: pick('utm_source'),
          traffic_medium: pick('utm_medium'),
          traffic_campaign: pick('utm_campaign'),
          traffic_content: pick('utm_content'),
          traffic_term: pick('utm_term'),
          gclid: pick('gclid'),
          fbclid: pick('fbclid'),
          ttclid: pick('ttclid'),
          msclkid: pick('msclkid'),
        };
      } catch {
        return {};
      }
    }

    function inferFromReferrer(referrer: string | undefined): AttributionPayload {
      const r = (referrer || '').toLowerCase();
      if (!r) return { traffic_source: 'direct', traffic_medium: 'none' };
      if (r.includes('google.')) return { traffic_source: 'google', traffic_medium: 'organic' };
      if (r.includes('bing.')) return { traffic_source: 'bing', traffic_medium: 'organic' };
      if (r.includes('facebook.') || r.includes('fb.com')) return { traffic_source: 'facebook', traffic_medium: 'social' };
      if (r.includes('instagram.')) return { traffic_source: 'instagram', traffic_medium: 'social' };
      return { traffic_source: 'referral', traffic_medium: 'referral' };
    }

    async function getAttributionForEvent(event: unknown): Promise<AttributionPayload> {
      let pageUrl: string | undefined;
      let referrer: string | undefined;
      if (event && typeof event === 'object' && 'context' in event) {
        const ctx = (event as any).context;
        pageUrl = ctx?.document?.location?.href;
        referrer = ctx?.document?.referrer;
      }
      if (!pageUrl) pageUrl = init?.context?.document?.location?.href;
      const fromUrl = parseAttributionFromUrl(pageUrl);
      const hasCampaignSignal = Boolean(
        fromUrl.traffic_source ||
        fromUrl.gclid ||
        fromUrl.fbclid ||
        fromUrl.ttclid ||
        fromUrl.msclkid,
      );
      if (hasCampaignSignal) {
        try {
          await browser.sessionStorage.setItem('_epir_last_attribution', JSON.stringify(fromUrl));
        } catch (_) {}
        return fromUrl;
      }
      try {
        const cached = await browser.sessionStorage.getItem('_epir_last_attribution');
        if (cached) return JSON.parse(cached) as AttributionPayload;
      } catch (_) {}
      return inferFromReferrer(referrer);
    }
    /**
     * Przed sendPixelEvent: odczyt zgód wyłącznie z obiektu zdarzenia Web Pixel (context.customerPrivacy / customerPrivacy).
     */
    async function emitStandardPixelEvent(eventType: string, pixelEvent: unknown): Promise<void> {
      try {
        if (!isAnalyticsProcessingExplicitlyAllowedOnEvent(pixelEvent)) return;
        await sendPixelEvent(eventType, pixelEvent, pixelEvent);
      } catch (_) {}
    }

    async function emitCustomPixelEvent(
      eventType: string,
      pixelEvent: unknown,
      payload: unknown,
    ): Promise<void> {
      try {
        if (!isAnalyticsProcessingExplicitlyAllowedOnEvent(pixelEvent)) return;
        await sendPixelEvent(eventType, payload, pixelEvent);
      } catch (_) {}
    }

    // ============================================================================
    // Event Sending Function — fetch tylko gdy na evencie jawna zgoda na analytics (silent drop)
    // ============================================================================
    async function sendPixelEvent(eventType: string, eventData: unknown, pixelEvent: unknown): Promise<void> {
      try {
        if (!isAnalyticsProcessingExplicitlyAllowedOnEvent(pixelEvent)) {
          return;
        }

        const sourceForIdentity = pixelEvent;
        const resolvedSessionId = await resolveEpirSessionId(browserApi, sourceForIdentity);
        const storefront = await getStorefrontForEvent(pixelEvent);
        const attribution = await getAttributionForEvent(pixelEvent);
        // Enrich event data with customer_id, session_id (cookie lub clientId), storefront_id, channel
        const enrichedData = {
          ...(typeof eventData === 'object' && eventData !== null ? eventData : {}),
          customerId: customerId,
          sessionId: resolvedSessionId,
          session_id: resolvedSessionId,
          storefront_id: storefront.storefront_id,
          channel: storefront.channel,
          ...attribution,
        };
        
        // Endpoint z extension settings (pixelEndpoint) lub stała – chat worker proxy do analytics
        const baseUrl = (settings?.pixelEndpoint || DEFAULT_PIXEL_ENDPOINT).replace(/\/$/, '');
        const pixelUrl = `${baseUrl}/pixel`;
        
        const response = await fetch(pixelUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: eventType, data: enrichedData })
        });
        
        // ============================================================================
        // PROACTIVE CHAT ACTIVATION: Check response from analytics-worker
        // ============================================================================
        if (response.ok) {
          try {
            const result = await response.json();
            if (
              typeof result === 'object' && 
              result !== null && 
              'activate_chat' in result && 
              result.activate_chat === true
            ) {
              window.dispatchEvent(new CustomEvent('epir:activate-chat', {
                detail: {
                  reason: (result as {reason?: string}).reason,
                  session_id: resolvedSessionId,
                  customer_id: customerId,
                  timestamp: Date.now()
                }
              }));
            }
          } catch (_) {}
        }
      } catch (_) {
        /* silent drop — nie logujemy do konsoli piaskownicy */
      }
    }

    // Subskrybuj wybrane zdarzenia klienta (walidacja zgód z obiektu zdarzenia przed sendPixelEvent)
    analytics.subscribe('page_viewed', async (event: unknown) => {
      await emitStandardPixelEvent('page_viewed', event);
    });

    analytics.subscribe('product_viewed', async (event: unknown) => {
      await emitStandardPixelEvent('product_viewed', event);
    });

    analytics.subscribe('cart_updated', async (event: unknown) => {
      await emitStandardPixelEvent('cart_updated', event);
    });

    analytics.subscribe('checkout_started', async (event: unknown) => {
      await emitStandardPixelEvent('checkout_started', event);
    });

    analytics.subscribe('purchase_completed', async (event: unknown) => {
      await emitStandardPixelEvent('purchase_completed', event);
    });

    // ============================================================================
    // ADDITIONAL STANDARD EVENTS (full spectrum)
    // ============================================================================
    // Cart events
    analytics.subscribe('cart_viewed', async (event: unknown) => {
      await emitStandardPixelEvent('cart_viewed', event);
    });

    analytics.subscribe('product_added_to_cart', async (event: unknown) => {
      await emitStandardPixelEvent('product_added_to_cart', event);
    });

    analytics.subscribe('product_removed_from_cart', async (event: unknown) => {
      await emitStandardPixelEvent('product_removed_from_cart', event);
    });

    // Collection and search
    analytics.subscribe('collection_viewed', async (event: unknown) => {
      await emitStandardPixelEvent('collection_viewed', event);
    });

    analytics.subscribe('search_submitted', async (event: unknown) => {
      await emitStandardPixelEvent('search_submitted', event);
    });

    // Checkout flow events
    analytics.subscribe('checkout_completed', async (event: unknown) => {
      await emitStandardPixelEvent('checkout_completed', event);
    });

    analytics.subscribe('checkout_contact_info_submitted', async (event: unknown) => {
      await emitStandardPixelEvent('checkout_contact_info_submitted', event);
    });

    analytics.subscribe('checkout_address_info_submitted', async (event: unknown) => {
      await emitStandardPixelEvent('checkout_address_info_submitted', event);
    });

    analytics.subscribe('checkout_shipping_info_submitted', async (event: unknown) => {
      await emitStandardPixelEvent('checkout_shipping_info_submitted', event);
    });

    analytics.subscribe('payment_info_submitted', async (event: unknown) => {
      await emitStandardPixelEvent('payment_info_submitted', event);
    });

    // UI and alerts
    analytics.subscribe('alert_displayed', async (event: unknown) => {
      await emitStandardPixelEvent('alert_displayed', event);
    });

    analytics.subscribe('ui_extension_errored', async (event: unknown) => {
      await emitStandardPixelEvent('ui_extension_errored', event);
    });

    // ------------------------------------------------------------------------
    // Subscribe to DOM and custom events (heatmap-ready data)
    // ------------------------------------------------------------------------
    // Standard DOM events provided by Shopify Web Pixels
    try {
      // NOTE: 'clicked' event is redundant - we use custom 'epir:click_with_position' 
      // from TAE which provides richer data (x, y, viewport, element details)
      // analytics.subscribe('clicked', async (event: any) => {
      //   console.log('DOM clicked event', event);
      //   await sendPixelEvent('clicked', event);
      // });

      analytics.subscribe('form_submitted', async (event: unknown) => {
        await emitStandardPixelEvent('form_submitted', event);
      });

      analytics.subscribe('input_focused', async (event: unknown) => {
        await emitStandardPixelEvent('input_focused', event);
      });

      analytics.subscribe('input_blurred', async (event: unknown) => {
        await emitStandardPixelEvent('input_blurred', event);
      });

      analytics.subscribe('input_changed', async (event: unknown) => {
        await emitStandardPixelEvent('input_changed', event);
      });
    } catch (_) {
      /* DOM events opcjonalne w zależności od kontekstu */
    }

    // Custom events published by Theme App Extension (epir-tracking-extension)
    analytics.subscribe('epir:click_with_position', async (event: unknown) => {
      const ev = event as {customData?: unknown};
      await emitCustomPixelEvent('click_with_position', event, ev.customData ?? event);
    });

    analytics.subscribe('epir:scroll_depth', async (event: unknown) => {
      const ev = event as {customData?: unknown};
      await emitCustomPixelEvent('scroll_depth', event, ev.customData ?? event);
    });

    analytics.subscribe('epir:page_exit', async (event: unknown) => {
      const ev = event as {customData?: unknown};
      await emitCustomPixelEvent('page_exit', event, ev.customData ?? event);
    });

    analytics.subscribe('epir:mouse_sample', async (event: unknown) => {
      const ev = event as {customData?: unknown};
      await emitCustomPixelEvent('mouse_sample', event, ev.customData ?? event);
    });
});
