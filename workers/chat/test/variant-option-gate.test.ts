import { describe, expect, it, vi } from 'vitest';
import type { ProductFacts, VariantFacts } from '../src/facts/types';
import {
  collectCartAddsWithOptions,
  createVariantOptionIndex,
  findVariantIdBySelectedOptions,
  mergeProductFactsIntoIndex,
  resolveVariantSwapFromCart,
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

  it('variant on allowlist but missing from option index → variant_options_unknown', async () => {
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
      variantOptionIndex: createVariantOptionIndex(),
    });
    expect(mcpSpy).not.toHaveBeenCalled();
    const parsed = JSON.parse(out.content) as { status?: string; notice?: string };
    expect(parsed.status).toBe('variant_options_unknown');
    expect(parsed.notice).toMatch(/katalogu/i);
  });
});

function gkProduct(): ProductFacts {
  const base = ringProduct();
  return {
    ...base,
    title: 'Pierścionek GK',
    options: [
      { name: 'Rozmiar', values: ['17', '18'] },
      { name: 'Kamień', values: ['Brylant', 'Szafir'] },
    ],
    sizes: ['17', '18'],
    variants: [
      {
        ...base.variants[0],
        variantId: 'gid://shopify/ProductVariant/gk18b',
        selectedOptions: [
          { name: 'Rozmiar', value: '18' },
          { name: 'Kamień', value: 'Brylant' },
        ],
        size: '18',
      },
    ],
  };
}

describe('multi-option and case-insensitive selected_options', () => {
  it('needs_option when only Rozmiar provided for Rozmiar+Kamień', () => {
    const index = createVariantOptionIndex();
    mergeProductFactsIntoIndex(index, gkProduct());
    const adds = collectCartAddsWithOptions('create_cart', {
      line_items: [
        {
          quantity: 1,
          item: { id: 'gid://shopify/ProductVariant/gk18b' },
          selected_options: [{ name: 'Rozmiar', value: '18' }],
        },
      ],
    });
    const fail = validateCartAddsAgainstIndex(index, adds);
    expect(fail?.status).toBe('needs_option');
    if (fail?.status === 'needs_option') {
      expect(fail.missing_options).toContain('Kamień');
    }
  });

  it('accepts case-insensitive option name rozmiar = Rozmiar', () => {
    const index = createVariantOptionIndex();
    mergeProductFactsIntoIndex(index, ringProduct());
    const adds = collectCartAddsWithOptions('create_cart', {
      line_items: [
        {
          quantity: 1,
          item: { id: 'gid://shopify/ProductVariant/18' },
          selected_options: [{ name: 'rozmiar', value: '18' }],
        },
      ],
    });
    expect(validateCartAddsAgainstIndex(index, adds)).toBeNull();
  });
});

function soliterProduct(): ProductFacts {
  const variants: VariantFacts[] = [
    {
      variantId: 'gid://shopify/ProductVariant/s14lab18',
      title: '14k / LAB / 18',
      image: null,
      sku: null,
      price: { minor: 450000, currency: 'PLN' },
      compareAtPrice: null,
      available: true,
      selectedOptions: [
        { name: 'Metal', value: '14k' },
        { name: 'Kamień', value: 'LAB' },
        { name: 'Rozmiar', value: '18' },
      ],
      metal: '14k',
      size: '18',
      stoneOrigin: 'lab_grown',
      originEvidence: [],
    },
    {
      variantId: 'gid://shopify/ProductVariant/s14lab16',
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
  return {
    channel: 'kazka-hydrogen',
    productId: 'gid://shopify/Product/soliter',
    handle: 'soliter',
    title: 'Soliter',
    vendor: 'KAZKA',
    productType: 'ring',
    url: 'https://kazka.epirbizuteria.pl/products/soliter',
    image: null,
    collections: [],
    descriptionText: '',
    options: [
      { name: 'Metal', values: ['14k'] },
      { name: 'Kamień', values: ['LAB'] },
      { name: 'Rozmiar', values: ['16', '18'] },
    ],
    variants,
    priceRange: {
      min: { minor: 450000, currency: 'PLN' },
      max: { minor: 450000, currency: 'PLN' },
      isFlat: true,
    },
    stones: [],
    metals: ['14k'],
    sizes: ['16', '18'],
    metafields: {},
    productOriginRaw: null,
    dataIssues: [],
    fetchedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('resolveVariantSwapFromCart', () => {
  it('inherits other options when exactly one cart line matches product', () => {
    const index = createVariantOptionIndex();
    mergeProductFactsIntoIndex(index, soliterProduct());
    const resolved = resolveVariantSwapFromCart(
      index,
      [{ lineId: 'li1', variantId: 'gid://shopify/ProductVariant/s14lab18' }],
      [{ name: 'Rozmiar', value: '16' }],
      [],
    );
    expect(resolved.status).toBe('ok');
    if (resolved.status === 'ok') {
      expect(resolved.targetVariantId).toBe('gid://shopify/ProductVariant/s14lab16');
      expect(resolved.selectedOptions).toEqual([
        { name: 'Metal', value: '14k' },
        { name: 'Kamień', value: 'LAB' },
        { name: 'Rozmiar', value: '16' },
      ]);
      expect(resolved.removeLineId).toBe('li1');
    }
  });

  it('asks by name/options when multiple lines of same product (never line_id)', () => {
    const index = createVariantOptionIndex();
    mergeProductFactsIntoIndex(index, soliterProduct());
    const resolved = resolveVariantSwapFromCart(
      index,
      [
        { lineId: 'li_a', variantId: 'gid://shopify/ProductVariant/s14lab18' },
        { lineId: 'li_b', variantId: 'gid://shopify/ProductVariant/s14lab16' },
      ],
      [{ name: 'Rozmiar', value: '16' }],
      [],
    );
    expect(resolved.status).toBe('ambiguous_lines');
    if (resolved.status === 'ambiguous_lines') {
      expect(resolved.choices.length).toBe(2);
      expect(resolved.choices[0].title).toBe('Soliter');
      expect(resolved.choices[0].optionsLine).toMatch(/Rozmiar/);
      expect(JSON.stringify(resolved.choices)).not.toMatch(/li_/);
    }
  });

  it('variant_unavailable when target options do not exist in catalog', () => {
    const index = createVariantOptionIndex();
    mergeProductFactsIntoIndex(index, soliterProduct());
    const resolved = resolveVariantSwapFromCart(
      index,
      [{ lineId: 'li1', variantId: 'gid://shopify/ProductVariant/s14lab18' }],
      [{ name: 'Rozmiar', value: '99' }],
      [],
    );
    expect(resolved.status).toBe('variant_unavailable');
  });

  it('findVariantIdBySelectedOptions resolves like variantBySelectedOptions', () => {
    const index = createVariantOptionIndex();
    mergeProductFactsIntoIndex(index, soliterProduct());
    const id = findVariantIdBySelectedOptions(index, 'gid://shopify/Product/soliter', [
      { name: 'Metal', value: '14k' },
      { name: 'Kamień', value: 'LAB' },
      { name: 'Rozmiar', value: '16' },
    ]);
    expect(id).toBe('gid://shopify/ProductVariant/s14lab16');
  });
});
