/**
 * Adapter for Shopify standard storefront events/actions (Spring '26).
 * @see https://shopify.dev/docs/storefronts/themes/best-practices/standard-events-and-actions
 */

export type StorefrontCommerceAction = {
  type: 'cart_updated';
  cart_id: string | null;
  checkout_url: string | null;
  line_count: number | null;
};

type ShopifyActionsGlobal = {
  updateCart?: (input: {
    cartId?: string;
    lines?: Array<{merchandiseId?: string; quantity?: number}>;
    event?: {context?: string; detail?: Record<string, unknown>};
  }) => Promise<{cart?: unknown}>;
  openCart?: () => Promise<void>;
};

type ShopifyWindow = {
  actions?: ShopifyActionsGlobal;
};

/**
 * After Gemma `commerce_action`, notify the theme via standard actions/events.
 * Prefers `Shopify.actions.updateCart` when injected; otherwise dispatches
 * `shopify:cart:lines-update` for listeners.
 */
export async function applyStorefrontCommerceAction(
  action: StorefrontCommerceAction,
): Promise<void> {
  if (action.type !== 'cart_updated') return;
  if (typeof window === 'undefined') return;

  const shopifyActions = (window as unknown as {Shopify?: ShopifyWindow}).Shopify?.actions;
  if (shopifyActions?.updateCart && action.cart_id) {
    try {
      await shopifyActions.updateCart({
        cartId: action.cart_id,
        event: {context: 'standard-action', detail: {source: 'epir-gemma'}},
      });
      return;
    } catch {
      /* fall through to manual event */
    }
  }

  dispatchCartLinesUpdateEvent(action);
}

function dispatchCartLinesUpdateEvent(action: StorefrontCommerceAction): void {
  const deferred = createDeferred<{cart?: {id?: string}}>();
  const event = new CustomEvent('shopify:cart:lines-update', {
    bubbles: true,
    detail: {
      action: 'update',
      context: 'standard-action',
      lines: [],
      promise: deferred.promise,
      cartId: action.cart_id ?? undefined,
      checkoutUrl: action.checkout_url ?? undefined,
      source: 'epir-gemma',
    },
  });
  document.dispatchEvent(event);
  deferred.resolve({cart: action.cart_id ? {id: action.cart_id} : undefined});
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return {promise, resolve};
}
