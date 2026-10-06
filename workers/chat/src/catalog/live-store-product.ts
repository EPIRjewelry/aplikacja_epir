/**
 * Tylko produkty ACTIVE i opublikowane w Online Store trafiają do Gemmy z linkiem.
 * Admin API bez status:active oddaje drafty; sam handle nie wystarczy do URL.
 */

const PRODUCT_PATH_RE = /\/products\/([^/?#]+)/i;
const GENERIC_LINK_LABEL_RE =
  /^(zobacz(?:\s+produkt)?|sprawd[źz]|tutaj|link|kliknij(?:\s+tutaj)?|wi[eę]cej|see(?:\s+product)?|check(?:\s+it(?:\s+out)?)?|here)$/iu;

const MD_PRODUCT_LINK = /\[([^\]]*)\]\((https?:\/\/[^)\s]*\/products\/[^)\s]+)\)/gi;
const BARE_PRODUCT_URL = /https?:\/\/[^\s)\]>'"]*\/products\/[^\s)\]>'"]+/gi;

export type LiveProductRef = {
  title: string;
  url: string;
  handle: string | null;
};

export function withActiveStatusQuery(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) return 'status:active';
  if (/\bstatus\s*:/i.test(trimmed)) return trimmed;
  return `(${trimmed}) AND status:active`;
}

export function productHandleFromUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url, 'https://catalog.local');
    const match = PRODUCT_PATH_RE.exec(parsed.pathname);
    if (!match?.[1]) return null;
    return decodeURIComponent(match[1]).trim() || null;
  } catch {
    const match = PRODUCT_PATH_RE.exec(url);
    if (!match?.[1]) return null;
    try {
      return decodeURIComponent(match[1]).trim() || null;
    } catch {
      return match[1].trim() || null;
    }
  }
}

export function normalizeProductUrlKey(url: string): string | null {
  const handle = productHandleFromUrl(url);
  return handle ? handle.toLocaleLowerCase('en-US') : null;
}

/** Węzeł Admin/Storefront albo karta po mapowaniu — live = ACTIVE + URL Online Store. */
export function isLivePublishedProduct(node: Record<string, unknown>): boolean {
  const status = typeof node.status === 'string' ? node.status.trim().toUpperCase() : '';
  if (status && status !== 'ACTIVE') return false;
  if (node.publishedOnCurrentPublication === false) return false;

  const online =
    (typeof node.onlineStoreUrl === 'string' && node.onlineStoreUrl.trim()) ||
    (typeof node.url === 'string' && node.url.trim()) ||
    '';
  if (!online || !PRODUCT_PATH_RE.test(online)) return false;
  return true;
}

export function filterLivePublishedProducts(
  products: readonly Record<string, unknown>[],
): Record<string, unknown>[] {
  return products.filter((product) => isLivePublishedProduct(product));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readTitle(product: Record<string, unknown>): string {
  if (typeof product.title === 'string' && product.title.trim()) return product.title.trim();
  if (typeof product.name === 'string' && product.name.trim()) return product.name.trim();
  return '';
}

function readUrl(product: Record<string, unknown>): string {
  if (typeof product.url === 'string' && product.url.trim()) return product.url.trim();
  if (typeof product.onlineStoreUrl === 'string' && product.onlineStoreUrl.trim()) {
    return product.onlineStoreUrl.trim();
  }
  return '';
}

export function liveProductRefsFromSnapshots(snapshots: readonly unknown[]): LiveProductRef[] {
  const out: LiveProductRef[] = [];
  const seen = new Set<string>();

  const visit = (node: unknown, depth: number) => {
    if (depth <= 0 || node == null) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth - 1);
      return;
    }
    if (!isRecord(node)) return;

    const url = readUrl(node);
    const title = readTitle(node);
    const key = normalizeProductUrlKey(url);
    if (key && title && !seen.has(key)) {
      seen.add(key);
      out.push({
        title,
        url,
        handle: typeof node.handle === 'string' && node.handle.trim() ? node.handle.trim() : key,
      });
    }

    if (Array.isArray(node.content)) {
      for (const entry of node.content) {
        if (!isRecord(entry) || typeof entry.text !== 'string') continue;
        const text = entry.text.trim();
        if (!text.startsWith('{') && !text.startsWith('[')) continue;
        try {
          visit(JSON.parse(text), depth - 1);
        } catch {
          /* ignore */
        }
      }
    }
    if (isRecord(node.structuredContent)) visit(node.structuredContent, depth - 1);
    for (const keyName of ['products', 'items', 'results'] as const) {
      if (Array.isArray(node[keyName])) visit(node[keyName], depth - 1);
    }
    if (isRecord(node.catalog)) visit(node.catalog, depth - 1);
    if (isRecord(node.product)) visit(node.product, depth - 1);
  };

  for (const snapshot of snapshots) visit(snapshot, 10);
  return out;
}

function isGenericLinkLabel(label: string): boolean {
  return GENERIC_LINK_LABEL_RE.test(label.trim());
}

/**
 * Zostawia wyłącznie /products/ z kart tej tury.
 * Ogólne etykiety („zobacz produkt”) zamienia na dokładny tytuł karty.
 */
export function guardLiveCatalogProductLinks(
  text: string,
  catalogSnapshots: readonly unknown[],
): {text: string; changed: boolean; removed: string[]} {
  if (!text) return {text, changed: false, removed: []};

  const refs = liveProductRefsFromSnapshots(catalogSnapshots);
  const byHandle = new Map<string, LiveProductRef>();
  for (const ref of refs) {
    const key = normalizeProductUrlKey(ref.url) ?? ref.handle?.toLocaleLowerCase('en-US');
    if (key) byHandle.set(key, ref);
  }

  const removed: string[] = [];
  let changed = false;

  const withMarkdown = text.replace(MD_PRODUCT_LINK, (full, label: string, url: string) => {
    const key = normalizeProductUrlKey(url);
    if (!key) {
      removed.push(url);
      changed = true;
      return label.trim() || '';
    }
    const ref = byHandle.get(key);
    if (!ref) {
      removed.push(url);
      changed = true;
      return label.trim() || '';
    }
    const nextLabel = isGenericLinkLabel(label) || !label.trim() ? ref.title : label.trim();
    const next = `[${nextLabel}](${ref.url})`;
    if (next !== full) changed = true;
    return next;
  });

  const withBare = withMarkdown.replace(BARE_PRODUCT_URL, (url) => {
    const trimmed = url.replace(/[.,;:]+$/g, '');
    const suffix = url.slice(trimmed.length);
    const key = normalizeProductUrlKey(trimmed);
    if (!key) {
      removed.push(trimmed);
      changed = true;
      return suffix;
    }
    const ref = byHandle.get(key);
    if (!ref) {
      removed.push(trimmed);
      changed = true;
      return suffix;
    }
    return `${ref.url}${suffix}`;
  });

  return {text: withBare, changed: changed || removed.length > 0, removed};
}
