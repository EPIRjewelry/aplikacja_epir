import {stoneProfileToAdditionalProperty} from './stone-profile';

export type MoneyV2 = {amount: string; currencyCode: string};

export type StoneProfileReference = {
  fields?: Array<{key?: string | null; value?: string | null} | null> | null;
};

export type ProductMetafieldRef = {
  reference?: StoneProfileReference | null;
} | null;

export type ProductSeoSource = {
  title: string;
  description?: string | null;
  vendor?: string | null;
  productType?: string | null;
  featuredImage?: {
    url: string;
    altText?: string | null;
    width?: number | null;
    height?: number | null;
  } | null;
  priceRange?: {
    minVariantPrice: MoneyV2;
  } | null;
  stoneProfile?: ProductMetafieldRef;
  glownyKamien?: ProductMetafieldRef;
};

function resolveStoneProfileFields(
  product: ProductSeoSource,
): Array<{key?: string | null; value?: string | null}> {
  const ref =
    product.stoneProfile?.reference ?? product.glownyKamien?.reference ?? null;
  const fields = ref?.fields;
  if (!Array.isArray(fields)) return [];
  return fields.filter(
    (f): f is {key?: string | null; value?: string | null} => f != null,
  );
}

export function buildProductJsonLd(params: {
  product: ProductSeoSource;
  canonicalUrl: string;
  availableForSale?: boolean | null;
  offerPrice?: MoneyV2 | null;
}) {
  const {product, canonicalUrl, availableForSale, offerPrice} = params;
  const image = product.featuredImage;
  const price = offerPrice ?? product.priceRange?.minVariantPrice;
  const additionalProperty = stoneProfileToAdditionalProperty(
    resolveStoneProfileFields(product),
  );

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: product.description ?? undefined,
    image: image?.url,
    brand: product.vendor
      ? {'@type': 'Brand' as const, name: product.vendor}
      : undefined,
    category: product.productType || undefined,
    offers: price
      ? {
          '@type': 'Offer' as const,
          priceCurrency: price.currencyCode,
          price: price.amount,
          availability:
            availableForSale === false
              ? 'https://schema.org/OutOfStock'
              : 'https://schema.org/InStock',
          url: canonicalUrl,
        }
      : undefined,
    ...(additionalProperty.length > 0 ? {additionalProperty} : {}),
  };
}
