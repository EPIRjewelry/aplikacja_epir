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

export const DEFAULT_CTA_URL = 'https://epirbizuteria.pl/pages/kontakt';
export const DEFAULT_CTA_LABEL = 'Zaprojektuj swój model';
export const DEFAULT_MAIN_SHOP_URL = 'https://epirbizuteria.pl';

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

export function resolveCtaUrl(envCta?: string): string {
  const fromEnv = (envCta || '').trim();
  return fromEnv || getArchiveSnapshot().ctaUrl || DEFAULT_CTA_URL;
}

export function resolveMainShopUrl(envUrl?: string): string {
  const fromEnv = (envUrl || '').trim();
  return fromEnv || DEFAULT_MAIN_SHOP_URL;
}
