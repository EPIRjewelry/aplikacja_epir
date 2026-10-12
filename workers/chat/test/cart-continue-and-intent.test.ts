import {describe, expect, it} from 'vitest';
import {detectForcedCartTool} from '../src/buyer/cart-intent';
import {
  buildCartContinueReply,
  formatCartNoticeFromMessages,
} from '../src/buyer/cart-continue-reply';
import {prepareUcpCartCall, applyCartPatch} from '../src/cart/ucp-cart';

describe('cart intent', () => {
  it('forces update_cart for quantity change when session cart exists', () => {
    expect(detectForcedCartTool('zmień ilość na 2', 'gid://shopify/Cart/1')).toBe(
      'update_cart',
    );
  });

  it('does not force tools on ordinary product question', () => {
    expect(detectForcedCartTool('szukam pierścionka z szafirem', null)).toBeNull();
  });
});

describe('buildCartContinueReply', () => {
  it('uses exact continue_url without UTM', () => {
    const url =
      'https://epir-art-silver-jewellery.myshopify.com/cart/c/Z2lkOi8vc2hvcGlmeS9DYXJ0LzE';
    const reply = buildCartContinueReply(url, ['Ilość dostosowana'], 'Suma szacunkowa: 100 zł (ostateczna kwota w kasie).');
    expect(reply).toContain(url);
    expect(reply).not.toContain('utm_');
    expect(reply).toContain('Ilość dostosowana');
  });

  it('formats quantity_adjusted warning', () => {
    const notices = formatCartNoticeFromMessages([
      {type: 'warning', code: 'quantity_adjusted', content: 'Dostosowano ilość'},
    ]);
    expect(notices).toContain('Dostosowano ilość');
  });
});

describe('prepareUcpCartCall preserves attribution/context/buyer', () => {
  it('update with explicit lines keeps attribution; cart has no id; top-level id set', () => {
    const prepared = prepareUcpCartCall(
      'update_cart',
      {
        id: 'gid://shopify/Cart/session1',
        cart: {
          line_items: [{quantity: 2, item: {id: 'gid://shopify/ProductVariant/1'}}],
          attribution: {content: 'chat'},
          buyer: {email: 'a@b.c'},
          context: {address_country: 'PL'},
        },
      },
      {},
    );
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.arguments.id).toBe('gid://shopify/Cart/session1');
    const cart = prepared.arguments.cart as Record<string, unknown>;
    expect(cart.id).toBeUndefined();
    expect(cart.attribution).toEqual({content: 'chat'});
    expect(cart.buyer).toEqual({email: 'a@b.c'});
    expect((cart.context as {address_country: string}).address_country).toBe('PL');
  });

  it('applyCartPatch merges add into existing lines', () => {
    const next = applyCartPatch(
      [{quantity: 1, item: {id: 'gid://shopify/ProductVariant/1'}, lineId: 'li1'}],
      {update_items: [{id: 'li1', quantity: 2}]},
    );
    expect(next).toEqual([{quantity: 2, item: {id: 'gid://shopify/ProductVariant/1'}}]);
  });
});
