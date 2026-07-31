import type {Env} from '../config/bindings';
import {
  fetchKazkaCollectionProductsByHandle,
  fetchKazkaProductByHandle,
  type KazkaHydrateProduct,
} from '../graphql';
import {resolveStorefrontConfig} from '../config/storefronts';

export const KAZKA_HEADLESS_CHANNELS = new Set(['hydrogen-kazka', 'kazka_headless']);

export function isKazkaHeadlessChannel(channel?: string, storefrontId?: string): boolean {
  if (storefrontId === 'kazka') return true;
  if (!channel) return false;
  return KAZKA_HEADLESS_CHANNELS.has(channel);
}

function formatPrice(amount?: string | null, currencyCode?: string | null): string | null {
  if (!amount) return null;
  const code = currencyCode?.trim() || 'PLN';
  if (code === 'PLN') return `${amount} zł`;
  return `${amount} ${code}`;
}

function formatProductLine(product: KazkaHydrateProduct, index?: number): string {
  const prefix = typeof index === 'number' ? `${index + 1}. ` : '- ';
  const variant = product.variants?.nodes?.find((v) => v.availableForSale) ?? product.variants?.nodes?.[0];
  const price =
    formatPrice(variant?.price?.amount, variant?.price?.currencyCode) ??
    formatPrice(
      product.priceRange?.minVariantPrice?.amount,
      product.priceRange?.minVariantPrice?.currencyCode,
    );
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

export async function buildKazkaHeadlessStorefrontContext(
  env: Env,
  input: KazkaHydrateInput,
): Promise<string | null> {
  const sfConfig = resolveStorefrontConfig(env, 'kazka');
  const token = sfConfig?.apiToken?.trim();
  const shopDomain = env.SHOP_DOMAIN?.trim();
  if (!token || !shopDomain) {
    console.warn('[kazka-hydrate] missing token or SHOP_DOMAIN');
    return null;
  }

  const sections: string[] = [
    '[KONTEKST KANAŁU KAZKA — runtime Storefront API, bez RAG]',
    'Poniższe dane pochodzą ze sklepu Kazka Jewelry (aktualny drop). Korzystaj z nich przed ogólnym wyszukiwaniem katalogu.',
  ];

  if (input.productHandle) {
    try {
      const data = await fetchKazkaProductByHandle(shopDomain, token, input.productHandle);
      if (data.product) {
        sections.push(formatKazkaProductContext(data.product));
      } else {
        sections.push(`(Nie znaleziono produktu o handle: ${input.productHandle} na kanale Kazka.)`);
      }
    } catch (error) {
      console.warn('[kazka-hydrate] product fetch failed:', error);
    }
  } else if (input.collectionHandle) {
    try {
      const limit = input.collectionProductLimit ?? 16;
      const data = await fetchKazkaCollectionProductsByHandle(
        shopDomain,
        token,
        input.collectionHandle,
        limit,
      );
      const collection = data.collection;
      if (collection) {
        sections.push(
          formatKazkaCollectionContext(collection, collection.products?.nodes ?? []),
        );
      } else {
        sections.push(
          `(Nie znaleziono kolekcji o handle: ${input.collectionHandle} na kanale Kazka.)`,
        );
      }
    } catch (error) {
      console.warn('[kazka-hydrate] collection fetch failed:', error);
    }
  } else {
    return null;
  }

  return sections.length > 2 ? sections.join('\n\n') : null;
}
