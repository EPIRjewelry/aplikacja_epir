const BLOCK_PREFIXES = [
  '/checkout',
  '/checkouts',
  '/cart',
  '/account',
  '/admin',
  '/apps',
  '/api',
  '/services',
  '/tools',
  '/password',
  '/challenge',
];

const ALLOW_EXACT = new Set(['/']);

const ALLOW_PREFIXES = ['/collections', '/products', '/pages'];

export function shouldTransformPath(pathname: string): boolean {
  const path = pathname === '' ? '/' : pathname.toLowerCase();

  for (const prefix of BLOCK_PREFIXES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) {
      return false;
    }
  }

  if (ALLOW_EXACT.has(path)) return true;

  for (const prefix of ALLOW_PREFIXES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) {
      return true;
    }
  }

  return false;
}

export function shouldTransformRequest(request: Request, url: URL): boolean {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return false;
  return shouldTransformPath(url.pathname);
}
