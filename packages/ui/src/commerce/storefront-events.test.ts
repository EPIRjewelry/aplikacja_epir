import {afterEach, describe, expect, it, vi} from 'vitest';
import {applyStorefrontCommerceAction} from './storefront-events';

describe('applyStorefrontCommerceAction', () => {
  const listeners: Array<(evt: Event) => void> = [];

  afterEach(() => {
    listeners.length = 0;
    vi.unstubAllGlobals();
  });

  function stubBrowser(shopifyActions?: {updateCart?: ReturnType<typeof vi.fn>}) {
    vi.stubGlobal('window', {
      Shopify: shopifyActions ? {actions: shopifyActions} : undefined,
    });
    vi.stubGlobal('document', {
      dispatchEvent(evt: Event) {
        for (const fn of listeners) fn(evt);
        return true;
      },
      addEventListener(_type: string, fn: (evt: Event) => void) {
        listeners.push(fn);
      },
    });
  }

  it('calls Shopify.actions.updateCart when available', async () => {
    const updateCart = vi.fn().mockResolvedValue({cart: {id: 'gid://shopify/Cart/1'}});
    stubBrowser({updateCart});

    await applyStorefrontCommerceAction({
      type: 'cart_updated',
      cart_id: 'gid://shopify/Cart/1?key=abc',
      checkout_url: 'https://shop.example/cart/c/1',
      line_count: 1,
    });

    expect(updateCart).toHaveBeenCalledWith(
      expect.objectContaining({
        cartId: 'gid://shopify/Cart/1?key=abc',
      }),
    );
  });

  it('dispatches shopify:cart:lines-update when actions missing', async () => {
    stubBrowser();
    const handler = vi.fn();
    listeners.push(handler);

    await applyStorefrontCommerceAction({
      type: 'cart_updated',
      cart_id: 'gid://shopify/Cart/2',
      checkout_url: null,
      line_count: 2,
    });

    expect(handler).toHaveBeenCalledTimes(1);
    const evt = handler.mock.calls[0][0] as CustomEvent;
    expect(evt.type).toBe('shopify:cart:lines-update');
    expect((evt as CustomEvent).detail.cartId).toBe('gid://shopify/Cart/2');
  });
});
