import {describe, expect, it} from 'vitest';
import {detectForcedCartTool} from '../src/buyer/cart-intent';
import {
  appendExactContinueUrlIfMissing,
  buildCartContinueReply,
  formatCartLineSummaries,
  formatCartNoticeFromMessages,
  formatCartTotalsNote,
  mergeModelTextWithCartBlock,
  stripAllCartContinueLinks,
  stripBrokenMarkdownLinkPrefix,
} from '../src/buyer/cart-continue-reply';
import {
  createVariantOptionIndex,
  mergeProductFactsIntoIndex,
} from '../src/buyer/variant-option-gate';
import type { ProductFacts, VariantFacts } from '../src/facts/types';
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

  it('strips all /cart/c/ links from model text (old + new)', () => {
    const oldUrl = 'https://shop.myshopify.com/cart/c/OLD?key=1';
    const newUrl = 'https://shop.myshopify.com/cart/c/NEW?key=2';
    const text = `Stary [koszyk](${oldUrl}) i bare ${newUrl}`;
    const stripped = stripAllCartContinueLinks(text);
    expect(stripped).not.toContain('/cart/c/');
    expect(stripped).toContain('Stary');
  });

  it('stripBrokenMarkdownLinkPrefix removes degenerate [… without closed link', () => {
    const text =
      '[Link do konta koszyka z dodanym pierścion z tą rozmi rozmi rozmi?]\n\nDalej tekst.';
    const out = stripBrokenMarkdownLinkPrefix(text);
    expect(out).toBe('Dalej tekst.');
    expect(out).not.toContain('[');
  });

  it('stripBrokenMarkdownLinkPrefix removes mid-text [… without ]( ; keeps valid links', () => {
    const mid = stripBrokenMarkdownLinkPrefix(
      'Przed [Link do koszyka z rozmi rozmi?] po',
    );
    expect(mid).toMatch(/Przed/);
    expect(mid).toMatch(/po/);
    expect(mid).not.toContain('[');
    expect(mid).not.toContain('Link do koszyka');

    const mixed = stripBrokenMarkdownLinkPrefix(
      '[ok](https://example.com/x) i [zepsute?]',
    );
    expect(mixed).toContain('[ok](https://example.com/x)');
    expect(mixed).not.toContain('zepsute');
  });

  it('mergeModelTextWithCartBlock keeps only block continue_url after mutation', () => {
    const oldUrl = 'https://shop.myshopify.com/cart/c/OLD';
    const newUrl = 'https://shop.myshopify.com/cart/c/NEW';
    const block = buildCartContinueReply(newUrl, [], null);
    const merged = mergeModelTextWithCartBlock(
      `Gotowe [stary](${oldUrl})`,
      block,
      newUrl,
    );
    expect(merged).toContain(newUrl);
    expect(merged).not.toContain(oldUrl);
    expect(merged.match(/\/cart\/c\//g)?.length).toBe(1);
  });

  it('formatCartLineSummaries shows full options and price from catalog index', () => {
    const variants: VariantFacts[] = [
      {
        variantId: 'gid://shopify/ProductVariant/p1',
        title: '14k / LAB / 16',
        image: null,
        sku: null,
        price: { minor: 450000, currency: 'PLN' },
        compareAtPrice: null,
        available: true,
        selectedOptions: [
          { name: 'Metal', value: '14k' },
          { name: 'Kamień', value: 'LAB' },
          { name: 'Rozmiar', value: '16' },
        ],
        metal: '14k',
        size: '16',
        stoneOrigin: 'lab_grown',
        originEvidence: [],
      },
    ];
    const product: ProductFacts = {
      channel: 'epir-online-store',
      productId: 'gid://shopify/Product/p',
      handle: 'ring',
      title: 'Soliter',
      vendor: 'EPIR',
      productType: 'ring',
      url: 'https://epirbizuteria.pl/products/ring',
      image: null,
      collections: [],
      descriptionText: '',
      options: [
        { name: 'Metal', values: ['14k'] },
        { name: 'Kamień', values: ['LAB'] },
        { name: 'Rozmiar', values: ['16'] },
      ],
      variants,
      priceRange: {
        min: { minor: 450000, currency: 'PLN' },
        max: { minor: 450000, currency: 'PLN' },
        isFlat: true,
      },
      stones: [],
      metals: ['14k'],
      sizes: ['16'],
      metafields: {},
      productOriginRaw: null,
      dataIssues: [],
      fetchedAt: '2026-01-01T00:00:00.000Z',
    };
    const index = createVariantOptionIndex();
    mergeProductFactsIntoIndex(index, product);
    const lines = formatCartLineSummaries(
      {
        line_items: [
          { quantity: 1, item: { id: 'gid://shopify/ProductVariant/p1' } },
        ],
      },
      index,
    );
    expect(lines[0]).toMatch(/Soliter/);
    expect(lines[0]).toMatch(/Metal 14k/);
    expect(lines[0]).toMatch(/Kamień LAB/);
    expect(lines[0]).toMatch(/Rozmiar 16/);
    expect(lines[0]).toMatch(/4500\.00 zł/);
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
