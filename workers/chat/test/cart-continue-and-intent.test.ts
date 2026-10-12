import {describe, expect, it} from 'vitest';
import {detectForcedCartTool} from '../src/buyer/cart-intent';
import {
  appendExactContinueUrlIfMissing,
  buildCartContinueReply,
  formatCartNoticeFromMessages,
  formatCartTotalsNote,
} from '../src/buyer/cart-continue-reply';
import {prepareUcpCartCall, applyCartPatch} from '../src/cart/ucp-cart';

describe('cart intent — only get_cart may be keyword-forced', () => {
  it('forces get_cart for show-cart when session cart exists', () => {
    expect(detectForcedCartTool('pokaż koszyk', 'gid://shopify/Cart/1')).toBe(
      'get_cart',
    );
  });

  it('does not force create_cart/update_cart on add / quantity keywords', () => {
    expect(detectForcedCartTool('jak dodać do koszyka?', null)).toBeNull();
    expect(detectForcedCartTool('dodaj do koszyka', null)).toBeNull();
    expect(
      detectForcedCartTool('zmień ilość na 2', 'gid://shopify/Cart/1'),
    ).toBeNull();
  });

  it('does not force tools on ordinary product question', () => {
    expect(detectForcedCartTool('szukam pierścionka z szafirem', null)).toBeNull();
  });
});

describe('buildCartContinueReply / appendExactContinueUrlIfMissing', () => {
  it('uses exact continue_url without UTM', () => {
    const url =
      'https://epir-art-silver-jewellery.myshopify.com/cart/c/Z2lkOi8vc2hvcGlmeS9DYXJ0LzE';
    const reply = buildCartContinueReply(
      url,
      ['Ilość dostosowana'],
      'Suma szacunkowa: 100 zł (ostateczna kwota w kasie).',
    );
    expect(reply).toContain(url);
    expect(reply).not.toContain('utm_');
    expect(reply).toContain('Ilość dostosowana');
  });

  it('appends exact continue_url when model omitted it', () => {
    const url = 'https://shop.myshopify.com/cart/c/EXACT';
    const out = appendExactContinueUrlIfMissing(
      'Koszyk gotowy.',
      url,
      ['Dostosowano ilość'],
    );
    expect(out).toContain('Koszyk gotowy.');
    expect(out).toContain(url);
    expect(out).toContain('Dostosowano ilość');
    expect(out).not.toContain('utm_');
  });

  it('does not duplicate when url and notices already present', () => {
    const url = 'https://shop.myshopify.com/cart/c/EXACT';
    const reply = `Link: ${url}\n\nDostosowano ilość`;
    expect(
      appendExactContinueUrlIfMissing(reply, url, ['Dostosowano ilość']),
    ).toBe(reply);
  });

  it('always appends Shopify warnings even when continue_url already in reply (UCP MUST)', () => {
    const url = 'https://shop.myshopify.com/cart/c/EXACT';
    const reply = `Koszyk gotowy: [link](${url})`;
    const out = appendExactContinueUrlIfMissing(reply, url, [
      'Dostosowano ilość',
    ]);
    expect(out).toContain(url);
    expect(out).toContain('Dostosowano ilość');
    expect(out).not.toContain('utm_');
  });

  it('formats quantity_adjusted warning', () => {
    const notices = formatCartNoticeFromMessages([
      {type: 'warning', code: 'quantity_adjusted', content: 'Dostosowano ilość'},
    ]);
    expect(notices).toContain('Dostosowano ilość');
  });

  it('formatCartTotalsNote uses currency from totals (not hardcoded zł for EUR)', () => {
    const note = formatCartTotalsNote(
      [{type: 'total', amount: 1990, currency: 'EUR'}],
      'EUR',
    );
    expect(note).toContain('EUR');
    expect(note).not.toMatch(/\bzł\b/);
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
