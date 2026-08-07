import {describe, expect, it} from 'vitest';
import {buildProductJsonLd} from './product-json-ld';

describe('buildProductJsonLd', () => {
  it('includes stone_profile PropertyValue list when present', () => {
    const jsonLd = buildProductJsonLd({
      canonicalUrl: 'https://kazka.epirbizuteria.pl/products/ametyst',
      availableForSale: true,
      offerPrice: {amount: '1200.0', currencyCode: 'PLN'},
      product: {
        title: 'Pierścionek Ametyst',
        description: 'Opis',
        vendor: 'EPIR',
        productType: 'Pierścionki',
        featuredImage: {url: 'https://cdn.shopify.com/x.jpg'},
        stoneProfile: {
          reference: {
            fields: [
              {key: 'stone_name', value: 'Amethyst'},
              {key: 'hardness', value: '7'},
              {key: 'mythology', value: '{"type":"root"}'},
            ],
          },
        },
      },
    });

    expect(jsonLd['@type']).toBe('Product');
    expect(jsonLd.offers).toMatchObject({
      '@type': 'Offer',
      price: '1200.0',
      priceCurrency: 'PLN',
      availability: 'https://schema.org/InStock',
    });
    expect(jsonLd.additionalProperty).toEqual([
      {'@type': 'PropertyValue', name: 'Stone', value: 'Amethyst'},
      {'@type': 'PropertyValue', name: 'Hardness (Mohs)', value: '7'},
    ]);
  });

  it('falls back to glowny_kamien and omits additionalProperty when empty', () => {
    const withFallback = buildProductJsonLd({
      canonicalUrl: 'https://kazka.epirbizuteria.pl/products/x',
      product: {
        title: 'X',
        glownyKamien: {
          reference: {
            fields: [{key: 'stone_name', value: 'Opal'}],
          },
        },
      },
    });
    expect(withFallback.additionalProperty).toEqual([
      {'@type': 'PropertyValue', name: 'Stone', value: 'Opal'},
    ]);

    const empty = buildProductJsonLd({
      canonicalUrl: 'https://kazka.epirbizuteria.pl/products/y',
      product: {title: 'Y'},
    });
    expect(empty).not.toHaveProperty('additionalProperty');
  });
});
