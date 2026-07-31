/**
 * Buduje kanoniczny URL storefrontu Zareczyny.
 * getSeoMeta wymaga jawnego `url` z subdomeną zareczyny.epirbizuteria.pl
 * (nie domeną główną Shopify epirbizuteria.pl).
 */
export function canonicalUrlFromRequest(
  request: Request,
  env: {PUBLIC_STOREFRONT_URL?: string},
): string {
  const requestUrl = new URL(request.url);
  const configured = env.PUBLIC_STOREFRONT_URL?.trim();
  const origin = configured
    ? new URL(configured.endsWith('/') ? configured : `${configured}/`).origin
    : requestUrl.origin;
  return `${origin}${requestUrl.pathname}${requestUrl.search}`;
}
