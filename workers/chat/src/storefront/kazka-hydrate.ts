import type {Env} from '../config/bindings';
import {
  fetchKazkaCollectionProductsByHandle,
  fetchKazkaCollectionProductsByHandleAdmin,
  fetchKazkaProductByHandle,
  fetchKazkaProductByHandleAdmin,
  type KazkaHydrateProduct,
} from '../graphql';
import {resolveStorefrontConfig} from '../config/storefronts';
import {formatPlnMajorForDisplay} from '../mcp/catalog-price-enrich';

export const KAZKA_HEADLESS_CHANNELS = new Set(['hydrogen-kazka', 'kazka_headless']);

export function isKazkaHeadlessChannel(channel?: string, storefrontId?: string): boolean {
  if (storefrontId === 'kazka') return true;
  if (!channel) return false;
  return KAZKA_HEADLESS_CHANNELS.has(channel);
}

function formatPrice(amount?: string | null, currencyCode?: string | null): string | null {
  if (!amount) return null;
  const code = currencyCode?.trim() || 'PLN';
  if (code === 'PLN') {
    const major = Number(amount.replace(/\s/g, '').replace(',', '.'));
    if (Number.isFinite(major) && major > 0) return formatPlnMajorForDisplay(major) || null;
  }
  return `${amount} ${code}`;
}

function plnMajor(amount?: string | null, currencyCode?: string | null): number | null {
  const code = (currencyCode ?? 'PLN').trim().toUpperCase();
  if (code !== 'PLN' || !amount) return null;
  const major = Number(amount.replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(major) || major <= 0) return null;
  return major;
}

function samePriceScale(candidate: number, anchor: number): boolean {
  if (candidate <= 0 || anchor <= 0) return false;
  const ratio = candidate / anchor;
  return ratio >= 0.25 && ratio <= 4;
}

/**
 * Cena na liście to minimum karty (priceRange albo najtańszy wariant PLN).
 * Pierwszy dostępny wariant nie jest ceną „od”.
 */
export function kazkaListedPriceLabel(product: KazkaHydrateProduct): string | null {
  const nodes = product.variants?.nodes ?? [];
  const available = nodes.filter((variant) => variant.availableForSale !== false);
  const pool = available.length ? available : nodes;
  const variantAmounts = pool
    .map((variant) => plnMajor(variant.price?.amount, variant.price?.currencyCode))
    .filter((amount): amount is number => amount !== null);
  const anchor = variantAmounts.length ? Math.min(...variantAmounts) : null;
  const amounts = [...variantAmounts];
  const rangeMin = plnMajor(
    product.priceRange?.minVariantPrice?.amount,
    product.priceRange?.minVariantPrice?.currencyCode,
  );
  const rangeMax = plnMajor(
    product.priceRange?.maxVariantPrice?.amount,
    product.priceRange?.maxVariantPrice?.currencyCode,
  );
  for (const edge of [rangeMin, rangeMax]) {
    if (edge === null) continue;
    if (anchor === null || samePriceScale(edge, anchor)) amounts.push(edge);
  }
  if (!amounts.length) return null;
  const min = Math.min(...amounts);
  const max = Math.max(...amounts);
  const label = formatPlnMajorForDisplay(min);
  if (!label) return null;
  return max - min > 0.009 ? `od ${label}` : label;
}

function formatProductLine(product: KazkaHydrateProduct, index?: number): string {
  const prefix = typeof index === 'number' ? `${index + 1}. ` : '- ';
  const variant = product.variants?.nodes?.find((v) => v.availableForSale) ?? product.variants?.nodes?.[0];
  const price = kazkaListedPriceLabel(product);
  const availability = variant?.availableForSale ?? product.availableForSale;
  const parts = [`${prefix}${product.title} (handle: ${product.handle})`];
  if (price) parts.push(`cena: ${price}`);
  if (availability !== undefined) parts.push(availability ? 'dostępny' : 'niedostępny');
  if (product.productType) parts.push(`typ: ${product.productType}`);
  if (product.tags?.length) parts.push(`tagi: ${product.tags.join(', ')}`);
  return parts.join(' | ');
}

export function formatKazkaProductContext(product: KazkaHydrateProduct): string {
  const lines: string[] = [
    'Aktualnie oglądany produkt (Storefront API Kazka — traktuj jako prawdę o tym produkcie):',
    formatProductLine(product),
  ];
  if (product.description?.trim()) {
    lines.push(`Opis: ${product.description.trim().slice(0, 600)}`);
  }
  const options = product.options?.filter((o) => o.values?.length) ?? [];
  if (options.length) {
    lines.push(
      `Opcje: ${options.map((o) => `${o.name}: ${o.values.join(', ')}`).join('; ')}`,
    );
  }
  const variants = product.variants?.nodes ?? [];
  if (variants.length > 1) {
    lines.push(
      'Warianty:',
      ...variants.slice(0, 8).map((v) => {
        const price = formatPrice(v.price?.amount, v.price?.currencyCode);
        return `  - ${v.title}${price ? `, ${price}` : ''}${v.availableForSale ? '' : ' (niedostępny)'}`;
      }),
    );
  }
  return lines.join('\n');
}

export function formatKazkaCollectionContext(
  collection: {handle: string; title: string; description?: string | null},
  products: KazkaHydrateProduct[],
): string {
  const lines: string[] = [
    `Kontekst kolekcji „${collection.title}” (handle: ${collection.handle}) — produkty widoczne na kanale Kazka:`,
    'Cena przy pozycji to minimum karty. Gdy jest „od”, nie podawaj droższego wariantu jako ceny początkowej.',
  ];
  if (collection.description?.trim()) {
    lines.push(collection.description.trim().slice(0, 400));
  }
  if (!products.length) {
    lines.push('(Brak produktów w tej kolekcji na kanale Kazka.)');
    return lines.join('\n');
  }
  lines.push(...products.map((p, i) => formatProductLine(p, i)));
  return lines.join('\n');
}

export type KazkaHydrateInput = {
  productHandle?: string;
  collectionHandle?: string;
  collectionProductLimit?: number;
};

async function fetchKazkaCollectionHydrateData(
  env: Env,
  shopDomain: string,
  storefrontToken: string | undefined,
  collectionHandle: string,
  limit: number,
): Promise<{collection?: {handle: string; title: string; description?: string | null}; products: KazkaHydrateProduct[]} | null> {
  if (storefrontToken) {
    try {
      const data = await fetchKazkaCollectionProductsByHandle(
        shopDomain,
        storefrontToken,
        collectionHandle,
        limit,
      );
      const collection = data.collection;
      const products = collection?.products?.nodes ?? [];
      if (collection && products.length > 0) {
        return {collection, products};
      }
    } catch (error) {
      console.warn('[kazka-hydrate] storefront collection fetch failed:', error);
    }
  }

  const adminToken = env.SHOPIFY_ADMIN_TOKEN?.trim();
  if (!adminToken) return null;

  try {
    const data = await fetchKazkaCollectionProductsByHandleAdmin(
      shopDomain,
      adminToken,
      collectionHandle,
      limit,
    );
    const collection = data.collection;
    if (!collection) return null;
    return {
      collection,
      products: collection.products?.nodes ?? [],
    };
  } catch (error) {
    console.warn('[kazka-hydrate] admin collection fetch failed:', error);
    return null;
  }
}

async function fetchKazkaProductHydrateData(
  env: Env,
  shopDomain: string,
  storefrontToken: string | undefined,
  productHandle: string,
): Promise<KazkaHydrateProduct | null> {
  if (storefrontToken) {
    try {
      const data = await fetchKazkaProductByHandle(shopDomain, storefrontToken, productHandle);
      if (data.product) return data.product;
    } catch (error) {
      console.warn('[kazka-hydrate] storefront product fetch failed:', error);
    }
  }

  const adminToken = env.SHOPIFY_ADMIN_TOKEN?.trim();
  if (!adminToken) return null;

  try {
    const data = await fetchKazkaProductByHandleAdmin(shopDomain, adminToken, productHandle);
    return data.product ?? null;
  } catch (error) {
    console.warn('[kazka-hydrate] admin product fetch failed:', error);
    return null;
  }
}

export async function buildKazkaHeadlessStorefrontContext(
  env: Env,
  input: KazkaHydrateInput,
): Promise<string | null> {
  const sfConfig = resolveStorefrontConfig(env, 'kazka');
  const storefrontToken = sfConfig?.apiToken?.trim();
  const shopDomain = env.SHOP_DOMAIN?.trim();
  if (!shopDomain) {
    console.warn('[kazka-hydrate] missing SHOP_DOMAIN');
    return null;
  }
  if (!storefrontToken && !env.SHOPIFY_ADMIN_TOKEN?.trim()) {
    console.warn('[kazka-hydrate] missing Storefront token and SHOPIFY_ADMIN_TOKEN');
    return null;
  }

  const sections: string[] = [
    '[KONTEKST KANAŁU KAZKA — runtime Storefront API, bez RAG]',
    'Poniższe dane pochodzą z katalogu sklepu Kazka Jewelry. Korzystaj z nich przed ogólnym wyszukiwaniem katalogu.',
  ];

  if (input.productHandle) {
    const product = await fetchKazkaProductHydrateData(
      env,
      shopDomain,
      storefrontToken,
      input.productHandle,
    );
    if (product) {
      sections.push(formatKazkaProductContext(product));
    } else {
      sections.push(`(Nie znaleziono produktu o handle: ${input.productHandle} na kanale Kazka.)`);
    }
  } else if (input.collectionHandle) {
    const limit = input.collectionProductLimit ?? 16;
    const data = await fetchKazkaCollectionHydrateData(
      env,
      shopDomain,
      storefrontToken,
      input.collectionHandle,
      limit,
    );
    if (data?.collection) {
      sections.push(formatKazkaCollectionContext(data.collection, data.products));
    } else {
      sections.push(
        `(Nie znaleziono kolekcji o handle: ${input.collectionHandle} na kanale Kazka.)`,
      );
    }
  } else {
    return null;
  }

  return sections.length > 2 ? sections.join('\n\n') : null;
}
