/**
 * Shopify MCP Client - wywołuje oficjalny endpoint MCP Shopify
 * https://{shop_domain}/api/mcp
 * 
 * Używa Storefront API (publiczne, nie wymaga Admin Token)
 * Wymaga tylko SHOPIFY_STOREFRONT_TOKEN jako secret
 */

import { type McpRequest, type McpResponse } from './utils/jsonrpc';
import { compactCatalogResult } from './mcp/catalog-result-compact';

export interface Env {
  SHOP_DOMAIN?: string;
  /** MCP endpoint - zmienna z wrangler.toml [vars] */
  MCP_ENDPOINT?: string;
  SHOPIFY_ADMIN_TOKEN?: string;
  /** KV cache dla powtarzalnych `search_shop_policies_and_faqs` (klucz = sha256 znormalizowanego query). */
  POLICIES_CACHE?: KVNamespace;
}

const MCP_TIMEOUT_MS = 5000;

/** TTL KV cache dla policies/FAQ — polityki zmieniają się rzadko; 6h to bezpieczny kompromis świeżość/hit-rate. */
const POLICIES_CACHE_TTL_S = 6 * 3600;
/** Wersja klucza — bump gdy zmienimy format wyniku lub inwalidujemy masowo. */
const POLICIES_CACHE_KEY_VERSION = 'v1';

/**
 * Kanonizuje zapytanie do polityk: trim, lowercase, compact whitespace.
 * Cel: różne warianty ("Zwroty?", "zwroty", " ZWROTY ") trafiają w ten sam klucz KV.
 */
function normalizePolicyQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const view = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < view.length; i++) hex += view[i].toString(16).padStart(2, '0');
  return hex;
}

async function policiesCacheKey(query: string): Promise<string> {
  return `policies:${POLICIES_CACHE_KEY_VERSION}:${await sha256Hex(normalizePolicyQuery(query))}`;
}

type PoliciesCacheEntry = { payload: unknown; cached_at: number };

const CATALOG_FALLBACK = {
  products: [],
  system_note: 'Sklep jest chwilowo niedostępny (Connection Timeout). Poinformuj klienta o problemie technicznym.'
};

function safeArgsSummary(args: any) {
  if (!args || typeof args !== 'object') return {};
  const summary: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string') summary[key] = `[len:${value.length}]`;
    else if (Array.isArray(value)) summary[key] = `array(len=${value.length})`;
    else if (value && typeof value === 'object') summary[key] = 'object';
    else summary[key] = value;
  }
  return summary;
}

function normalizeSearchArgs(raw: any) {
  const args = raw && typeof raw === 'object' ? { ...raw } : {};
  const catalog = args.catalog && typeof args.catalog === 'object' ? { ...args.catalog } : {};
  if (typeof catalog.query !== 'string' && typeof args.query === 'string') {
    catalog.query = args.query.trim();
  } else if (typeof catalog.query === 'string') {
    catalog.query = catalog.query.trim();
  }

  const context = catalog.context && typeof catalog.context === 'object' ? { ...catalog.context } : {};
  if (typeof context.intent !== 'string' && typeof args.context === 'string' && args.context.trim()) {
    context.intent = args.context.trim();
  }
  if (typeof context.intent !== 'string' || !context.intent.trim()) {
    context.intent = 'biżuteria';
  }
  catalog.context = context;

  const pagination = catalog.pagination && typeof catalog.pagination === 'object' ? { ...catalog.pagination } : {};
  let limitNum: number | null =
    typeof pagination.limit === 'number' && Number.isFinite(pagination.limit)
      ? Math.trunc(pagination.limit)
      : null;
  if (limitNum === null && typeof args.first === 'number' && Number.isFinite(args.first)) {
    limitNum = Math.trunc(args.first);
  }
  if (limitNum === null) {
    limitNum = 3;
  }
  /** Twardy limit czatu: max 3 wyniki katalogu (zgodnie z workerem MCP). */
  pagination.limit = Math.max(1, Math.min(limitNum, 3));
  catalog.pagination = pagination;

  return { catalog };
}

function normalizeUpdateCartPayload(raw: any) {
  const args = raw && typeof raw === 'object' ? { ...raw } : {};
  const normalized: Record<string, unknown> = {};

  if (typeof args.cart_id === 'string' && args.cart_id.trim()) {
    normalized.cart_id = args.cart_id.trim();
  }
  if (args.cart_id === null) {
    delete normalized.cart_id;
  }

  const addItemsRaw: any[] = Array.isArray(args.add_items) ? [...args.add_items] : [];
  const updateItemsRaw: any[] = Array.isArray(args.update_items) ? [...args.update_items] : [];
  const removeLineIdsRaw: any[] = Array.isArray(args.remove_line_ids) ? [...args.remove_line_ids] : [];

  if (Array.isArray(args.lines)) {
    for (const line of args.lines) {
      if (!line || typeof line !== 'object') continue;
      const quantity = typeof line.quantity === 'number' ? Math.max(0, Math.trunc(line.quantity)) : null;
      if (quantity === null) continue;
      if (typeof line.line_item_id === 'string' && line.line_item_id.trim()) {
        updateItemsRaw.push({ id: line.line_item_id.trim(), quantity });
      } else if (typeof line.merchandise_id === 'string' && line.merchandise_id.trim() && quantity > 0) {
        addItemsRaw.push({ product_variant_id: line.merchandise_id.trim(), quantity });
      }
    }
  }

  const add_items = addItemsRaw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const productVariantId =
        typeof item.product_variant_id === 'string' && item.product_variant_id.trim()
          ? item.product_variant_id.trim()
          : typeof item.merchandise_id === 'string' && item.merchandise_id.trim()
            ? item.merchandise_id.trim()
            : '';
      const quantity = typeof item.quantity === 'number' ? Math.trunc(item.quantity) : null;
      if (!productVariantId || quantity === null || quantity < 1) return null;
      return { product_variant_id: productVariantId, quantity };
    })
    .filter((item): item is { product_variant_id: string; quantity: number } => Boolean(item));

  const update_items = updateItemsRaw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const id =
        typeof item.id === 'string' && item.id.trim()
          ? item.id.trim()
          : typeof item.line_item_id === 'string' && item.line_item_id.trim()
            ? item.line_item_id.trim()
            : '';
      const quantity = typeof item.quantity === 'number' ? Math.max(0, Math.trunc(item.quantity)) : null;
      if (!id || quantity === null) return null;
      return { id, quantity };
    })
    .filter((item): item is { id: string; quantity: number } => Boolean(item));

  const remove_line_ids = removeLineIdsRaw
    .map((lineId) => (typeof lineId === 'string' && lineId.trim() ? lineId.trim() : null))
    .filter((lineId): lineId is string => Boolean(lineId));

  if (add_items.length > 0) normalized.add_items = add_items;
  if (update_items.length > 0) normalized.update_items = update_items;
  if (remove_line_ids.length > 0) normalized.remove_line_ids = remove_line_ids;

  if (args.buyer_identity && typeof args.buyer_identity === 'object') {
    const buyerIdentity: Record<string, string> = {};
    if (typeof args.buyer_identity.email === 'string' && args.buyer_identity.email.trim()) {
      buyerIdentity.email = args.buyer_identity.email.trim();
    }
    if (typeof args.buyer_identity.phone === 'string' && args.buyer_identity.phone.trim()) {
      buyerIdentity.phone = args.buyer_identity.phone.trim();
    }
    if (typeof args.buyer_identity.country_code === 'string' && args.buyer_identity.country_code.trim()) {
      buyerIdentity.country_code = args.buyer_identity.country_code.trim();
    }
    if (Object.keys(buyerIdentity).length > 0) {
      normalized.buyer_identity = buyerIdentity;
    }
  }

  if (typeof args.note === 'string' && args.note.trim()) {
    normalized.note = args.note.trim();
  }

  return normalized;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasCatalogQueryOrFilters(args: Record<string, any>): boolean {
  const query = args?.catalog?.query;
  if (typeof query === 'string' && query.trim().length > 0) return true;
  const filters = args?.catalog?.filters;
  return Boolean(filters && typeof filters === 'object' && Object.keys(filters).length > 0);
}

function validateNormalizedArgs(toolName: string, args: Record<string, any>): void {
  if (toolName === 'search_catalog' && !hasCatalogQueryOrFilters(args)) {
    throw new Error('Invalid params: "catalog.query" or "catalog.filters" required for search_catalog');
  }
  if (toolName === 'search_shop_policies_and_faqs' && !isNonEmptyString(args.query)) {
    throw new Error('Invalid params: non-empty "query" required for search_shop_policies_and_faqs');
  }
  if (toolName === 'get_cart' && !isNonEmptyString(args.cart_id)) {
    throw new Error('Invalid params: non-empty "cart_id" required for get_cart');
  }
  if (toolName === 'update_cart') {
    const hasAddItems = Array.isArray(args.add_items) && args.add_items.length > 0;
    const hasUpdateItems = Array.isArray(args.update_items) && args.update_items.length > 0;
    const hasRemoveLineIds = Array.isArray(args.remove_line_ids) && args.remove_line_ids.length > 0;
    const hasBuyerIdentity = Boolean(args.buyer_identity && typeof args.buyer_identity === 'object' && Object.keys(args.buyer_identity).length > 0);
    const hasNote = isNonEmptyString(args.note);

    if (!hasAddItems && !hasUpdateItems && !hasRemoveLineIds && !hasBuyerIdentity && !hasNote) {
      throw new Error('Invalid params: provide at least one of add_items, update_items, remove_line_ids, buyer_identity, note');
    }
    if (!isNonEmptyString(args.cart_id) && !hasAddItems) {
      throw new Error('Invalid params: "cart_id" is required unless creating cart with add_items');
    }
  }
}

/**
 * Wywołuje narzędzie MCP Shopify (search_catalog, update_cart, etc.)
 * @param toolName Nazwa narzędzia (np. "search_catalog")
 * @param args Argumenty narzędzia
 * @param env Env z SHOP_DOMAIN i SHOPIFY_STOREFRONT_TOKEN
 * @returns Wynik MCP (result.content[0].text lub error)
 */
export async function callShopifyMcpTool(
  toolName: string,
  args: Record<string, any>,
  env: Env
): Promise<any> {
  const mcpEndpoint = env.MCP_ENDPOINT?.trim()
    || (env.SHOP_DOMAIN ? `https://${String(env.SHOP_DOMAIN).replace(/\/$/, '')}/api/mcp` : null)
    || (process.env.SHOP_DOMAIN ? `https://${String(process.env.SHOP_DOMAIN).replace(/\/$/, '')}/api/mcp` : null);
  if (!mcpEndpoint) {
    throw new Error('MCP_ENDPOINT or SHOP_DOMAIN not configured in wrangler.toml [vars]');
  }

  const normalizedArgs = toolName === 'search_catalog'
    ? normalizeSearchArgs(args)
    : toolName === 'update_cart'
      ? normalizeUpdateCartPayload(args)
      : args ?? {};
  validateNormalizedArgs(toolName, normalizedArgs);

  // KV short-circuit dla policies/FAQ: w produkcji to zapytanie potrafi zająć ~8s,
  // a polityki zmieniają się rzadko — powtarzalne pytania serwujemy z KV w ~10ms.
  const policiesCacheEnabled =
    toolName === 'search_shop_policies_and_faqs' &&
    !!env.POLICIES_CACHE &&
    typeof (normalizedArgs as any)?.query === 'string' &&
    ((normalizedArgs as any).query as string).trim().length > 0;

  let policiesCacheKeyComputed: string | null = null;
  if (policiesCacheEnabled) {
    try {
      policiesCacheKeyComputed = await policiesCacheKey((normalizedArgs as any).query as string);
      const cached = (await env.POLICIES_CACHE!.get(
        policiesCacheKeyComputed,
        'json',
      )) as PoliciesCacheEntry | null;
      if (cached && cached.payload !== undefined) {
        const ageS = typeof cached.cached_at === 'number'
          ? Math.max(0, Math.floor((Date.now() - cached.cached_at) / 1000))
          : null;
        console.log(
          JSON.stringify({
            tag: 'chat.mcp.policies_cache.hit',
            key: policiesCacheKeyComputed,
            age_s: ageS,
          }),
        );
        return cached.payload;
      }
      console.log(
        JSON.stringify({
          tag: 'chat.mcp.policies_cache.miss',
          key: policiesCacheKeyComputed,
        }),
      );
    } catch (cacheErr) {
      console.warn('[Shopify MCP] policies_cache read failed', cacheErr);
      policiesCacheKeyComputed = null;
    }
  }

  const request: McpRequest = {
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {
      name: toolName,
      arguments: normalizedArgs
    },
    id: Date.now()
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MCP_TIMEOUT_MS);

  try {
    const response = await fetch(mcpEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request),
      signal: controller.signal
    });

    console.log('[Shopify MCP] call', { tool: toolName, status: response.status, args: safeArgsSummary(normalizedArgs) });

    if (!response.ok) {
      if (toolName === 'search_catalog' && response.status === 522) {
        return CATALOG_FALLBACK;
      }
      const text = await response.text().catch(() => '<no body>');
      throw new Error(`Shopify MCP HTTP ${response.status}: ${text}`);
    }

    const mcpResponse = (await response.json().catch(() => null)) as McpResponse | null;
    if (!mcpResponse) {
      throw new Error('Shopify MCP returned invalid JSON');
    }
    if (mcpResponse.error) {
      throw new Error(`Shopify MCP error ${mcpResponse.error.code}: ${mcpResponse.error.message}`);
    }
    let result = (mcpResponse as any).result ?? mcpResponse;
    if (toolName === 'search_catalog') {
      result = compactCatalogResult(result);
    }

    // Zapis do KV tylko dla udanych responses policies (nigdy błędów / fallbacków).
    if (policiesCacheEnabled && policiesCacheKeyComputed && env.POLICIES_CACHE) {
      try {
        const entry: PoliciesCacheEntry = { payload: result, cached_at: Date.now() };
        await env.POLICIES_CACHE.put(policiesCacheKeyComputed, JSON.stringify(entry), {
          expirationTtl: POLICIES_CACHE_TTL_S,
        });
        console.log(
          JSON.stringify({
            tag: 'chat.mcp.policies_cache.set',
            key: policiesCacheKeyComputed,
            ttl_s: POLICIES_CACHE_TTL_S,
          }),
        );
      } catch (cacheErr) {
        console.warn('[Shopify MCP] policies_cache write failed', cacheErr);
      }
    }

    return result;
  } catch (err: any) {
    const isAbortError = err instanceof Error && err.name === 'AbortError';
    const isNetworkError = err instanceof TypeError;
    if (toolName === 'search_catalog' && (isAbortError || isNetworkError)) {
      return CATALOG_FALLBACK;
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const __test = { normalizePolicyQuery, policiesCacheKey, sha256Hex };

/**
 * Wyszukuje produkty w katalogu Shopify przez MCP endpoint
 */
export async function searchShopCatalogMcp(
  query: string,
  env: Env,
  context?: string
): Promise<string> {
  return callShopifyMcpTool(
    'search_catalog',
    {
      catalog: {
        query,
        context: { intent: context ?? 'biżuteria' },
      },
    },
    env,
  );
}

/**
 * Pobiera polityki sklepu przez MCP endpoint
 */
export async function getShopPoliciesMcp(
  policyTypes: string[],
  env: Env
): Promise<string> {
  return callShopifyMcpTool('get_shop_policies', { policy_types: policyTypes }, env);
}

/**
 * Aktualizuje koszyk - dodaje, usuwa lub zmienia ilość produktów
 * @param env Env z SHOP_DOMAIN i SHOPIFY_STOREFRONT_TOKEN
 * @param cartId ID istniejącego koszyka (null dla nowego koszyka)
 * @param lines Tablica linii koszyka z merchandiseId i quantity
 * @returns Zaktualizowany koszyk jako JSON string
 */
export async function updateCart(
  env: Env,
  cartId: string | null,
  lines: Array<{ merchandiseId: string; quantity: number }>
): Promise<string> {
  const add_items = lines.map((line) => ({
    product_variant_id: line.merchandiseId,
    quantity: line.quantity,
  }));
  const result = await callShopifyMcpTool('update_cart', { cart_id: cartId, add_items }, env);
  return JSON.stringify(result ?? {});
}

/**
 * Pobiera aktualny koszyk
 * @param env Env z SHOP_DOMAIN i SHOPIFY_STOREFRONT_TOKEN
 * @param cartId ID koszyka do pobrania
 * @returns Koszyk jako JSON string z produktami i cenami
 */
export async function getCart(
  env: Env,
  cartId: string
): Promise<string> {
  const result = await callShopifyMcpTool('get_cart', { cart_id: cartId }, env);
  return JSON.stringify(result ?? {});
}

/**
 * Pobiera status konkretnego zamówienia
 * @param env Env z SHOP_DOMAIN i SHOPIFY_STOREFRONT_TOKEN
 * @param orderId ID zamówienia
 * @returns Status zamówienia jako JSON string
 */
export async function getOrderStatus(
  env: Env,
  orderId: string
): Promise<string> {
  const result = await callShopifyMcpTool('get_order_status', { order_id: orderId }, env);
  return JSON.stringify(result ?? {});
}

/**
 * Pobiera status ostatniego zamówienia klienta
 * @param env Env z SHOP_DOMAIN i SHOPIFY_STOREFRONT_TOKEN
 * @returns Ostatnie zamówienie jako JSON string
 */
export async function getMostRecentOrderStatus(
  env: Env
): Promise<string> {
  const result = await callShopifyMcpTool('get_most_recent_order_status', {}, env);
  return JSON.stringify(result ?? {});
}

/**
 * Fetch basic customer details from Admin API (firstName, lastName, email)
 */
export async function getCustomerById(env: Env, customerId: string): Promise<{ firstName?: string; lastName?: string; email?: string } | null> {
  try {
    const shopDomain = env.SHOP_DOMAIN || process.env.SHOP_DOMAIN;
    if (!shopDomain) throw new Error('SHOP_DOMAIN not configured');
    const adminToken = env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN || process.env.SHOPIFY_ACCESS_TOKEN;
    if (!adminToken) throw new Error('SHOPIFY_ADMIN_TOKEN not configured');

    const normalizedId = customerId.startsWith('gid://shopify/Customer/')
      ? customerId
      : `gid://shopify/Customer/${customerId}`;
    const query = `query customer($id: ID!) { customer(id: $id) { firstName lastName email } }`;
    const endpoint = `https://${shopDomain}/admin/api/2024-07/graphql.json`;
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': adminToken }, body: JSON.stringify({ query, variables: { id: normalizedId } }) });
    if (!response.ok) return null;
    const json: any = await response.json().catch(() => null);
    if (json?.errors) {
      console.warn('[getCustomerById] GraphQL errors:', JSON.stringify(json.errors));
    }
    const customer = json?.data?.customer;
    if (!customer) return null;
    return { firstName: customer.firstName, lastName: customer.lastName, email: customer.email };
  } catch (e) {
    console.warn('getCustomerById error:', e);
    return null;
  }
}
