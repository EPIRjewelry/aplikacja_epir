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

register(async ({ analytics, browser, init, settings }) => {
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
    
    console.log('[EPIR Pixel] Customer ID:', customerId || 'anonymous');
    
    // ============================================================================
    // Event Sending Function
    // ============================================================================
    // NOTE: No additional batching/rate limiting implemented here because:
    // 1. Shopify Web Pixels API has built-in batching and rate limiting
    // 2. tracking.js already implements debouncing (scroll: 200ms) and throttling (mouse: 5s)
    // 3. Batching would delay proactive chat activation signals
    // 4. High-value events (checkout, purchase) should be sent immediately
    // ============================================================================
    async function sendPixelEvent(eventType: string, eventData: unknown, event?: unknown): Promise<void> {
      try {
        const sourceForIdentity = event !== undefined ? event : eventData;
        const resolvedSessionId = await resolveEpirSessionId(browserApi, sourceForIdentity);
        const storefront = await getStorefrontForEvent(event ?? eventData);
        // Enrich event data with customer_id, session_id (cookie lub clientId), storefront_id, channel
        const enrichedData = {
          ...(typeof eventData === 'object' && eventData !== null ? eventData : {}),
          customerId: customerId,
          sessionId: resolvedSessionId,
          session_id: resolvedSessionId,
          storefront_id: storefront.storefront_id,
          channel: storefront.channel
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
        // Analytics worker returns { ok: true, activate_chat: true/false, reason: string }
        // If activate_chat=true, emit custom event to frontend
        if (response.ok) {
          const result = await response.json();
          
          // Type guard for result
          if (
            typeof result === 'object' && 
            result !== null && 
            'activate_chat' in result && 
            result.activate_chat === true
          ) {
            console.log('[EPIR Pixel] 🚀 Proactive chat activation detected:', (result as any).reason);
            
            // Emit custom event to frontend (assistant.js listens for this)
            window.dispatchEvent(new CustomEvent('epir:activate-chat', {
              detail: {
                reason: (result as any).reason,
                session_id: resolvedSessionId,
                customer_id: customerId,
                timestamp: Date.now()
              }
            }));
          }
        }
      } catch (err) {
        console.warn('Pixel event send failed:', err);
      }
    }

    // Subskrybuj wybrane zdarzenia klienta
    analytics.subscribe('page_viewed', async (event: unknown) => {
      console.log('Page viewed', event);
      await sendPixelEvent('page_viewed', event);
    });

    analytics.subscribe('product_viewed', async (event: unknown) => {
      console.log('Product viewed', event);
      await sendPixelEvent('product_viewed', event);
    });

    analytics.subscribe('cart_updated', async (event: unknown) => {
      console.log('Cart updated', event);
      await sendPixelEvent('cart_updated', event);
    });

    analytics.subscribe('checkout_started', async (event: unknown) => {
      console.log('Checkout started', event);
      await sendPixelEvent('checkout_started', event);
    });

    analytics.subscribe('purchase_completed', async (event: unknown) => {
      console.log('Purchase completed', event);
      await sendPixelEvent('purchase_completed', event);
    });

    // ============================================================================
    // ADDITIONAL STANDARD EVENTS (full spectrum)
    // ============================================================================
    // Cart events
    analytics.subscribe('cart_viewed', async (event: unknown) => {
      console.log('Cart viewed', event);
      await sendPixelEvent('cart_viewed', event);
    });

    analytics.subscribe('product_added_to_cart', async (event: unknown) => {
      console.log('Product added to cart', event);
      await sendPixelEvent('product_added_to_cart', event);
    });

    analytics.subscribe('product_removed_from_cart', async (event: unknown) => {
      console.log('Product removed from cart', event);
      await sendPixelEvent('product_removed_from_cart', event);
    });

    // Collection and search
    analytics.subscribe('collection_viewed', async (event: unknown) => {
      console.log('Collection viewed', event);
      await sendPixelEvent('collection_viewed', event);
    });

    analytics.subscribe('search_submitted', async (event: unknown) => {
      console.log('Search submitted', event);
      await sendPixelEvent('search_submitted', event);
    });

    // Checkout flow events
    analytics.subscribe('checkout_completed', async (event: unknown) => {
      console.log('Checkout completed', event);
      await sendPixelEvent('checkout_completed', event);
    });

    analytics.subscribe('checkout_contact_info_submitted', async (event: unknown) => {
      console.log('Checkout contact info submitted', event);
      await sendPixelEvent('checkout_contact_info_submitted', event);
    });

    analytics.subscribe('checkout_address_info_submitted', async (event: unknown) => {
      console.log('Checkout address info submitted', event);
      await sendPixelEvent('checkout_address_info_submitted', event);
    });

    analytics.subscribe('checkout_shipping_info_submitted', async (event: unknown) => {
      console.log('Checkout shipping info submitted', event);
      await sendPixelEvent('checkout_shipping_info_submitted', event);
    });

    analytics.subscribe('payment_info_submitted', async (event: unknown) => {
      console.log('Payment info submitted', event);
      await sendPixelEvent('payment_info_submitted', event);
    });

    // UI and alerts
    analytics.subscribe('alert_displayed', async (event: unknown) => {
      console.log('Alert displayed', event);
      await sendPixelEvent('alert_displayed', event);
    });

    analytics.subscribe('ui_extension_errored', async (event: unknown) => {
      console.log('UI extension errored', event);
      await sendPixelEvent('ui_extension_errored', event);
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

      analytics.subscribe('form_submitted', async (event: any) => {
        console.log('DOM form submitted', event);
        await sendPixelEvent('form_submitted', event);
      });

      analytics.subscribe('input_focused', async (event: any) => {
        console.log('DOM input focused', event);
        await sendPixelEvent('input_focused', event);
      });

      analytics.subscribe('input_blurred', async (event: any) => {
        console.log('DOM input blurred', event);
        await sendPixelEvent('input_blurred', event);
      });

      analytics.subscribe('input_changed', async (event: any) => {
        console.log('DOM input changed', event);
        await sendPixelEvent('input_changed', event);
      });
    } catch (e) {
      // ignore if not available in this context
      console.warn('[EPIR Pixel] Some DOM events not available:', e);
    }

    // Custom events published by Theme App Extension (epir-tracking-extension)
    analytics.subscribe('epir:click_with_position', async (event: any) => {
      console.log('Custom click with position', event);
      await sendPixelEvent('click_with_position', event.customData || event, event);
    });

    analytics.subscribe('epir:scroll_depth', async (event: any) => {
      console.log('Custom scroll depth', event);
      await sendPixelEvent('scroll_depth', event.customData || event, event);
    });

    analytics.subscribe('epir:page_exit', async (event: any) => {
      console.log('Custom page exit / time on page', event);
      await sendPixelEvent('page_exit', event.customData || event, event);
    });

    analytics.subscribe('epir:mouse_sample', async (event: any) => {
      console.log('Mouse sample event', event);
      await sendPixelEvent('mouse_sample', event.customData || event, event);
    });
});
