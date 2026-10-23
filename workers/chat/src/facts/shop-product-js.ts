/**
 * Online Store Ajax product JSON (`/products/{handle}.js`) — fallback when Storefront
 * GraphQL `product(handle:)` is unavailable for a published SKU.
 * @see https://shopify.dev/docs/api/ajax/reference/product
 */
import type {BuyerChannelId} from '../buyer/channel-switch';
import {storefrontOriginForChannel} from '../buyer/channel-origins';
import {normalizeProduct} from './normalize';
import type {ProductFacts} from './types';

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function productGidFromAjaxId(id: unknown): string | null {
  if (typeof id === 'number' && Number.isFinite(id)) {
    return `gid://shopify/Product/${Math.trunc(id)}`;
  }
  if (typeof id === 'string' && id.trim()) {
    const t = id.trim();
    if (t.includes('/Product/')) return t;
    if (/^\d+$/.test(t)) return `gid://shopify/Product/${t}`;
    return t;
  }
  return null;
}

function variantGidFromAjaxId(id: unknown): string | null {
  if (typeof id === 'number' && Number.isFinite(id)) {
    return `gid://shopify/ProductVariant/${Math.trunc(id)}`;
  }
  if (typeof id === 'string' && id.trim()) {
    const t = id.trim();
    if (t.includes('/ProductVariant/')) return t;
    if (/^\d+$/.test(t)) return `gid://shopify/ProductVariant/${t}`;
    return t;
  }
  return null;
}

function priceMoneyFromAjaxMinor(minor: unknown): {amount: string; currencyCode: 'PLN'} | null {
  let cents: number;
  if (typeof minor === 'number' && Number.isFinite(minor)) cents = Math.trunc(minor);
  else if (typeof minor === 'string' && minor.trim()) {
    const parsed = Number(minor);
    if (!Number.isFinite(parsed)) return null;
    cents = Math.trunc(parsed);
  } else return null;
  const major = cents / 100;
  return {amount: major.toFixed(2), currencyCode: 'PLN'};
}

type AjaxOption = {name?: unknown; position?: unknown};

function selectedOptionsFromAjaxVariant(
  variant: Record<string, unknown>,
  productOptions: AjaxOption[],
): Array<{name: string; value: string}> {
  const optionValues = [variant.option1, variant.option2, variant.option3];
  const out: Array<{name: string; value: string}> = [];
  for (let i = 0; i < productOptions.length; i++) {
    const opt = productOptions[i];
    const name = typeof opt?.name === 'string' ? opt.name.trim() : '';
    const rawVal = optionValues[i];
    const value =
      typeof rawVal === 'string'
        ? rawVal.trim()
        : rawVal != null
          ? String(rawVal).trim()
          : '';
    if (name && value) out.push({name, value});
  }
  return out;
}

/** Map Ajax product.js payload to a shape `normalizeProduct` accepts (Storefront-like). */
export function adaptShopAjaxProductJsonForNormalize(
  raw: unknown,
  channel: BuyerChannelId,
  handle: string,
  origin: string,
): Record<string, unknown> | null {
  if (!isRecord(raw)) return null;
  const productGid = productGidFromAjaxId(raw.id);
  if (!productGid) return null;
  const h = typeof raw.handle === 'string' && raw.handle.trim() ? raw.handle.trim() : handle.trim();
  if (!h) return null;

  const productOptions = Array.isArray(raw.options)
    ? raw.options.filter(isRecord)
    : [];
  const variantNodes: Record<string, unknown>[] = [];
  const variants = Array.isArray(raw.variants) ? raw.variants : [];
  for (const v of variants) {
    if (!isRecord(v)) continue;
    const variantGid = variantGidFromAjaxId(v.id);
    if (!variantGid) continue;
    const price = priceMoneyFromAjaxMinor(v.price);
    if (!price) continue;
    const compareAt = priceMoneyFromAjaxMinor(v.compare_at_price);
    let available = false;
    if (typeof v.available === 'boolean') available = v.available;
    else if (typeof v.available_for_sale === 'boolean') available = v.available_for_sale;

    const featured = v.featured_image;
    const image =
      isRecord(featured) && typeof featured.src === 'string'
        ? {url: featured.src, altText: typeof featured.alt === 'string' ? featured.alt : null}
        : null;

    variantNodes.push({
      id: variantGid,
      title: typeof v.title === 'string' ? v.title : typeof v.name === 'string' ? v.name : '',
      sku: typeof v.sku === 'string' ? v.sku : null,
      available,
      availableForSale: available,
      price,
      compareAtPrice: compareAt,
      selectedOptions: selectedOptionsFromAjaxVariant(v, productOptions),
      image,
      weight: typeof v.weight === 'number' ? v.weight : null,
      weightUnit: typeof v.weight_unit === 'string' ? v.weight_unit : null,
    });
  }
  if (!variantNodes.length) return null;

  const featured = raw.featured_image;
  const productImage =
    isRecord(featured) && typeof featured.src === 'string'
      ? {url: featured.src, altText: typeof featured.alt === 'string' ? featured.alt : null}
      : null;

  const productType =
    typeof raw.type === 'string' && raw.type.trim()
      ? raw.type.trim()
      : typeof raw.product_type === 'string' && raw.product_type.trim()
        ? raw.product_type.trim()
        : null;

  const onlineStoreUrl = `${origin.replace(/\/$/, '')}/products/${encodeURIComponent(h)}`;

  return {
    id: productGid,
    handle: h,
    title: typeof raw.title === 'string' ? raw.title : '',
    vendor: typeof raw.vendor === 'string' ? raw.vendor : '',
    product_type: productType,
    description: typeof raw.description === 'string' ? raw.description : '',
    body_html: typeof raw.body_html === 'string' ? raw.body_html : undefined,
    onlineStoreUrl,
    featuredImage: productImage,
    variants: {nodes: variantNodes},
  };
}

export function productFactsFromShopAjaxJson(
  raw: unknown,
  channel: BuyerChannelId,
  handle: string,
  origin: string,
  urlChannel?: BuyerChannelId,
): ProductFacts | null {
  const adapted = adaptShopAjaxProductJsonForNormalize(raw, channel, handle, origin);
  if (!adapted) return null;
  const normalizeChannel = urlChannel && urlChannel !== channel ? urlChannel : channel;
  const facts = normalizeProduct(adapted, {
    channel: normalizeChannel,
    fetchedAt: new Date().toISOString(),
  });
  return facts;
}

export async function fetchShopAjaxProductJson(
  channel: BuyerChannelId,
  handle: string,
): Promise<unknown | null> {
  const h = handle.trim();
  if (!h) return null;
  const origin = storefrontOriginForChannel(channel);
  const url = `${origin.replace(/\/$/, '')}/products/${encodeURIComponent(h)}.js`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'epir-chat-worker/gemma-catalog-ajax-product',
      },
    });
    if (res.status === 404) {
      console.log(
        JSON.stringify({
          tag: 'facts.shop_product_js',
          channel,
          handle: h,
          ok: false,
          http_status: 404,
        }),
      );
      return null;
    }
    if (!res.ok) {
      console.log(
        JSON.stringify({
          tag: 'facts.shop_product_js',
          channel,
          handle: h,
          ok: false,
          http_status: res.status,
        }),
      );
      return null;
    }
    const json: unknown = await res.json();
    console.log(
      JSON.stringify({
        tag: 'facts.shop_product_js',
        channel,
        handle: h,
        ok: true,
        variant_count: isRecord(json) && Array.isArray(json.variants) ? json.variants.length : 0,
      }),
    );
    return json;
  } catch (err) {
    console.warn(
      JSON.stringify({
        tag: 'facts.shop_product_js_error',
        channel,
        handle: h,
        reason: err instanceof Error ? err.message.slice(0, 120) : 'error',
      }),
    );
    return null;
  }
}

export async function fetchProductFactsFromShopAjax(
  channel: BuyerChannelId,
  handle: string,
  urlChannel?: BuyerChannelId,
): Promise<ProductFacts | null> {
  const json = await fetchShopAjaxProductJson(channel, handle);
  if (!json) return null;
  const origin = storefrontOriginForChannel(urlChannel ?? channel);
  return productFactsFromShopAjaxJson(json, channel, handle, origin, urlChannel);
}
