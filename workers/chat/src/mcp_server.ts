// MCP Server (JSON-RPC 2.0) dla narzędzi Shopify w trybie single-store.
// Architektura: Wszystkie narzędzia delegują do oficjalnego endpoint MCP sklepu:
//   https://{shop_domain}/api/mcp
// Bez fallbacków na Storefront/Admin API – tzn. bez zależności od tokenów Storefront.
// 
// Strategia błędów (Plan B):
// - Timeout/522/503/AbortError dla search_catalog → fallback: puste produkty + system_note
// - search_shop_policies_and_faqs: dłuższy timeout (15s), do 3 prób przy AbortError/TypeError, potem błąd
// - Timeout/AbortError dla pozostałych narzędzi → błąd JSON-RPC (nie fallback)
// - Dzięki temu AI dostaje "sklep niedostępny" zamiast crashu z 401.
//
// Sekrety (SHOPIFY_APP_SECRET) pochodzą TYLKO z Cloudflare Secrets.
// ŻADNYCH sekretów w wrangler.toml [vars] ani w kodzie.
// Endpointy:
// - POST /mcp/tools/call (dev/test oraz helper backendowy bez App Proxy)
// - POST /apps/assistant/mcp (podpisana trasa kompatybilności; nie jest kanonicznym buyer-facing ingress czatu)

import { checkRateLimit } from './rate-limiter';
import { 
  type JsonRpcRequest, 
  type JsonRpcResponse,
  createJsonRpcSuccess,
  createJsonRpcError 
} from './utils/jsonrpc';
import type { Env } from './index';
import { TOOL_SCHEMAS } from './mcp_tools';
import { normalizeCartId, isValidCartGid } from './utils/cart';
type JsonRpcId = string | number | null;

function json(headers: HeadersInit = {}) {
  return { 'Content-Type': 'application/json', ...headers };
}

function rpcResult(id: JsonRpcId, result: any): Response {
  const body = createJsonRpcSuccess(id ?? 0, result);
  return new Response(JSON.stringify(body), { status: 200, headers: json() });
}

function rpcError(id: JsonRpcId, code: number, message: string, data?: any): Response {
  const body = createJsonRpcError(id ?? 0, code, message, data);
  return new Response(JSON.stringify(body), { status: 200, headers: json() });
}

const MCP_TIMEOUT_MS = 5000;
/** Policies/FAQ search przez Shop MCP bywa wolniejsze niż katalog — krótki timeout powodował AbortError. */
const MCP_POLICIES_TIMEOUT_MS = 15000;
const MCP_POLICIES_MAX_ATTEMPTS = 3;

const CATALOG_FALLBACK = {
  products: [],
  system_note: 'Sklep jest chwilowo niedostępny (Connection Timeout). Poinformuj klienta o problemie technicznym.'
};

function verifyInternalKey(env: Env, request: Request): { ok: boolean; message?: string } {
  const expected = env.EPIR_INTERNAL_KEY || (process.env as any)?.EPIR_INTERNAL_KEY;
  if (!expected) return { ok: true }; // brak klucza -> nie wymuszamy
  const provided = request.headers.get('X-EPIR-Internal-Key');
  if (provided && provided === expected) return { ok: true };
  return { ok: false, message: 'Unauthorized: Missing or invalid X-EPIR-Internal-Key' };
}

function safeArgsSummary(args: any) {
  if (!args || typeof args !== 'object') return {};
  const summary: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string') {
      summary[key] = `[len:${value.length}]`;
    } else if (Array.isArray(value)) {
      summary[key] = `array(len=${value.length})`;
    } else if (value && typeof value === 'object') {
      summary[key] = 'object';
    } else {
      summary[key] = value;
    }
  }
  return summary;
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryPoliciesMcpFetch(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  return err instanceof Error && err.name === 'AbortError';
}

/** Liczy produkty w odpowiedzi MCP search_catalog (JSON w content[0].text). */
function summarizeSearchCatalogResult(result: unknown): { productCount: number | null; parseError?: boolean } {
  if (!result || typeof result !== 'object') return { productCount: null };
  const content = (result as { content?: Array<{ type?: string; text?: string }> }).content;
  const text = Array.isArray(content) ? content[0]?.text : undefined;
  if (typeof text !== 'string' || !text.trim()) return { productCount: null };
  try {
    const parsed = JSON.parse(text) as {
      products?: unknown;
      items?: unknown;
      results?: unknown;
      catalog?: { products?: unknown };
    };
    const products =
      (Array.isArray(parsed?.products) && parsed.products)
      || (Array.isArray(parsed?.items) && parsed.items)
      || (Array.isArray(parsed?.results) && parsed.results)
      || (Array.isArray(parsed?.catalog?.products) && parsed.catalog.products);
    if (!Array.isArray(products)) return { productCount: null, parseError: true };
    return { productCount: products.length };
  } catch {
    return { productCount: null, parseError: true };
  }
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeSearchCatalogArgs(raw: any, brand?: string): Record<string, unknown> {
  const source = raw && typeof raw === 'object' ? { ...raw } : {};
  const normalized: Record<string, unknown> = {};
  if (source.meta && typeof source.meta === 'object') {
    normalized.meta = source.meta;
  }

  const catalog = source.catalog && typeof source.catalog === 'object'
    ? { ...(source.catalog as Record<string, unknown>) }
    : {};
  const legacyQuery = isNonEmptyString(source.query) ? source.query.trim() : '';
  if (!isNonEmptyString(catalog.query) && legacyQuery) {
    catalog.query = legacyQuery;
  }
  if (isNonEmptyString(catalog.query)) {
    catalog.query = catalog.query.trim();
  }

  const context = catalog.context && typeof catalog.context === 'object'
    ? { ...(catalog.context as Record<string, unknown>) }
    : {};
  const legacyContext = isNonEmptyString(source.context) ? source.context.trim() : '';
  if (!isNonEmptyString(context.intent) && legacyContext) {
    context.intent = legacyContext;
  }
  if (!isNonEmptyString(context.intent)) {
    context.intent = 'biżuteria';
  }
  if (brand === 'kazka' && isNonEmptyString(context.intent)) {
    context.intent = `${context.intent} z kolekcji Kazka Jewelry`;
  }
  if (brand === 'zareczyny' && isNonEmptyString(context.intent)) {
    context.intent = `${context.intent} w kontekście pierścionków zaręczynowych`;
  }
  catalog.context = context;

  const pagination = catalog.pagination && typeof catalog.pagination === 'object'
    ? { ...(catalog.pagination as Record<string, unknown>) }
    : {};
  const legacyFirst = toFiniteNumber(source.first);
  let limitNum: number | null =
    typeof pagination.limit === 'number' && Number.isFinite(pagination.limit)
      ? Math.trunc(pagination.limit)
      : toFiniteNumber(pagination.limit);
  if (limitNum === null && legacyFirst !== null) {
    limitNum = Math.trunc(legacyFirst);
  }
  if (limitNum === null) {
    limitNum = 3;
  }
  /** Twardy limit czatu: max 3 wyniki katalogu (prompt + MCP). */
  pagination.limit = Math.max(1, Math.min(limitNum, 3));
  catalog.pagination = pagination;

  if (!catalog.filters && source.filters && typeof source.filters === 'object') {
    catalog.filters = source.filters;
  }

  normalized.catalog = catalog;
  return normalized;
}

function normalizeUpdateCartArgs(raw: any, sessionCartKey?: string): Record<string, unknown> {
  const source = normalizeCartArgs(raw ?? {}, sessionCartKey);
  const normalized: Record<string, unknown> = {};

  if (isNonEmptyString(source.cart_id)) {
    normalized.cart_id = source.cart_id.trim();
  }

  const addItemsRaw: any[] = Array.isArray(source.add_items) ? [...source.add_items] : [];
  const updateItemsRaw: any[] = Array.isArray(source.update_items) ? [...source.update_items] : [];
  const removeLineIdsRaw: any[] = Array.isArray(source.remove_line_ids) ? [...source.remove_line_ids] : [];

  if (Array.isArray(source.lines)) {
    for (const line of source.lines) {
      if (!line || typeof line !== 'object') continue;
      const lineId = isNonEmptyString((line as any).line_item_id)
        ? String((line as any).line_item_id).trim()
        : isNonEmptyString((line as any).id)
          ? String((line as any).id).trim()
          : '';
      const variantId = isNonEmptyString((line as any).product_variant_id)
        ? String((line as any).product_variant_id).trim()
        : isNonEmptyString((line as any).merchandise_id)
          ? String((line as any).merchandise_id).trim()
          : isNonEmptyString((line as any).variant_id)
            ? String((line as any).variant_id).trim()
            : '';
      const quantityRaw = toFiniteNumber((line as any).quantity);
      if (quantityRaw === null) continue;
      const quantity = Math.max(0, Math.trunc(quantityRaw));

      if (lineId) {
        updateItemsRaw.push({ id: lineId, quantity });
      } else if (variantId && quantity > 0) {
        addItemsRaw.push({ product_variant_id: variantId, quantity });
      }
    }
  }

  const add_items = addItemsRaw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const productVariantId = isNonEmptyString((item as any).product_variant_id)
        ? String((item as any).product_variant_id).trim()
        : isNonEmptyString((item as any).merchandise_id)
          ? String((item as any).merchandise_id).trim()
          : isNonEmptyString((item as any).variant_id)
            ? String((item as any).variant_id).trim()
            : '';
      const quantityRaw = toFiniteNumber((item as any).quantity);
      if (!productVariantId || quantityRaw === null) return null;
      const quantity = Math.trunc(quantityRaw);
      if (quantity < 1) return null;
      return { product_variant_id: productVariantId, quantity };
    })
    .filter((item): item is { product_variant_id: string; quantity: number } => Boolean(item));

  const update_items = updateItemsRaw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const id = isNonEmptyString((item as any).id)
        ? String((item as any).id).trim()
        : isNonEmptyString((item as any).line_item_id)
          ? String((item as any).line_item_id).trim()
          : '';
      const quantityRaw = toFiniteNumber((item as any).quantity);
      if (!id || quantityRaw === null) return null;
      const quantity = Math.max(0, Math.trunc(quantityRaw));
      return { id, quantity };
    })
    .filter((item): item is { id: string; quantity: number } => Boolean(item));

  const remove_line_ids = removeLineIdsRaw
    .map((id) => (isNonEmptyString(id) ? id.trim() : null))
    .filter((id): id is string => Boolean(id));

  if (add_items.length > 0) normalized.add_items = add_items;
  if (update_items.length > 0) normalized.update_items = update_items;
  if (remove_line_ids.length > 0) normalized.remove_line_ids = remove_line_ids;

  if (source.buyer_identity && typeof source.buyer_identity === 'object') {
    const buyerIdentity = source.buyer_identity as Record<string, unknown>;
    const normalizedBuyerIdentity: Record<string, string> = {};
    if (isNonEmptyString(buyerIdentity.email)) normalizedBuyerIdentity.email = buyerIdentity.email.trim();
    if (isNonEmptyString(buyerIdentity.phone)) normalizedBuyerIdentity.phone = buyerIdentity.phone.trim();
    if (isNonEmptyString(buyerIdentity.country_code)) normalizedBuyerIdentity.country_code = buyerIdentity.country_code.trim();
    if (Object.keys(normalizedBuyerIdentity).length > 0) {
      normalized.buyer_identity = normalizedBuyerIdentity;
    }
  }

  if (isNonEmptyString(source.note)) {
    normalized.note = source.note.trim();
  }

  return normalized;
}

function hasCatalogQueryOrFilters(args: any): boolean {
  const query = args?.catalog?.query;
  if (isNonEmptyString(query)) return true;
  const filters = args?.catalog?.filters;
  return Boolean(filters && typeof filters === 'object' && Object.keys(filters).length > 0);
}

function validateNormalizedToolArgs(toolName: string, args: any): { code: number; message: string } | null {
  if (toolName === 'search_catalog' && !hasCatalogQueryOrFilters(args)) {
    return {
      code: -32602,
      message: 'Invalid params: "catalog.query" or "catalog.filters" required for search_catalog',
    };
  }
  if (toolName === 'search_shop_policies_and_faqs' && !isNonEmptyString(args?.query)) {
    return {
      code: -32602,
      message: 'Invalid params: non-empty "query" required for search_shop_policies_and_faqs',
    };
  }
  if (toolName === 'get_cart' && !isNonEmptyString(args?.cart_id)) {
    return {
      code: -32602,
      message: 'Invalid params: non-empty "cart_id" required for get_cart',
    };
  }
  if (toolName === 'update_cart') {
    const hasAddItems = Array.isArray(args?.add_items) && args.add_items.length > 0;
    const hasUpdateItems = Array.isArray(args?.update_items) && args.update_items.length > 0;
    const hasRemoveLineIds = Array.isArray(args?.remove_line_ids) && args.remove_line_ids.length > 0;
    const hasBuyerIdentity =
      Boolean(args?.buyer_identity && typeof args.buyer_identity === 'object' && Object.keys(args.buyer_identity).length > 0);
    const hasNote = isNonEmptyString(args?.note);

    if (!hasAddItems && !hasUpdateItems && !hasRemoveLineIds && !hasBuyerIdentity && !hasNote) {
      return {
        code: -32602,
        message: 'Invalid params: provide at least one of add_items, update_items, remove_line_ids, buyer_identity, note',
      };
    }
    if (!isNonEmptyString(args?.cart_id) && !hasAddItems) {
      return {
        code: -32602,
        message: 'Invalid params: "cart_id" is required unless creating a cart with add_items',
      };
    }
  }
  return null;
}

function assertCartIdFormat(toolName: string, args: any): { code: number; message: string } | null {
  if (args.cart_id && !isValidCartGid(args.cart_id) && !String(args.cart_id).startsWith('?key=')) {
    console.warn(`[callShopMcp] Invalid cart_id format for ${toolName}:`, args.cart_id);
    return {
      code: -32602,
      message: 'Invalid cart_id format. Expected a Shopify Cart GID (e.g., \'gid://shopify/Cart/<id>?key=...\')',
    };
  }
  return null;
}

/**
 * Normalize cart-related arguments before calling MCP
 * Fixes cart_id format issues (spaces, missing key, invalid GID)
 */
/**
 * Zwraca URL endpointu MCP z env (zmienna MCP_ENDPOINT) lub fallback z SHOP_DOMAIN.
 * CHAT_SPEC: shopify-admin-mcp = https://{shop_domain}/api/mcp
 */
export function getMcpEndpoint(env: { MCP_ENDPOINT?: string; SHOP_DOMAIN?: string }): string {
  const url = env?.MCP_ENDPOINT?.trim();
  if (url) return url;
  const domain = env?.SHOP_DOMAIN || (process.env as any)?.SHOP_DOMAIN;
  if (!domain) return '';
  return `https://${String(domain).replace(/\/$/, '')}/api/mcp`;
}

function normalizeCartArgs(raw: any, sessionCartKey?: string): any {
  const args = { ...raw };
  
  // Remove cart_id if it's null (Shopify MCP doesn't accept null, only undefined or valid string)
  if (args.cart_id === null) {
    delete args.cart_id;
    console.log('[normalizeCartArgs] Removed null cart_id (will create new cart)');
    return args;
  }
  
  // Normalize cart_id if present
  if (args.cart_id) {
    const normalized = normalizeCartId(args.cart_id, sessionCartKey);
    
    if (!normalized) {
      console.warn('[normalizeCartArgs] Invalid cart_id, keeping original:', args.cart_id);
      return args;
    }
    
    args.cart_id = normalized;
    console.log('[normalizeCartArgs] Normalized cart_id:', { original: raw.cart_id, normalized });
  }
  
  return args;
}

async function callShopMcp(env: Env, toolName: string, rawArgs: any, brand?: string): Promise<{ result?: any; error?: any }> {
  const shopDomain = env?.SHOP_DOMAIN || process.env.SHOP_DOMAIN;
  if (!shopDomain) {
    return { error: { code: -32602, message: 'SHOP_DOMAIN not configured' } };
  }

  // Normalize arguments based on tool type
  let args: any;
  if (toolName === 'search_catalog') {
    args = normalizeSearchCatalogArgs(rawArgs, brand);
  } else if (toolName === 'update_cart') {
    args = normalizeUpdateCartArgs(rawArgs ?? {});
  } else if (toolName === 'get_cart') {
    args = normalizeCartArgs(rawArgs ?? {});
  } else {
    args = rawArgs ?? {};
  }

  if ((toolName === 'get_cart' || toolName === 'update_cart') && args?.cart_id) {
    const cartError = assertCartIdFormat(toolName, args);
    if (cartError) return { error: cartError };
  }

  const validationError = validateNormalizedToolArgs(toolName, args);
  if (validationError) {
    return { error: validationError };
  }

  const rpc: JsonRpcRequest = {
    jsonrpc: '2.0',
    method: 'tools/call',
    params: { name: toolName, arguments: args },
    id: Date.now()
  };

  const endpoint = getMcpEndpoint(env) || `https://${String(shopDomain).replace(/\/$/, '')}/api/mcp`;
  const isPoliciesTool = toolName === 'search_shop_policies_and_faqs';
  const timeoutMs = isPoliciesTool ? MCP_POLICIES_TIMEOUT_MS : MCP_TIMEOUT_MS;
  const maxFetchAttempts = isPoliciesTool ? MCP_POLICIES_MAX_ATTEMPTS : 1;

  try {
    let res: Response | undefined;
    for (let attempt = 1; attempt <= maxFetchAttempts; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const fetchStarted = Date.now();
      try {
        res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(rpc),
          signal: controller.signal
        });

        const queryPreview =
          toolName === 'search_catalog' && typeof args?.catalog?.query === 'string'
            ? args.catalog.query.slice(0, 240)
            : undefined;
        console.log('[mcp] call', {
          tool: toolName,
          status: res.status,
          args: safeArgsSummary(args),
          queryPreview,
          duration_ms: Date.now() - fetchStarted,
          attempt,
          maxAttempts: maxFetchAttempts,
          timestamp: new Date().toISOString(),
        });
        break;
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.warn('[mcp] fetch attempt failed', {
          tool: toolName,
          attempt,
          maxAttempts: maxFetchAttempts,
          error: errMsg,
        });
        if (attempt < maxFetchAttempts && isPoliciesTool && shouldRetryPoliciesMcpFetch(err)) {
          await sleepMs(100 * attempt);
          continue;
        }
        throw err;
      } finally {
        clearTimeout(timeoutId);
      }
    }

    if (!res) {
      return { error: { code: -32000, message: 'Shop MCP call failed', details: 'No response from shop MCP' } };
    }

    if (!res.ok) {
      // Plan B: Safe fallback for search_catalog on network/service errors
      if (toolName === 'search_catalog' && (res.status === 522 || res.status === 503 || res.status >= 500)) {
        console.warn(`[mcp] Shop MCP ${res.status} for ${toolName}, returning safe fallback`);
        return { result: CATALOG_FALLBACK };
      }
      const body = await res.text().catch(() => '');
      return { error: { code: res.status, message: `Shop MCP HTTP ${res.status}`, details: body.slice(0, 500) } };
    }

    const json = (await res.json().catch(() => null)) as JsonRpcResponse | null;
    if (!json) {
      if (toolName === 'search_catalog') {
        console.warn('[mcp] Invalid JSON from shop MCP for search_catalog, returning safe fallback');
        return { result: CATALOG_FALLBACK };
      }
      return { error: { code: -32700, message: 'Invalid JSON response from shop MCP' } };
    }
    if ((json as any).error) {
      return { error: (json as any).error };
    }
    const resultPayload = (json as any).result ?? json;
    if (toolName === 'search_catalog') {
      const { productCount, parseError } = summarizeSearchCatalogResult(resultPayload);
      console.log('[mcp] search_catalog outcome', {
        productCount,
        parseError: parseError ?? false,
      });
    }
    return { result: resultPayload };
  } catch (err: any) {
    const isAbortError = err instanceof Error && err.name === 'AbortError';
    const isNetworkError = err instanceof TypeError;
    const errMsg = err?.message || String(err);
    
    // Plan B: Safe fallback for search_catalog on timeout/network errors
    if (toolName === 'search_catalog' && (isAbortError || isNetworkError)) {
      console.warn(`[mcp] Timeout/Network error for ${toolName}, returning safe fallback`, { error: errMsg });
      return { result: CATALOG_FALLBACK };
    }
    
    console.error('[mcp] Shop MCP call failed', { tool: toolName, error: errMsg });
    return { error: { code: -32000, message: 'Shop MCP call failed', details: errMsg } };
  }
}

export async function handleToolsCall(env: any, request: Request): Promise<Response> {
  let rpc: JsonRpcRequest | null = null;
  try {
    rpc = (await request.json()) as JsonRpcRequest;
  } catch {
    return rpcError(null, -32700, 'Parse error');
  }

  if (!rpc || rpc.jsonrpc !== '2.0' || typeof rpc.method !== 'string') {
    return rpcError(rpc?.id ?? null, -32600, 'Invalid Request');
  }

  if (rpc.method === 'tools/list') {
    const publicToolNames = [
      'search_catalog',
      'search_shop_policies_and_faqs',
      'get_cart',
      'update_cart',
    ] as const;
    const tools = publicToolNames.map((toolName) => ({
      name: TOOL_SCHEMAS[toolName].name,
      description: TOOL_SCHEMAS[toolName].description,
      inputSchema: TOOL_SCHEMAS[toolName].parameters,
    }));
    return rpcResult(rpc.id ?? null, { tools });
  }

  if (rpc.method !== 'tools/call') {
    return rpcError(rpc.id ?? null, -32601, `Method not found: ${rpc.method}`);
  }

  const name = rpc.params?.name as string | undefined;
  const args = rpc.params?.arguments ?? {};
  if (!name) {
    return rpcError(rpc.id ?? null, -32602, 'Invalid params: "name" required');
  }

  const brand = (rpc.params?.brand as string) || request.headers.get('X-Brand') || undefined;
  const { result, error } = await callShopMcp(env, name, args, brand);

  if (error) {
    return rpcError(rpc.id ?? null, error.code ?? -32000, error.message ?? 'Tool execution failed', error.details ? { details: error.details } : undefined);
  }

  return rpcResult(rpc.id ?? null, result ?? {});
}

/**
 * Direct MCP tool call without HTTP - for internal calls
 */
export async function callMcpToolDirect(env: any, toolName: string, args: any, brand?: string): Promise<any> {
  const { result, error } = await callShopMcp(env, toolName, args, brand);
  if (error) return { error };
  return { result };
}

export async function handleMcpRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const isAppProxy = url.pathname === '/apps/assistant/mcp';
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: json() });
  }

  // Internal key check (dla wywołań z Hydrogen/SSR, nie dotyczy App Proxy)
  if (!isAppProxy) {
    const internalCheck = verifyInternalKey(env, request);
    if (!internalCheck.ok) {
      return new Response(internalCheck.message ?? 'Unauthorized', { status: 401, headers: json() });
    }
  }

  if (isAppProxy) {
    // App Proxy HMAC jest weryfikowany centralnie w index.ts dla całego /apps/assistant/*.
    // Tutaj zakładamy już preautoryzowany request i nie dublujemy osobnego verifiera.
    // Rate limit per shop for App Proxy MCP calls. Protect backend from abusive loops.
    try {
      const shop = env.SHOP_DOMAIN || process.env.SHOP_DOMAIN || 'global';
      const rl = await checkRateLimit(shop, env as any, 1);
      if (!rl || !rl.allowed) {
        const retryAfter = rl?.retryAfterMs ? String(rl.retryAfterMs) : undefined;
        const headers = { ...json(), ...(retryAfter ? { 'Retry-After': retryAfter } : {}) };
        return new Response('Rate limit exceeded', { status: 429, headers });
      }
    } catch (e) {
      console.warn('[mcp_server] Rate limit check failed, continuing:', e);
      // If rate limit service throws, proceed (fail-open) but log false positives
    }
  }

  return handleToolsCall(env, request);
}