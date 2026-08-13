import { describe, expect, it } from 'vitest';
import {
  buildGmcVariantLink,
  classifyAvailabilityLabel,
  classifyMarginLabel,
  enrichTitleRules,
  resolveGoogleProductCategory,
  transformProductToGmcRows,
} from '../src/transform.js';
import { classifyMetalLabel } from '../src/metal-label.js';
import type { InternalProductRow, MappingConfig, ShopifyConfig, ShopifyProduct } from '../src/types.js';

const mapping: MappingConfig = {
  gmcColumns: [],
  shopifyToInternal: {},
  googleProductCategory: {
    default: '188',
    byProductType: { Pierścionek: '200', Naszyjnik: '196' },
    byCollection: { Forest: '200' },
  },
  marginRules: {
    heroTags: ['hero'],
    heroProductTypes: ['Pierścionek zaręczynowy'],
    highMarginMinPrice: 2500,
    highMarginMinRatio: 0.55,
    mediumMarginMinPrice: 900,
    mediumMarginMinRatio: 0.4,
    labels: {
      hero: 'Hero-Product',
      high: 'High-Margin',
      medium: 'Medium-Margin',
      low: 'Low-Margin',
    },
  },
  availabilityRules: {
    defaultLeadTime: '4-7 dni',
    labels: {
      ship3to5: 'Wysylka_4_7_dni',
      madeToOrder: 'Na_zamowienie_7_dni',
    },
    leadTimePatterns: {
      '3to5': ['3-5', '4-7', 'do 5 dni', '24h', 'od reki'],
      '7plus': ['na zamowienie', '7 dni', '3 tygodnie'],
    },
  },
  titleEnrichment: {
    craftsmanshipSuffix: 'ręcznie kuty rzemieślniczy',
    maxLength: 150,
    aiEnabled: false,
    aiModels: [],
    aiPromptTemplate: '',
  },
} as MappingConfig;

function baseRow(overrides: Partial<InternalProductRow> = {}): InternalProductRow {
  return {
    productId: '1',
    variantId: '10',
    title: 'Pierścionek Forest',
    descriptionHtml: '<p>Opis</p>',
    productUrl: 'https://l.epirbizuteria.pl/products/forest',
    imageUrl: 'https://cdn.shopify.com/image.jpg',
    price: '3200.00',
    compareAtPrice: '3800.00',
    unitCost: null,
    inventoryQty: 2,
    availableForSale: true,
    brand: 'EPIR',
    productType: 'Pierścionek',
    tags: [],
    collections: ['Forest'],
    gemType: 'turmalin',
    material: 'złoto',
    craftsmanship: 'ręcznie kuty',
    leadTime: '24h',
    gemstoneTypeTaxonomy: '',
    jewelryMaterialTaxonomy: '',
    googleCategoryMetafield: '',
    existingCustomLabel0: '',
    existingCustomLabel1: '',
    existingCustomLabel2: '',
    ...overrides,
  };
}

describe('classifyMarginLabel', () => {
  it('marks hero products by tag', () => {
    expect(classifyMarginLabel(baseRow({ tags: ['hero'] }), mapping)).toBe(
      'Hero-Product',
    );
  });

  it('marks high margin by price', () => {
    expect(classifyMarginLabel(baseRow(), mapping)).toBe('High-Margin');
  });

  it('marks low margin for cheap items', () => {
    expect(classifyMarginLabel(baseRow({ price: '400.00' }), mapping)).toBe(
      'Low-Margin',
    );
  });
});

describe('classifyAvailabilityLabel', () => {
  it('maps legacy 24h lead time to standard 4-7 days label', () => {
    expect(classifyAvailabilityLabel(baseRow({ leadTime: '24h' }), mapping)).toBe(
      'Wysylka_4_7_dni',
    );
  });

  it('maps 3 weeks lead time to made-to-order label', () => {
    expect(
      classifyAvailabilityLabel(baseRow({ leadTime: '3 tygodnie' }), mapping),
    ).toBe('Na_zamowienie_7_dni');
  });

  it('defaults to 4-7 days when lead time empty', () => {
    expect(classifyAvailabilityLabel(baseRow({ leadTime: '' }), mapping)).toBe(
      'Wysylka_4_7_dni',
    );
  });

  it('detects made-to-order from lead time', () => {
    expect(
      classifyAvailabilityLabel(baseRow({ leadTime: 'na zamówienie 10 dni' }), mapping),
    ).toBe('Na_zamowienie_7_dni');
  });
});

describe('resolveGoogleProductCategory', () => {
  it('prefers collection mapping', () => {
    expect(resolveGoogleProductCategory(baseRow(), mapping)).toBe('200');
  });

  it('falls back to product type', () => {
    expect(
      resolveGoogleProductCategory(
        baseRow({ collections: [], productType: 'Naszyjnik' }),
        mapping,
      ),
    ).toBe('196');
  });
});

describe('enrichTitleRules', () => {
  it('adds gem, material and craftsmanship without keyword spam', () => {
    const title = enrichTitleRules(baseRow(), mapping);
    expect(title).toContain('Pierścionek Forest');
    expect(title.toLowerCase()).toContain('turmalin');
    expect(title.toLowerCase()).toContain('złoto');
    expect(title.length).toBeLessThanOrEqual(150);
  });
});

describe('classifyMetalLabel', () => {
  it('maps silver vendor to Srebro', () => {
    expect(classifyMetalLabel('EPIR Art Silver Jewellery', 'Pierścionek')).toBe(
      'Srebro',
    );
  });

  it('maps gold vendor to Zloto', () => {
    expect(classifyMetalLabel('EPIR Art Gold', 'Obrączka')).toBe('Zloto');
  });

  it('overrides gemstone vendor when title is solid gold', () => {
    expect(
      classifyMetalLabel(
        'EPIR Art Jewellery&Gemstone',
        'Pierścionek złoty z turmalinem',
      ),
    ).toBe('Zloto');
  });
});

describe('buildGmcVariantLink', () => {
  it('appends ?variant= to clean PDP URL', () => {
    expect(
      buildGmcVariantLink('https://epirbizuteria.pl/products/foo', '12345'),
    ).toBe('https://epirbizuteria.pl/products/foo?variant=12345');
  });

  it('replaces existing variant query param', () => {
    expect(
      buildGmcVariantLink(
        'https://epirbizuteria.pl/products/foo?variant=1',
        '99',
      ),
    ).toBe('https://epirbizuteria.pl/products/foo?variant=99');
  });
});

describe('transformProductToGmcRows', () => {
  const shopifyConfig = {
    brand: 'EPIR',
    storefrontBaseUrl: 'https://epirbizuteria.pl',
  } as ShopifyConfig;

  it('sets identifier_exists=no and variant deep-link', async () => {
    const product: ShopifyProduct = {
      id: '1',
      handle: 'forest',
      title: 'Pierścionek Forest',
      descriptionHtml: '<p>Opis</p>',
      onlineStoreUrl: 'https://epirbizuteria.pl/products/forest',
      featuredImageUrl: 'https://cdn.shopify.com/image.jpg',
      vendor: 'EPIR Art Silver Jewellery',
      productType: 'Pierścionek',
      tags: [],
      collections: ['Forest'],
      metafields: {},
      variants: [
        {
          id: '51952469049676',
          sku: null,
          price: '3200.00',
          compareAtPrice: null,
          unitCost: null,
          inventoryQuantity: 1,
          availableForSale: true,
          imageUrl: null,
          metafields: {},
        },
      ],
    };

    const rows = await transformProductToGmcRows(
      product,
      shopifyConfig,
      mapping,
      { useAi: false },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].identifier_exists).toBe('no');
    expect(rows[0].link).toBe(
      'https://epirbizuteria.pl/products/forest?variant=51952469049676',
    );
    expect(rows[0].id).toBe('shopify_PL_51952469049676');
    expect(rows[0].custom_label_2).toBe('Srebro');
    expect(rows[0].color).toBe('Silver');
  });

  it('maps gold metal to GMC color Gold', async () => {
    const product: ShopifyProduct = {
      id: '2',
      handle: 'zloto',
      title: 'Pierścionek żółte złoto 14k',
      descriptionHtml: '<p>Opis</p>',
      onlineStoreUrl: 'https://epirbizuteria.pl/products/zloto',
      featuredImageUrl: 'https://cdn.shopify.com/image.jpg',
      vendor: 'EPIR Art Gold',
      productType: 'Pierścionek',
      tags: [],
      collections: [],
      metafields: {},
      variants: [
        {
          id: '111',
          sku: null,
          price: '5000.00',
          compareAtPrice: null,
          unitCost: null,
          inventoryQuantity: 1,
          availableForSale: true,
          imageUrl: null,
          metafields: {},
        },
      ],
    };
    const rows = await transformProductToGmcRows(
      product,
      shopifyConfig,
      mapping,
      { useAi: false },
    );
    expect(rows[0].custom_label_2).toBe('Zloto');
    expect(rows[0].color).toBe('Gold');
  });
});
