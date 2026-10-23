import type {BuyerChannelId} from '../../src/buyer/channel-switch';
import {storefrontOriginForChannel} from '../../src/buyer/channel-origins';
import type {ProductFacts, VariantFacts} from '../../src/facts/types';
import {
  createVariantOptionIndex,
  mergeProductFactsIntoIndex,
  type VariantOptionIndex,
} from '../../src/buyer/variant-option-gate';

const TY_FAIL_RE = /\b(chcesz|możesz|twój|twoja|ciebie|tobie)\b/i;
const TON_FAIL_RE = /\b(ekskluzywny|luksusowy|premium|prestiżowy)\b/i;

/** Kopia ringProduct() z variant-option-gate.test.ts:16-87 (bez zmiany oryginału). */
export function ringProductBase(): ProductFacts {
  const variants: VariantFacts[] = [
    mkVariant('gid://shopify/ProductVariant/MOCK-R-9', '9', true),
    mkVariant('gid://shopify/ProductVariant/MOCK-R-17', '17', true),
    mkVariant('gid://shopify/ProductVariant/MOCK-R-18', '18', true),
    mkVariant('gid://shopify/ProductVariant/MOCK-R-UNAV', '14', false),
  ];
  return {
    channel: 'epir-online-store',
    productId: 'gid://shopify/Product/MOCK-RING-1',
    handle: 'mock-ring-aurora',
    title: 'Pierścionek Aurora (mock)',
    vendor: 'MOCK',
    productType: 'ring',
    url: 'https://epirbizuteria.pl/products/mock-ring-aurora',
    image: null,
    collections: [],
    descriptionText: '',
    options: [{name: 'Rozmiar', values: ['9', '14', '17', '18']}],
    variants,
    priceRange: {
      min: {minor: 10000, currency: 'PLN'},
      max: {minor: 10000, currency: 'PLN'},
      isFlat: true,
    },
    stones: ['brylant'],
    metals: ['złoto 585 białe'],
    sizes: ['9', '14', '17', '18'],
    metafields: {},
    productOriginRaw: null,
    dataIssues: [],
    fetchedAt: '2026-01-01T00:00:00.000Z',
  };
}

function mkVariant(id: string, size: string, available: boolean): VariantFacts {
  return {
    variantId: id,
    title: size,
    image: null,
    sku: null,
    price: {minor: 10000, currency: 'PLN'},
    compareAtPrice: null,
    available,
    selectedOptions: [{name: 'Rozmiar', value: size}],
    metal: 'złoto 585 białe',
    size,
    stoneOrigin: 'unknown',
    originEvidence: [],
  };
}

export function productUrlForChannel(channelId: BuyerChannelId, handle: string): string {
  const origin = storefrontOriginForChannel(channelId);
  return `${origin}/products/${handle}`;
}

export function ringForChannel(channelId: BuyerChannelId): ProductFacts {
  const base = ringProductBase();
  const handle = base.handle;
  return {
    ...base,
    channel: channelId,
    url: productUrlForChannel(channelId, handle),
  };
}

export function earringProduct(channelId: BuyerChannelId): ProductFacts {
  const vid = 'gid://shopify/ProductVariant/MOCK-EAR-1';
  return {
    ...ringForChannel(channelId),
    productId: 'gid://shopify/Product/MOCK-EAR-1',
    handle: 'mock-kolczyki',
    title: 'Kolczyki mock',
    url: productUrlForChannel(channelId, 'mock-kolczyki'),
    options: [{name: 'Title', values: ['Default Title']}],
    sizes: [],
    variants: [
      {
        variantId: vid,
        title: 'Default',
        image: null,
        sku: null,
        price: {minor: 8000, currency: 'PLN'},
        compareAtPrice: null,
        available: true,
        selectedOptions: [{name: 'Title', value: 'Default Title'}],
        metal: 'srebro 925',
        size: null,
        stoneOrigin: 'unknown',
        originEvidence: [],
      },
    ],
  };
}

export function bandVariantsForPair(channelId: BuyerChannelId): ProductFacts {
  const v12 = mkVariant('gid://shopify/ProductVariant/MOCK-B-12', '12', true);
  const v22 = mkVariant('gid://shopify/ProductVariant/MOCK-B-22', '22', true);
  return {
    ...ringForChannel(channelId),
    productId: 'gid://shopify/Product/MOCK-BAND-1',
    handle: 'mock-obraczki',
    title: 'Obrączki mock',
    url: productUrlForChannel(channelId, 'mock-obraczki'),
    options: [{name: 'Rozmiar', values: ['12', '22']}],
    sizes: ['12', '22'],
    variants: [v12, v22],
  };
}

export function mergeIndex(...products: ProductFacts[]): VariantOptionIndex {
  const index = createVariantOptionIndex();
  for (const p of products) mergeProductFactsIntoIndex(index, p);
  return index;
}

export function mockCartContinue(channelId: BuyerChannelId, token = 'MOCK-CART-TOKEN'): string {
  const origin = storefrontOriginForChannel(channelId);
  return `${origin}/cart/c/${token}?key=mock-key`;
}

export function mockFlatCartPayload(
  channelId: BuyerChannelId,
  line_items: unknown[],
  totals: unknown[],
  messages?: unknown[],
): Record<string, unknown> {
  return {
    id: 'gid://shopify/Cart/MOCK-SESSION?key=mock',
    line_items,
    currency: 'PLN',
    totals,
    continue_url: mockCartContinue(channelId),
    ...(messages ? {messages} : {}),
  };
}

export function assertKForma(reply: string): void {
  if (TY_FAIL_RE.test(reply)) throw new Error(`K-forma FAIL: ${reply.slice(0, 120)}`);
}

export function assertKTon(reply: string): void {
  if (TON_FAIL_RE.test(reply)) throw new Error(`K-ton FAIL: ${reply.slice(0, 120)}`);
}

export const MOCK_KB_PHONE = '+48 000 000 000';
