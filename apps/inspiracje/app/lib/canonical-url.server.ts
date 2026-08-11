export function canonicalUrlFromRequest(
  request: Request,
  publicStorefrontUrl?: string,
): string {
  const path = new URL(request.url).pathname;
  const base = (publicStorefrontUrl || '').replace(/\/$/, '');
  if (base) return `${base}${path === '/' ? '' : path}` || base;
  return new URL(request.url).toString().split('?')[0];
}
