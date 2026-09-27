/**
 * Shopify Customer events — Custom Pixel (checkout only).
 * Paste into Admin → Settings → Customer events → Add custom pixel.
 *
 * Pixel ID must match apps/kazka/app/lib/meta-pixel-id.ts.
 * content_ids = Variant SKU (Meta catalog `id` from kazka_27_wrzesien export).
 */
const META_PIXEL_ID = '1320796521913985';
const EPIR_STOREFRONT_ATTR = '_epir_storefront';
const KAZKA_STOREFRONT = 'kazka';

function ensureFbq() {
  if (typeof window.fbq === 'function') return;
  const n = function () {
    n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
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

function orderEventId(checkout) {
  const raw =
    checkout?.order?.id ||
    checkout?.orderId ||
    checkout?.token ||
    checkout?.id ||
    '';
  const id = String(raw).replace(/^gid:\/\/shopify\/Order\//i, '').trim();
  return id ? `purchase_${id}` : `purchase_${Date.now()}`;
}

function lineContentIds(checkout) {
  const ids = [];
  const lines = checkout?.lineItems || checkout?.line_items || [];
  for (const line of lines) {
    const sku =
      line?.merchandise?.sku ||
      line?.variant?.sku ||
      line?.sku ||
      line?.variantSku;
    if (typeof sku === 'string' && sku.trim()) {
      ids.push(sku.trim());
      continue;
    }
    // Fallback only if SKU missing in payload (legacy)
    const handle =
      line?.merchandise?.product?.handle ||
      line?.product?.handle ||
      line?.variant?.product?.handle;
    if (typeof handle === 'string' && handle.trim()) {
      ids.push(handle.trim());
    }
  }
  return ids;
}

function purchaseValue(checkout) {
  const amount =
    checkout?.totalPrice?.amount ??
    checkout?.total_price?.amount ??
    checkout?.subtotalPrice?.amount ??
    checkout?.subtotal_price?.amount;
  const n = typeof amount === 'string' ? parseFloat(amount) : Number(amount);
  return Number.isFinite(n) ? n : 0;
}

function readCheckoutAttributes(checkout) {
  const lists = [
    checkout?.attributes,
    checkout?.customAttributes,
    checkout?.noteAttributes,
    checkout?.note_attributes,
  ];
  for (const list of lists) {
    if (Array.isArray(list)) return list;
  }
  return [];
}

function isKazkaCheckout(checkout) {
  for (const item of readCheckoutAttributes(checkout)) {
    const key = String(item?.key ?? item?.name ?? '');
    if (key !== EPIR_STOREFRONT_ATTR) continue;
    return String(item?.value ?? '').trim() === KAZKA_STOREFRONT;
  }
  return false;
}

function purchaseCurrency(checkout) {
  return (
    checkout?.totalPrice?.currencyCode ||
    checkout?.total_price?.currencyCode ||
    checkout?.currencyCode ||
    'PLN'
  );
}

analytics.subscribe('checkout_completed', (event) => {
  const checkout = event?.data?.checkout;
  if (!checkout) return;
  if (!isKazkaCheckout(checkout)) return;

  ensureFbq();
  window.fbq('init', META_PIXEL_ID);

  const contentIds = lineContentIds(checkout);
  const payload = {
    content_type: 'product',
    value: purchaseValue(checkout),
    currency: purchaseCurrency(checkout),
  };
  if (contentIds.length > 0) {
    payload.content_ids = contentIds;
  }

  window.fbq('track', 'Purchase', payload, {
    eventID: orderEventId(checkout),
  });
});
