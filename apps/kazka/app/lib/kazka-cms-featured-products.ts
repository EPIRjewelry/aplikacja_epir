import {hoverMedia, type RouteContentProps} from '@epir/ui';

type ProductMediaNode = {
  mediaContentType?: string | null;
  __typename?: string | null;
  image?: {url?: string | null; altText?: string | null} | null;
  sources?: Array<{
    url?: string | null;
    mimeType?: string | null;
    format?: string | null;
  }> | null;
};

type ProductNode = {
  id?: string;
  title?: string;
  handle?: string;
  variants?: {
    nodes?: Array<{
      image?: {url?: string | null; altText?: string | null} | null;
    }>;
  };
  media?: {nodes?: ProductMediaNode[]};
  priceRange?: {
    minVariantPrice?: {amount?: string; currencyCode?: string} | null;
  };
};

type FeaturedProductsSectionNode = {
  type?: string;
  id?: string;
  heading?: {value?: string};
  body?: {value?: string};
  products?: {
    references?: {nodes?: ProductNode[]};
    nodes?: ProductNode[];
  };
  with_product_prices?: {value?: string};
  withProductPrices?: {value?: string};
};

export type CmsFeaturedProductTile = {
  id: string;
  handle: string;
  title: string;
  imageUrl?: string;
  imageAlt: string;
  hover: ReturnType<typeof hoverMedia>;
  priceLabel?: string;
};

export type CmsFeaturedProductsSection = {
  id: string;
  heading?: string;
  body?: string;
  showPrices: boolean;
  products: CmsFeaturedProductTile[];
};

/** @deprecated Prefer CmsFeaturedProductsSection */
export type CmsFeaturedProducts = Omit<CmsFeaturedProductsSection, 'id'>;

function featuredSectionNodes(
  route: RouteContentProps['route'],
): FeaturedProductsSectionNode[] {
  const field = route?.featured_products;
  const nodes = (field?.references?.nodes ??
    field?.nodes ??
    []) as FeaturedProductsSectionNode[];
  return nodes.filter((node) => node.type === 'section_featured_products');
}

function formatMoneyPl(
  money: {amount?: string; currencyCode?: string} | null | undefined,
): string | undefined {
  if (!money?.amount || !money.currencyCode) return undefined;
  const amount = Number(money.amount);
  if (!Number.isFinite(amount)) return undefined;
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency: money.currencyCode,
    maximumFractionDigits: 0,
  }).format(amount);
}

function primaryImage(product: ProductNode): {
  url?: string;
  alt: string;
} {
  const variantImage = product.variants?.nodes?.[0]?.image;
  const mediaImage = product.media?.nodes?.find((node) => node.image?.url)
    ?.image;
  const url = variantImage?.url ?? mediaImage?.url ?? undefined;
  const alt = variantImage?.altText ?? product.title ?? '';
  return {url: url ?? undefined, alt};
}

function parseProduct(product: ProductNode): CmsFeaturedProductTile | null {
  if (!product.handle || !product.title) return null;
  const image = primaryImage(product);
  return {
    id: product.id ?? product.handle,
    handle: product.handle,
    title: product.title,
    imageUrl: image.url,
    imageAlt: image.alt || product.title,
    hover: hoverMedia(product.media?.nodes),
    priceLabel: formatMoneyPl(product.priceRange?.minVariantPrice),
  };
}

function parseSection(
  section: FeaturedProductsSectionNode,
): CmsFeaturedProductsSection | null {
  const raw =
    section.products?.references?.nodes ?? section.products?.nodes ?? [];
  const products = raw
    .map(parseProduct)
    .filter((tile): tile is CmsFeaturedProductTile => tile != null);

  if (products.length === 0) return null;

  const priceField = section.withProductPrices ?? section.with_product_prices;
  const showPrices =
    priceField?.value === 'true' || priceField?.value === '1';

  return {
    id: section.id ?? 'featured-products',
    heading: section.heading?.value?.trim() || undefined,
    body: section.body?.value?.trim() || undefined,
    showPrices,
    products,
  };
}

/**
 * Sekcje featured products z pola `featured_products` metaobiektu route (CMS).
 * Pusta lista = brak renderu (bez błędu).
 */
export function parseCmsFeaturedProductsSections(
  route: RouteContentProps['route'],
): CmsFeaturedProductsSection[] {
  return featuredSectionNodes(route)
    .map(parseSection)
    .filter((section): section is CmsFeaturedProductsSection => section != null);
}

/** Pierwsza sekcja albo null — kompatybilność wsteczna. */
export function parseCmsFeaturedProducts(
  route: RouteContentProps['route'],
): CmsFeaturedProductsSection | null {
  return parseCmsFeaturedProductsSections(route)[0] ?? null;
}
