import {describe, expect, it} from 'vitest';
import {
  parseCmsFeaturedProducts,
  parseCmsFeaturedProductsSections,
} from './kazka-cms-featured-products';

const SAMPLE_SECTION = {
  type: 'section_featured_products',
  id: 'featured-products-kazka',
  heading: {value: 'Wybrane'},
  body: {value: 'Lead sekcji'},
  with_product_prices: {value: 'true'},
  products: {
    references: {
      nodes: [
        {
          id: 'gid://shopify/Product/1',
          title: 'Pierścionek',
          handle: 'pierscionek',
          priceRange: {
            minVariantPrice: {
              amount: '4900.00',
              currencyCode: 'PLN',
            },
          },
          variants: {
            nodes: [
              {
                image: {
                  url: 'https://cdn.shopify.com/p.jpg',
                  altText: 'Pierścionek',
                },
              },
            ],
          },
          media: {
            nodes: [
              {image: {url: 'https://cdn.shopify.com/p.jpg'}},
              {image: {url: 'https://cdn.shopify.com/p2.jpg'}},
            ],
          },
        },
      ],
    },
  },
};

describe('parseCmsFeaturedProductsSections', () => {
  it('returns empty array when route is null', () => {
    expect(parseCmsFeaturedProductsSections(null)).toEqual([]);
  });

  it('returns empty array when featured_products is empty', () => {
    expect(
      parseCmsFeaturedProductsSections({
        featured_products: {references: {nodes: []}},
      }),
    ).toEqual([]);
  });

  it('skips sections with no valid products', () => {
    expect(
      parseCmsFeaturedProductsSections({
        featured_products: {
          references: {
            nodes: [
              {
                type: 'section_featured_products',
                id: 'empty',
                products: {references: {nodes: []}},
              },
            ],
          },
        },
      }),
    ).toEqual([]);
  });

  it('parses section_featured_products from route.featured_products', () => {
    const sections = parseCmsFeaturedProductsSections({
      featured_products: {
        references: {nodes: [SAMPLE_SECTION]},
      },
    });

    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({
      id: 'featured-products-kazka',
      heading: 'Wybrane',
      body: 'Lead sekcji',
      showPrices: true,
    });
    expect(sections[0].products).toHaveLength(1);
    expect(sections[0].products[0]).toMatchObject({
      handle: 'pierscionek',
      title: 'Pierścionek',
      imageUrl: 'https://cdn.shopify.com/p.jpg',
      hover: {kind: 'image', url: 'https://cdn.shopify.com/p2.jpg'},
      priceLabel: expect.stringContaining('4'),
    });
  });
});

describe('parseCmsFeaturedProducts', () => {
  it('returns null when route is null', () => {
    expect(parseCmsFeaturedProducts(null)).toBeNull();
  });

  it('returns first section', () => {
    const section = parseCmsFeaturedProducts({
      featured_products: {
        references: {nodes: [SAMPLE_SECTION]},
      },
    });
    expect(section?.id).toBe('featured-products-kazka');
  });
});
