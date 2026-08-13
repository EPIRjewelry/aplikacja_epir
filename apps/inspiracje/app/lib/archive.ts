import archiveData from '../data/archive-inspirations.json';

export type ArchiveImage = {
  url: string;
  altText: string | null;
  width: number | null;
  height: number | null;
};

export type ArchiveItem = {
  id: string;
  handle: string;
  title: string;
  status?: string;
  productType?: string;
  vendor?: string;
  tags?: string[];
  descriptionHtml: string;
  publishedAt?: string | null;
  updatedAt?: string | null;
  featuredImage: ArchiveImage | null;
  images: ArchiveImage[];
  metafields?: Record<string, string>;
};

export type ArchiveSnapshot = {
  exportedAt: string | null;
  shop: string;
  source: {type: string; query?: string; handle?: string; title?: string};
  count: number;
  ctaUrl: string;
  ctaLabel: string;
  items: ArchiveItem[];
};

export const DEFAULT_CTA_URL =
  'https://epirbizuteria.pl/pages/zaprojektuj-swoj-model';
export const DEFAULT_CTA_LABEL = 'Zaprojektuj swój model';
export const DEFAULT_MAIN_SHOP_URL = 'https://epirbizuteria.pl';

/** Karty na stronę galerii (SSR). */
export const PAGE_SIZE = 24;

/** Domyślna szerokość miniatury karty (CDN Shopify). */
export const CARD_IMAGE_WIDTH = 800;

export type ArchiveCardItem = {
  id: string;
  handle: string;
  title: string;
  productType?: string;
  featuredImage: ArchiveImage | null;
  excerpt: string;
};

export type PaginatedArchive = {
  pageItems: ArchiveItem[];
  page: number;
  totalPages: number;
  total: number;
};

export function getArchiveSnapshot(): ArchiveSnapshot {
  const data = archiveData as ArchiveSnapshot;
  return {
    ...data,
    ctaUrl: data.ctaUrl || DEFAULT_CTA_URL,
    ctaLabel: data.ctaLabel || DEFAULT_CTA_LABEL,
    items: Array.isArray(data.items) ? data.items : [],
    count: Array.isArray(data.items) ? data.items.length : data.count || 0,
  };
}

export function getArchiveItem(handle: string): ArchiveItem | undefined {
  const needle = handle.trim().toLowerCase();
  return getArchiveSnapshot().items.find(
    (item) => item.handle.toLowerCase() === needle,
  );
}

export function plainTextFromHtml(html: string, maxLen = 160): string {
  const text = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1).trim()}…`;
}

/**
 * Dopina `width` do URL CDN Shopify (cdn.shopify.com … ?v=… → &width=N).
 * Nie-Shopify URL zwraca bez zmian.
 */
export function shopifyCdnWidth(url: string, width = CARD_IMAGE_WIDTH): string {
  const raw = String(url || '').trim();
  if (!raw) return raw;
  if (!/cdn\.shopify\.com/i.test(raw)) return raw;
  try {
    const u = new URL(raw);
    u.searchParams.set('width', String(Math.max(1, Math.round(width))));
    return u.toString();
  } catch {
    return raw;
  }
}

export function toArchiveCard(item: ArchiveItem): ArchiveCardItem {
  const featured = item.featuredImage || item.images?.[0] || null;
  return {
    id: item.id,
    handle: item.handle,
    title: item.title,
    productType: item.productType || undefined,
    featuredImage: featured
      ? {
          ...featured,
          url: shopifyCdnWidth(featured.url, CARD_IMAGE_WIDTH),
        }
      : null,
    excerpt: plainTextFromHtml(item.descriptionHtml, 110),
  };
}

export function paginateArchiveItems(
  items: ArchiveItem[],
  page: number,
  pageSize = PAGE_SIZE,
): PaginatedArchive {
  const total = Array.isArray(items) ? items.length : 0;
  const size = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(total / size) || 1);
  const requested = Number.isFinite(page) ? Math.trunc(page) : 1;
  const safePage = Math.min(Math.max(1, requested || 1), totalPages);
  const start = (safePage - 1) * size;
  return {
    pageItems: total === 0 ? [] : items.slice(start, start + size),
    page: safePage,
    totalPages,
    total,
  };
}

/** Parsuje `?page=` z URL; nieprawidłowe → 1. */
export function parsePageParam(requestUrl: string): number {
  try {
    const raw = new URL(requestUrl).searchParams.get('page');
    if (raw == null || raw === '') return 1;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1) return 1;
    return n;
  } catch {
    return 1;
  }
}

export function resolveCtaUrl(envCta?: string): string {
  const fromEnv = (envCta || '').trim();
  return fromEnv || getArchiveSnapshot().ctaUrl || DEFAULT_CTA_URL;
}

export function resolveMainShopUrl(envUrl?: string): string {
  const fromEnv = (envUrl || '').trim();
  return fromEnv || DEFAULT_MAIN_SHOP_URL;
}
