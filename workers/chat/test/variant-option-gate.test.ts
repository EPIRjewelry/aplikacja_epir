import { describe, expect, it, vi } from 'vitest';
import type { ProductFacts, VariantFacts } from '../src/facts/types';
import {
  collectCartAddsWithOptions,
  createVariantOptionIndex,
  mergeProductFactsIntoIndex,
  stripSelectedOptionsFromCartArgs,
  validateCartAddsAgainstIndex,
} from '../src/buyer/variant-option-gate';
import { applyCartPatch } from '../src/cart/ucp-cart';
import { executeBuyerTool } from '../src/buyer/execute-buyer-tool';
import * as mcpServer from '../src/mcp_server';

function ringProduct(): ProductFacts {
  const variants: VariantFacts[] = [
    {
      variantId: 'gid://shopify/ProductVariant/9',
      title: '9',
      image: null,
      sku: null,
      price: { minor: 10000, currency: 'PLN' },
      compareAtPrice: null,
      available: true,
      selectedOptions: [{ name: 'Rozmiar', value: '9' }],
      metal: null,
      size: '9',
      stoneOrigin: 'unknown',
      originEvidence: [],
    },
    {
      variantId: 'gid://shopify/ProductVariant/18',
      title: '18',
      image: null,
      sku: null,
      price: { minor: 10000, currency: 'PLN' },
      compareAtPrice: null,
      available: true,
      selectedOptions: [{ name: 'Rozmiar', value: '18' }],
      metal: null,
      size: '18',
      stoneOrigin: 'unknown',
      originEvidence: [],
    },
    {
      variantId: 'gid://shopify/ProductVariant/17',
      title: '17',
      image: null,
      sku: null,
      price: { minor: 10000, currency: 'PLN' },
      compareAtPrice: null,
      available: true,
      selectedOptions: [{ name: 'Rozmiar', value: '17' }],
      metal: null,
      size: '17',
      stoneOrigin: 'unknown',
      originEvidence: [],
    },
  ];
  return {
    channel: 'epir-online-store',
    productId: 'gid://shopify/Product/1',
    handle: 'ring',
    title: 'Pierścionek Aurora',
    vendor: 'EPIR',
    productType: 'ring',
    url: 'https://epirbizuteria.pl/products/ring',
    image: null,
    collections: [],
    descriptionText: '',
    options: [{ name: 'Rozmiar', values: ['9', '17', '18'] }],
    variants,
    priceRange: {
      min: { minor: 10000, currency: 'PLN' },
      max: { minor: 10000, currency: 'PLN' },
      isFlat: true,
    },
    stones: [],
    metals: [],
    sizes: ['9', '17', '18'],
    metafields: {},
    productOriginRaw: null,
    dataIssues: [],
    fetchedAt: '2026-01-01T00:00:00.000Z',
  };
}

function singleVariantProduct(): ProductFacts {
  const p = ringProduct();
  return {
    ...p,
    options: [{ name: 'Title', values: ['Default Title'] }],
    variants: [
      {
        ...p.variants[0],
        variantId: 'gid://shopify/ProductVariant/solo',
        selectedOptions: [{ name: 'Title', value: 'Default Title' }],
        size: null,
      },
    ],
  };
}

describe('variant option gate', () => {
  it('needs_option when multi-variant add without selected_options', () => {
    const index = createVariantOptionIndex();
    mergeProductFactsIntoIndex(index, ringProduct());
    const adds = collectCartAddsWithOptions('create_cart', {
      line_items: [{ quantity: 1, item: { id: 'gid://shopify/ProductVariant/9' } }],
    });
    const fail = validateCartAddsAgainstIndex(index, adds);
    expect(fail?.status).toBe('needs_option');
  });

  it('passes when selected_options match variant Rozmiar 18', () => {
    const index = createVariantOptionIndex();
    mergeProductFactsIntoIndex(index, ringProduct());
    const adds = collectCartAddsWithOptions('create_cart', {
      line_items: [
        {
          quantity: 1,
          item: { id: 'gid://shopify/ProductVariant/18' },
          selected_options: [{ name: 'Rozmiar', value: '18' }],
        },
      ],
    });
    expect(validateCartAddsAgainstIndex(index, adds)).toBeNull();
  });

  it('option_mismatch when variant 17 but selected 18', () => {
    const index = createVariantOptionIndex();
    mergeProductFactsIntoIndex(index, ringProduct());
    const adds = collectCartAddsWithOptions('create_cart', {
      line_items: [
        {
          quantity: 1,
          item: { id: 'gid://shopify/ProductVariant/17' },
          selected_options: [{ name: 'Rozmiar', value: '18' }],
        },
      ],
    });
    expect(validateCartAddsAgainstIndex(index, adds)?.status).toBe('option_mismatch');
  });

  it('single variant product skips gate', () => {
    const index = createVariantOptionIndex();
    mergeProductFactsIntoIndex(index, singleVariantProduct());
    const adds = collectCartAddsWithOptions('create_cart', {
      line_items: [
        { quantity: 1, item: { id: 'gid://shopify/ProductVariant/solo' } },
      ],
    });
    expect(validateCartAddsAgainstIndex(index, adds)).toBeNull();
  });

  it('strips selected_options before MCP args', () => {
    const stripped = stripSelectedOptionsFromCartArgs({
      line_items: [
        {
          quantity: 1,
          item: { id: 'gid://shopify/ProductVariant/1' },
          selected_options: [{ name: 'Rozmiar', value: '18' }],
        },
      ],
    });
    const line = (stripped.line_items as unknown[])[0] as Record<string, unknown>;
    expect(line.selected_options).toBeUndefined();
  });
});

describe('applyCartPatch variant swap', () => {
  it('remove line 9 + add variant 18 yields only size 18', () => {
    const existing = [
      {
        quantity: 1,
        item: { id: 'gid://shopify/ProductVariant/9' },
        lineId: 'li_old',
      },
    ];
    const merged = applyCartPatch(existing, {
      remove_line_ids: ['li_old'],
      add_items: [
        {
          product_variant_id: 'gid://shopify/ProductVariant/18',
          quantity: 2,
        },
      ],
    });
    expect(merged).toHaveLength(1);
    expect(merged[0].item.id).toBe('gid://shopify/ProductVariant/18');
    expect(merged[0].quantity).toBe(2);
  });
});

describe('executeBuyerTool option gate blocks MCP', () => {
  it('GE add without size → needs_option, no callMcpToolDirect', async () => {
    const index = createVariantOptionIndex();
    mergeProductFactsIntoIndex(index, ringProduct());
    const mcpSpy = vi.spyOn(mcpServer, 'callMcpToolDirect');

    const out = await executeBuyerTool({
      env: {} as import('../src/config/bindings').Env,
      channelId: 'epir-online-store',
      readyTools: ['ucp_cart'],
      name: 'create_cart',
      argsJson: JSON.stringify({
        line_items: [{ quantity: 1, item: { id: 'gid://shopify/ProductVariant/9' } }],
      }),
      sessionCartId: null,
      allowedVariantIds: new Set(['gid://shopify/ProductVariant/9']),
      variantOptionIndex: index,
    });

    expect(mcpSpy).not.toHaveBeenCalled();
    const parsed = JSON.parse(out.content) as { status?: string };
    expect(parsed.status).toBe('needs_option');
  });
});
