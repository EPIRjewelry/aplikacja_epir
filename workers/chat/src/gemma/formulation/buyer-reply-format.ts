/** Linia katalogu dla klienta — bez wewnętrznych znaczników gN:. */
export function formatBuyerCatalogLine(p: {
  title: string;
  url: string;
  priceDisplay: string;
}): string {
  const title = p.title.trim();
  const url = p.url.trim();
  const price = p.priceDisplay.trim();
  if (title && url) {
    return price ? `${title} — ${url} (${price})` : `${title} — ${url}`;
  }
  if (url) return price ? `${url} (${price})` : url;
  return price;
}

/** Siatka bezpieczeństwa: wyciek surowych linii „g1: https…”. */
export function hasInternalRefMarkerLeak(text: string): boolean {
  return /\bg\d+:\s*(https?:\/|\/products\/)/i.test(text);
}
