/** Shopify CDN hi-res variant for PDP zoom (image governance 2048×2048). */
export function shopifyImage2048(url: string): string {
  if (!url) return url;
  try {
    const u = new URL(url);
    u.searchParams.set('width', '2048');
    return u.toString();
  } catch {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}width=2048`;
  }
}
