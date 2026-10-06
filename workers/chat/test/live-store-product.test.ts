import {describe, expect, it} from 'vitest';
import {presentCatalogForModel} from '../src/mcp/catalog-for-model';
import {
  filterLivePublishedProducts,
  guardLiveCatalogProductLinks,
  isLivePublishedProduct,
  withActiveStatusQuery,
} from '../src/catalog/live-store-product';
import {mapStoreProduct} from '../src/catalog/stone-retrieval';

function presentedCard(input: {
  title: string;
  handle: string;
  url?: string;
  onlineStoreUrl?: string;
  status?: string;
  publishedOnCurrentPublication?: boolean;
}) {
  const raw = {
    id: `gid://shopify/Product/${input.handle}`,
    title: input.title,
    handle: input.handle,
    status: input.status,
    publishedOnCurrentPublication: input.publishedOnCurrentPublication,
    onlineStoreUrl: input.onlineStoreUrl,
    url: input.url ?? input.onlineStoreUrl,
    variants: [
      {
        id: 'gid://shopify/ProductVariant/1',
        title: 'Default',
        price: {amount: 21000, currency: 'PLN'},
      },
    ],
  };
  const presented = presentCatalogForModel({products: [raw]}, {brand: 'epir'});
  const text = (presented as {content?: Array<{text?: string}>}).content?.[0]?.text ?? '{}';
  return JSON.parse(text) as {products: Array<Record<string, unknown>>};
}

describe('withActiveStatusQuery', () => {
  it('adds status:active for Admin search and leaves an explicit status alone', () => {
    expect(withActiveStatusQuery('szafir')).toBe('(szafir) AND status:active');
    expect(withActiveStatusQuery('status:draft szafir')).toBe('status:draft szafir');
    expect(withActiveStatusQuery('')).toBe('status:active');
  });
});

describe('isLivePublishedProduct', () => {
  it('drops DRAFT, ARCHIVED, and ACTIVE without onlineStoreUrl; app publication false is still live', () => {
    expect(
      isLivePublishedProduct({
        status: 'DRAFT',
        onlineStoreUrl: 'https://epirbizuteria.pl/products/draft-ring',
      }),
    ).toBe(false);
    expect(
      isLivePublishedProduct({
        status: 'ARCHIVED',
        onlineStoreUrl: 'https://epirbizuteria.pl/products/old-ring',
      }),
    ).toBe(false);
    expect(
      isLivePublishedProduct({
        status: 'ACTIVE',
        publishedOnCurrentPublication: false,
        onlineStoreUrl: 'https://epirbizuteria.pl/products/hidden',
      }),
    ).toBe(true);
    expect(
      isLivePublishedProduct({
        status: 'ACTIVE',
        handle: 'srebrny-pierscionek-z-szafirem-i-emalia',
      }),
    ).toBe(false);
    expect(
      isLivePublishedProduct({
        status: 'ACTIVE',
        publishedOnCurrentPublication: true,
        onlineStoreUrl: 'https://epirbizuteria.pl/products/live-ring',
      }),
    ).toBe(true);
  });

  it('does not require Online Store URL for Kazka', () => {
    expect(
      isLivePublishedProduct(
        {status: 'ACTIVE', handle: '101-10010-3-7', publishedOnCurrentPublication: false},
        {channel: 'kazka'},
      ),
    ).toBe(true);
    expect(isLivePublishedProduct({status: 'DRAFT', handle: 'draft-soliter'}, {channel: 'kazka'})).toBe(false);
  });

  it('filters Admin nodes through mapStoreProduct', () => {
    const nodes = [
      {
        id: 'gid://shopify/Product/1',
        handle: 'draft-ring',
        title: 'Srebrny pierścionek z szafirem i emalią',
        status: 'DRAFT',
        publishedOnCurrentPublication: false,
        onlineStoreUrl: null,
        variants: {nodes: []},
      },
      {
        id: 'gid://shopify/Product/2',
        handle: 'archived-ring',
        title: 'Regulowany pierścionek srebrny z dwoma kamieniami',
        status: 'ARCHIVED',
        publishedOnCurrentPublication: false,
        onlineStoreUrl: null,
        variants: {nodes: []},
      },
      {
        id: 'gid://shopify/Product/3',
        handle: 'unpublished-active',
        title: 'Pierścionek ACTIVE bez Online Store',
        status: 'ACTIVE',
        publishedOnCurrentPublication: false,
        onlineStoreUrl: null,
        variants: {nodes: []},
      },
      {
        id: 'gid://shopify/Product/4',
        handle: 'live-sapphire',
        title: 'Srebrna obrączka z szafirem',
        status: 'ACTIVE',
        publishedOnCurrentPublication: true,
        onlineStoreUrl: 'https://epirbizuteria.pl/products/live-sapphire',
        variants: {nodes: []},
      },
      {
        id: 'gid://shopify/Product/5',
        handle: 'zloty-pierscionek-z-naturalnym-szafirem',
        title: 'Złoty pierścionek z naturalnym szafirem',
        status: 'ACTIVE',
        publishedOnCurrentPublication: false,
        onlineStoreUrl: 'https://epirbizuteria.pl/products/zloty-pierscionek-z-naturalnym-szafirem',
        variants: {nodes: []},
      },
      {
        id: 'gid://shopify/Product/6',
        handle: 'pierscionek-srebrny-fale-wody-z-szafirem',
        title: 'Pierścionek srebrny fale wody z szafirem',
        status: 'ACTIVE',
        publishedOnCurrentPublication: false,
        onlineStoreUrl: 'https://epirbizuteria.pl/products/pierscionek-srebrny-fale-wody-z-szafirem',
        variants: {nodes: []},
      },
    ].map((node) => mapStoreProduct(node));

    expect(filterLivePublishedProducts(nodes).map((product) => product.handle)).toEqual([
      'live-sapphire',
      'zloty-pierscionek-z-naturalnym-szafirem',
      'pierscionek-srebrny-fale-wody-z-szafirem',
    ]);
    expect(nodes.some((product) => 'publishedOnCurrentPublication' in product)).toBe(false);
  });
});

describe('presentCatalogForModel live URL', () => {
  it('does not invent /products/{handle} when onlineStoreUrl is missing', () => {
    const card = presentedCard({
      title: 'Srebrny pierścionek z szafirem i emalią',
      handle: 'srebrny-pierscionek-z-szafirem-i-emalia',
    });
    expect(card.products[0]?.url).toBeUndefined();
    expect(JSON.stringify(card)).not.toContain('/products/srebrny-pierscionek-z-szafirem-i-emalia');
  });
});

describe('guardLiveCatalogProductLinks', () => {
  const liveSnapshot = {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          products: [
            {
              title: 'Srebrna obrączka z szafirem',
              handle: 'live-sapphire',
              url: 'https://epirbizuteria.pl/products/live-sapphire',
              onlineStoreUrl: 'https://epirbizuteria.pl/products/live-sapphire',
              status: 'ACTIVE',
            },
          ],
        }),
      },
    ],
  };

  it('removes a product link that only appeared in history, not in this-turn cards', () => {
    const guarded = guardLiveCatalogProductLinks(
      'Wcześniej: [Srebrny pierścionek z szafirem i emalią](https://epirbizuteria.pl/products/srebrny-pierscionek-z-szafirem-i-emalia) za 210 zł.',
      [liveSnapshot],
    );
    expect(guarded.changed).toBe(true);
    expect(guarded.text).not.toContain('/products/srebrny-pierscionek-z-szafirem-i-emalia');
    expect(guarded.text).not.toContain('](https://');
  });

  it('rewrites a generic „zobacz produkt” label to the exact card title', () => {
    const guarded = guardLiveCatalogProductLinks(
      'Polecam [zobacz produkt](https://epirbizuteria.pl/products/live-sapphire).',
      [liveSnapshot],
    );
    expect(guarded.changed).toBe(true);
    expect(guarded.text).toContain('[Srebrna obrączka z szafirem](https://epirbizuteria.pl/products/live-sapphire)');
    expect(guarded.text).not.toContain('[zobacz produkt]');
  });

  it('keeps a this-turn live product link with its title', () => {
    const text = 'Polecam [Srebrna obrączka z szafirem](https://epirbizuteria.pl/products/live-sapphire).';
    const guarded = guardLiveCatalogProductLinks(text, [liveSnapshot]);
    expect(guarded.changed).toBe(false);
    expect(guarded.text).toBe(text);
  });
});
