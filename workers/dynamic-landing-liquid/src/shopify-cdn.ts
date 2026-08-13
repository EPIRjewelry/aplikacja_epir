/**
 * Shopify CDN URL helpers for responsive images (width query param).
 * Pattern aligned with apps/inspiracje/app/lib/archive.ts.
 */

export function shopifyCdnWidth(url: string, width: number): string {
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

/** Build srcset pairs: `url1w 768w, url2w 1536w` */
export function shopifyCdnSrcset(url: string, widths: number[]): string {
  return widths
    .map((w) => `${shopifyCdnWidth(url, w)} ${w}w`)
    .join(', ');
}
