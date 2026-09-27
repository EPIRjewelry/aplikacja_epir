/**
 * Meta Conversions API — Purchase from Shopify orders/create (Kazka scope).
 * Browser Purchase: apps/kazka/custom-pixels/meta-purchase.pixel.js (same event_id for dedup).
 */

export const META_KAZKA_PIXEL_ID = '1320796521913985';

/** Must match @epir/utils `EPIR_STOREFRONT_CART_ATTR_KEY` and Hydrogen cart attribute. */
export const EPIR_STOREFRONT_CART_ATTR_KEY = '_epir_storefront';

const GRAPH_API_VERSION = 'v21.0';

export type MetaCapiEnv = {
  META_CAPI_ACCESS_TOKEN?: string;
  /** Optional — resolve product handle when webhook line_items omit it */
  SHOPIFY_ADMIN_TOKEN?: string;
  SHOP_DOMAIN?: string;
  META_CAPI_TEST_EVENT_CODE?: string;
};

export type MetaCapiPurchaseInput = {
  orderGid: string;
  orderNumericId: string;
  contentIds: string[];
  value: number;
  currency: string;
  eventTimeSec: number;
  email?: string | null;
  phone?: string | null;
  clientIpAddress?: string | null;
  clientUserAgent?: string | null;
  fbc?: string | null;
  fbp?: string | null;
};

type EpirStorefrontCartValue = 'kazka' | 'zareczyny';

function readAttrListFromOrder(
  order: Record<string, unknown>,
): Array<{key?: string; name?: string; value?: unknown}> {
  const lists = [
    order.note_attributes,
    order.noteAttributes,
    order.custom_attributes,
    order.customAttributes,
  ];
  for (const raw of lists) {
    if (Array.isArray(raw)) return raw as Array<{key?: string; name?: string; value?: unknown}>;
  }
  return [];
}

export function readEpirStorefrontFromOrder(
  order: Record<string, unknown>,
): EpirStorefrontCartValue | null {
  for (const item of readAttrListFromOrder(order)) {
    const key = String(item.key ?? item.name ?? '');
    if (key !== EPIR_STOREFRONT_CART_ATTR_KEY) continue;
    const v = String(item.value ?? '').trim();
    if (v === 'kazka' || v === 'zareczyny') return v;
  }
  return null;
}

export function purchaseEventId(orderNumericId: string): string {
  const id = orderNumericId.trim();
  return id ? `purchase_${id}` : `purchase_unknown`;
}

/** Kazka Hydrogen — primary: cart `_epir_storefront`; fallback for legacy carts. */
export function isLikelyKazkaOrder(order: Record<string, unknown>): boolean {
  const storefront = readEpirStorefrontFromOrder(order);
  if (storefront === 'kazka') return true;
  if (storefront === 'zareczyny') return false;
  return isLikelyKazkaOrderFallback(order);
}

function isLikelyKazkaOrderFallback(order: Record<string, unknown>): boolean {
  const urls = [
    order.landing_site,
    order.referring_site,
    order.source_url,
    order.browser_ip,
  ];
  for (const u of urls) {
    if (typeof u === 'string' && u.toLowerCase().includes('kazka')) return true;
  }
  const tags = order.tags;
  if (typeof tags === 'string' && tags.toLowerCase().includes('kazka')) return true;
  if (Array.isArray(tags) && tags.some((t) => String(t).toLowerCase().includes('kazka'))) {
    return true;
  }
  const lines = order.line_items ?? order.lineItems;
  if (Array.isArray(lines)) {
    for (const line of lines) {
      if (!line || typeof line !== 'object') continue;
      const l = line as Record<string, unknown>;
      const vendor = String(l.vendor ?? '').toLowerCase();
      if (vendor.includes('kazka')) return true;
      const props = l.properties;
      if (Array.isArray(props)) {
        for (const p of props) {
          if (!p || typeof p !== 'object') continue;
          const pr = p as Record<string, unknown>;
          if (String(pr.value ?? '').toLowerCase().includes('kazka')) return true;
        }
      }
    }
  }
  return false;
}

function parseLineItems(order: Record<string, unknown>): Record<string, unknown>[] {
  const raw = order.line_items ?? order.lineItems;
  return Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
}

/** Prefer Variant SKU (Meta catalog id); fallback handle for legacy payloads. */
function contentIdFromLineItem(line: Record<string, unknown>): string | null {
  const sku = line.sku;
  if (typeof sku === 'string' && sku.trim()) return sku.trim();
  const merchandise = line.merchandise;
  if (merchandise && typeof merchandise === 'object') {
    const m = merchandise as Record<string, unknown>;
    if (typeof m.sku === 'string' && m.sku.trim()) return m.sku.trim();
  }
  const direct = line.handle ?? line.product_handle;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  if (merchandise && typeof merchandise === 'object') {
    const m = merchandise as Record<string, unknown>;
    const product = m.product;
    if (product && typeof product === 'object') {
      const h = (product as Record<string, unknown>).handle;
      if (typeof h === 'string' && h.trim()) return h.trim();
    }
  }
  const url = line.url ?? line.product_url;
  if (typeof url === 'string' && url.includes('/products/')) {
    const m = url.match(/\/products\/([^/?#]+)/i);
    if (m?.[1]) return decodeURIComponent(m[1]);
  }
  return null;
}

export function extractContentIdsFromOrder(order: Record<string, unknown>): string[] {
  const ids: string[] = [];
  for (const line of parseLineItems(order)) {
    const id = contentIdFromLineItem(line);
    if (id) ids.push(id);
  }
  return [...new Set(ids)];
}

export function extractOrderNumericId(order: Record<string, unknown>): string | null {
  const gid = order.admin_graphql_api_id;
  if (typeof gid === 'string' && gid.includes('Order/')) {
    const part = gid.split('/').pop();
    if (part) return part;
  }
  const id = order.id;
  if (typeof id === 'number' && Number.isFinite(id)) return String(id);
  if (typeof id === 'string' && id.trim()) return id.trim();
  return null;
}

export function extractPurchaseTotals(order: Record<string, unknown>): {
  value: number;
  currency: string;
} {
  const currency =
    (typeof order.currency === 'string' && order.currency.trim()) ||
    (typeof order.presentment_currency === 'string' && order.presentment_currency.trim()) ||
    'PLN';
  const raw =
    order.total_price ??
    order.current_total_price ??
    order.subtotal_price ??
    order.total_line_items_price;
  const n = typeof raw === 'string' ? parseFloat(raw) : Number(raw);
  return { value: Number.isFinite(n) ? n : 0, currency };
}

export function extractCustomerPii(order: Record<string, unknown>): {
  email: string | null;
  phone: string | null;
} {
  const customer = order.customer;
  let email: string | null =
    typeof order.email === 'string' && order.email.trim() ? order.email.trim() : null;
  let phone: string | null =
    typeof order.phone === 'string' && order.phone.trim() ? order.phone.trim() : null;
  if (customer && typeof customer === 'object') {
    const c = customer as Record<string, unknown>;
    if (!email && typeof c.email === 'string' && c.email.trim()) email = c.email.trim();
    if (!phone && typeof c.phone === 'string' && c.phone.trim()) phone = c.phone.trim();
  }
  return { email, phone };
}

async function sha256Hex(normalized: string): Promise<string> {
  const data = new TextEncoder().encode(normalized);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashEmail(email: string): Promise<string> {
  return sha256Hex(email.trim().toLowerCase());
}

async function hashPhone(phone: string): Promise<string> {
  const digits = phone.replace(/\D/g, '');
  return sha256Hex(digits);
}

export async function buildMetaCapiUserData(
  input: Pick<MetaCapiPurchaseInput, 'email' | 'phone' | 'clientIpAddress' | 'clientUserAgent' | 'fbc' | 'fbp'>,
): Promise<Record<string, unknown>> {
  const userData: Record<string, unknown> = {};
  if (input.clientIpAddress) userData.client_ip_address = input.clientIpAddress;
  if (input.clientUserAgent) userData.client_user_agent = input.clientUserAgent;
  if (input.fbc) userData.fbc = input.fbc;
  if (input.fbp) userData.fbp = input.fbp;
  if (input.email) userData.em = [await hashEmail(input.email)];
  if (input.phone) userData.ph = [await hashPhone(input.phone)];
  return userData;
}

export async function sendMetaCapiPurchase(
  env: MetaCapiEnv,
  input: MetaCapiPurchaseInput,
): Promise<{ ok: boolean; skipped?: string; status?: number; body?: string }> {
  const token = env.META_CAPI_ACCESS_TOKEN?.trim();
  if (!token) {
    return { ok: true, skipped: 'META_CAPI_ACCESS_TOKEN not configured' };
  }

  const userData = await buildMetaCapiUserData(input);
  const customData: Record<string, unknown> = {
    content_type: 'product',
    value: input.value,
    currency: input.currency,
  };
  if (input.contentIds.length > 0) {
    customData.content_ids = input.contentIds;
  }

  const eventPayload: Record<string, unknown> = {
    event_name: 'Purchase',
    event_time: input.eventTimeSec,
    event_id: purchaseEventId(input.orderNumericId),
    action_source: 'website',
    user_data: userData,
    custom_data: customData,
  };

  const body: Record<string, unknown> = {
    data: [eventPayload],
    access_token: token,
  };
  const testCode = env.META_CAPI_TEST_EVENT_CODE?.trim();
  if (testCode) body.test_event_code = testCode;

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${META_KAZKA_PIXEL_ID}/events`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error('[ANALYTICS_WORKER] Meta CAPI Purchase failed', res.status, text.slice(0, 500));
    return { ok: false, status: res.status, body: text };
  }
  return { ok: true, status: res.status, body: text };
}

const PRODUCT_HANDLES_QUERY = `
  query ProductHandles($ids: [ID!]!) {
    nodes(ids: $ids) {
      id
      ... on Product {
        handle
      }
    }
  }
`;

/** Enrich content_ids via Admin GraphQL when webhook line_items lack handles. */
export async function resolveContentIdsWithAdmin(
  order: Record<string, unknown>,
  env: MetaCapiEnv,
): Promise<string[]> {
  const fromWebhook = extractContentIdsFromOrder(order);
  if (fromWebhook.length > 0) return fromWebhook;

  const token = env.SHOPIFY_ADMIN_TOKEN?.trim();
  const shop = (env.SHOP_DOMAIN ?? 'epir-art-silver-jewellery.myshopify.com')
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
  if (!token) return fromWebhook;

  const productIds = new Set<string>();
  for (const line of parseLineItems(order)) {
    const pid = line.product_id;
    if (typeof pid === 'number' && pid > 0) {
      productIds.add(`gid://shopify/Product/${pid}`);
    } else if (typeof pid === 'string' && pid.trim()) {
      const s = pid.trim();
      productIds.add(s.startsWith('gid://') ? s : `gid://shopify/Product/${s}`);
    }
  }
  if (productIds.size === 0) return fromWebhook;

  const endpoint = `https://${shop}/admin/api/2026-04/graphql.json`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({
      query: PRODUCT_HANDLES_QUERY,
      variables: { ids: [...productIds] },
    }),
  });
  if (!response.ok) {
    console.warn('[ANALYTICS_WORKER] Meta CAPI handle lookup HTTP', response.status);
    return fromWebhook;
  }
  const payload = (await response.json()) as {
    data?: { nodes?: Array<{ handle?: string } | null> };
  };
  const handles: string[] = [];
  for (const node of payload.data?.nodes ?? []) {
    if (node?.handle?.trim()) handles.push(node.handle.trim());
  }
  return [...new Set(handles)];
}

export async function maybeSendMetaCapiPurchaseForOrder(
  order: Record<string, unknown>,
  env: MetaCapiEnv,
  request: Request,
): Promise<void> {
  if (!isLikelyKazkaOrder(order)) return;

  const orderNumericId = extractOrderNumericId(order);
  if (!orderNumericId) {
    console.warn('[ANALYTICS_WORKER] Meta CAPI skipped: missing order id');
    return;
  }

  const shopifyGid =
    typeof order.admin_graphql_api_id === 'string'
      ? order.admin_graphql_api_id
      : `gid://shopify/Order/${orderNumericId}`;

  const contentIds = await resolveContentIdsWithAdmin(order, env);
  const { value, currency } = extractPurchaseTotals(order);
  const { email, phone } = extractCustomerPii(order);

  const createdAt = order.created_at;
  let eventTimeSec = Math.floor(Date.now() / 1000);
  if (typeof createdAt === 'string') {
    const ms = Date.parse(createdAt);
    if (Number.isFinite(ms)) eventTimeSec = Math.floor(ms / 1000);
  }

  const result = await sendMetaCapiPurchase(env, {
    orderGid: shopifyGid,
    orderNumericId,
    contentIds,
    value,
    currency,
    eventTimeSec,
    email,
    phone,
    clientIpAddress: typeof order.browser_ip === 'string' ? order.browser_ip : null,
    clientUserAgent: request.headers.get('User-Agent'),
  });

  if (result.skipped) {
    return;
  }
  if (!result.ok) {
    console.error('[ANALYTICS_WORKER] Meta CAPI error for order', orderNumericId);
  }
}
