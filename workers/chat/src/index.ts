/// <reference types="@cloudflare/workers-types" />

import type { Env } from './config/bindings';

export type { Env } from './config/bindings';

/**
 * GŁÓWNY PLIK WORKERA (epir-art-jewellery-worker)
 *
 * WERSJA POPRAWIONA (Naprawia Błędy Intencji i Utraty Sesji)
 *
 * Ta wersja implementuje kluczowe poprawki:
 * 1.  **POPRAWKA UTRATY SESJI:** Natychmiast wysyła 'session_id' do klienta
 * przez dedykowany event SSE 'session', co zapewnia stanowość.
 * 2.  **POPRAWKA INTENCJI/RAG:** Usunięto agresywną logikę RAG z `handleChat`.
 * Teraz to AI decyduje, kiedy wywołać narzędzia (jak search_shop_catalog)
 * zgodnie z logiką w nowym prompcie Harmony.
 * 3.  **POPRAWKA HARMONY:** `streamAssistantResponse` poprawnie wywołuje
 * `streamGroqHarmonyEvents` (zamiast streamGroqResponse) i implementuje
 * pełną pętlę wywołań narzędzi (tool-calling loop).
 */

// Importy bezpieczeństwa i DO
import { verifyAppProxyHmac, replayCheck } from './security';
import { RateLimiterDO } from './rate-limiter';
import { TokenVaultDO, TokenVault } from './token-vault';

// Importy AI i Narzędzi (BEZPOŚREDNIO z ai-client.ts)
import {
  streamGroqEvents,
  streamVisionEvents,
  getGroqResponse,
  GroqMessage,
} from './ai-client';
import { GROQ_MODEL_ID } from './config/model-params';
import { LUXURY_SYSTEM_PROMPT } from './prompts/luxury-system-prompt'; // 🟢 Używa nowego promptu v2
import { TOOL_SCHEMAS } from './mcp_tools'; // 🔵 Używa poprawionych schematów v2
import { truncateWithSummary, type Message as HistoryMessage } from './utils/history'; // 🔵 History truncation
import { callMcpToolDirect, handleMcpRequest } from './mcp_server';

/** Wywołanie run_analytics_query – tylko gdy channel=internal-dashboard (BIGQUERY_BATCH + ADMIN_KEY) */
async function runAnalyticsQuery(env: Env, args: { queryId?: string; dateFrom?: number; dateTo?: number }): Promise<{ result?: unknown; error?: unknown }> {
  const binding = (env as any).BIGQUERY_BATCH as Fetcher | undefined;
  const adminKey = env.ADMIN_KEY;
  if (!binding || !adminKey) {
    return { error: { code: -32603, message: 'run_analytics_query not configured (BIGQUERY_BATCH or ADMIN_KEY missing)' } };
  }
  const queryId = args?.queryId;
  if (!queryId || typeof queryId !== 'string') {
    return { error: { code: -32602, message: 'queryId required' } };
  }
  try {
    const res = await binding.fetch('https://bq/internal/analytics/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminKey}`,
        'X-Admin-Key': adminKey,
      },
      body: JSON.stringify({ queryId, dateFrom: args.dateFrom, dateTo: args.dateTo }),
    });
    const data = await res.json().catch(() => ({})) as { rows?: unknown[]; error?: string };
    if (!res.ok) {
      return { error: { code: res.status, message: data.error ?? `HTTP ${res.status}` } };
    }
    if (data.error) {
      return { error: { code: -32000, message: data.error } };
    }
    return { result: { queryId, rows: data.rows ?? [] } };
  } catch (e: any) {
    return { error: { code: -32000, message: e?.message ?? 'run_analytics_query failed' } };
  }
}
import { ProfileService } from './profile';
import { AnalyticsService } from './analytics-service';
import { DASHBOARD_HTML } from './dashboard-html';
import { buildAIProfilePrompt, fetchAIProfile } from './ai-profile';
import {
  loadPersonMemory,
  upsertPersonMemory,
  historyToPlainText,
  mergeSessionIntoPersonSummary,
} from './person-memory';

// Importy RAG (teraz używane tylko przez narzędzia, a nie przez index.ts)
import {
  searchShopPoliciesAndFaqs,
  searchShopPoliciesAndFaqsWithMCP,
  searchProductCatalogWithMCP,
  formatRagContextForPrompt,
  type VectorizeIndex,
} from './rag-client-wrapper';

// Importy Klienta Shopify (używane przez mcp_server, ale nie tutaj)
import { getCart, getMostRecentOrderStatus } from './shopify-mcp-client';

// Typy sesji i żądań
type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

interface HistoryEntry {
  role: ChatRole;
  content: string;
  ts: number;
  // Pola Harmony (przechowywane w DO, ale filtrowane przed wysłaniem do AI)
  tool_calls?: any;
  tool_call_id?: string;
  name?: string;
}

interface ChatRequestBody {
  message: string;
  session_id?: string;
  cart_id?: string;
  brand?: string;
  stream?: boolean;
  /** Obraz w base64 – gdy obecny, używany jest model vision (Workers AI) zamiast Groq */
  image_base64?: string;
  /** Alias storefrontu (np. "kazka") – MCP mapuje na Storefront ID */
  storefrontId?: string;
  /** Kanał (np. "hydrogen-kazka") – kontekst dla RAG/MCP */
  channel?: string;
  /** Aktualna ścieżka (np. "/collections/kazka-xyz") */
  route?: string;
  /** Handle kolekcji, gdy na stronie kolekcji */
  collectionHandle?: string;
}

type PublicStorefrontTokenEnvKey = 'PUBLIC_STOREFRONT_API_TOKEN_KAZKA' | 'PUBLIC_STOREFRONT_API_TOKEN_ZARECZYNY';
type PrivateStorefrontTokenEnvKey = 'PRIVATE_STOREFRONT_API_TOKEN_ZARECZYNY';
type StorefrontTokenEnvKey = PublicStorefrontTokenEnvKey;

type StaticStorefrontConfig = {
  storefrontId: string;
  channel: string;
  aiProfileGid?: string;
  apiTokenEnvKey?: StorefrontTokenEnvKey;
  privateTokenEnvKey?: PrivateStorefrontTokenEnvKey;
};

type ResolvedStorefrontConfig = StaticStorefrontConfig & {
  apiToken?: string;
  privateToken?: string;
};

type ChatContextOverride = {
  storefrontId?: string;
  channel?: string;
};

type S2SChatAuthorizationResult =
  | {
      ok: true;
      contextOverride: Required<ChatContextOverride>;
    }
  | {
      ok: false;
      response: Response;
    };

const EPIR_SHARED_SECRET_HEADER = 'X-EPIR-SHARED-SECRET';
const EPIR_STOREFRONT_HEADER = 'X-EPIR-STOREFRONT-ID';
const EPIR_CHANNEL_HEADER = 'X-EPIR-CHANNEL';

function hasAppProxySignature(request: Request, url: URL): boolean {
  return Boolean(
    request.headers.get('x-shopify-hmac-sha256') ||
      url.searchParams.get('signature') ||
      url.searchParams.get('hmac')
  );
}

async function authorizeAppProxyRequest(request: Request, env: Env): Promise<Response | null> {
  if (!env.SHOPIFY_APP_SECRET) {
    return new Response('Server misconfigured', { status: 500, headers: cors(env, request) });
  }

  const result = await verifyAppProxyHmac(request.clone(), env.SHOPIFY_APP_SECRET);
  if (!result.ok) {
    console.warn('HMAC verification failed:', result.reason);
    return new Response('Unauthorized: Invalid HMAC signature', {
      status: 401,
      headers: cors(env, request),
    });
  }

  // [BEZPIECZEŃSTWO] Replay protection
  const url = new URL(request.url);
  const signature = url.searchParams.get('signature') ?? request.headers.get('x-shopify-hmac-sha256') ?? '';
  const timestamp = url.searchParams.get('timestamp') ?? '';
  if (signature && timestamp) {
    const doId = env.SESSION_DO.idFromName('replay-protection-global');
    const stub = env.SESSION_DO.get(doId);
    const replayResult = await replayCheck(stub, signature, timestamp);
    if (!replayResult.ok) {
      console.warn('Replay check failed:', replayResult.reason);
      return new Response('Unauthorized: Signature already used', {
        status: 401,
        headers: cors(env, request),
      });
    }
  }

  return null;
}

/** Mapowanie aliasów storefrontów na konfigurację. Na drucie używamy aliasu (np. "kazka"), wewnątrz MCP – rzeczywisty Storefront ID. */
const STOREFRONTS: Record<string, StaticStorefrontConfig> = {
  'online-store': {
    storefrontId: 'gid://shopify/Storefront/1000013955',
    channel: 'online-store',
    aiProfileGid: 'gid://shopify/Metaobject/2153911189836',
  },
  kazka: {
    storefrontId: 'gid://shopify/Storefront/1000013955', // Zastąp faktycznym ID z Headless sales channel
    channel: 'hydrogen-kazka',
    aiProfileGid: 'gid://shopify/Metaobject/2057969205580',
    apiTokenEnvKey: 'PUBLIC_STOREFRONT_API_TOKEN_KAZKA',
  },
  zareczyny: {
    storefrontId: 'gid://shopify/Storefront/1000013955',
    channel: 'hydrogen-zareczyny',
    /** Typ Admin: `ai_profile`, handle: zareczyny — opublikuj wpis (Active), inaczej Storefront zwróci null */
    aiProfileGid: 'gid://shopify/Metaobject/2117458166092',
    apiTokenEnvKey: 'PUBLIC_STOREFRONT_API_TOKEN_ZARECZYNY',
    privateTokenEnvKey: 'PRIVATE_STOREFRONT_API_TOKEN_ZARECZYNY',
  },
};

function resolveStorefrontConfig(env: Env, storefrontKey?: string): ResolvedStorefrontConfig | null {
  if (!storefrontKey) return null;
  const config = STOREFRONTS[storefrontKey];
  if (!config) return null;
  return {
    ...config,
    apiToken: config.apiTokenEnvKey
      ? env[config.apiTokenEnvKey] ?? env.SHOPIFY_STOREFRONT_TOKEN
      : env.SHOPIFY_STOREFRONT_TOKEN,
    privateToken: config.privateTokenEnvKey
      ? env[config.privateTokenEnvKey] ?? env.PRIVATE_STOREFRONT_API_TOKEN
      : env.PRIVATE_STOREFRONT_API_TOKEN,
  };
}

// Stałe konfiguracyjne
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const MAX_HISTORY_FOR_AI = 20; // Ogranicz liczbę wiadomości wysyłanych do AI
const MAX_HISTORY_IN_DO = 200; // Ogranicz przechowywanie w DO

// --- Funkcje pomocnicze i parsery (bez zmian) ---
function now(): number {
  return Date.now();
}
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
function isChatRole(value: unknown): value is ChatRole {
  return value === 'user' || value === 'assistant' || value === 'system' || value === 'tool';
}
function getTrimmedHeader(request: Request, headerName: string): string | null {
  const value = request.headers.get(headerName);
  if (!isNonEmptyString(value)) return null;
  return value.trim();
}

function timingSafeEqualText(expected: string, provided: string): boolean {
  const encoder = new TextEncoder();
  const expectedBytes = encoder.encode(expected);
  const providedBytes = encoder.encode(provided);
  if (expectedBytes.length !== providedBytes.length) return false;
  let result = 0;
  for (let i = 0; i < expectedBytes.length; i++) {
    result |= expectedBytes[i] ^ providedBytes[i];
  }
  return result === 0;
}

function verifyS2SChatRequest(request: Request, env: Env): S2SChatAuthorizationResult {
  const expectedSharedSecret = (() => {
    if (typeof env.EPIR_CHAT_SHARED_SECRET === 'string' && env.EPIR_CHAT_SHARED_SECRET.trim().length > 0) {
      return env.EPIR_CHAT_SHARED_SECRET.trim();
    }
    const legacy = env['X-EPIR-SHARED-SECRET'];
    if (typeof legacy === 'string' && legacy.trim().length > 0) {
      return legacy.trim();
    }
    return '';
  })();
  if (!expectedSharedSecret) {
    return {
      ok: false,
      response: new Response('Server misconfigured', {
        status: 500,
        headers: cors(env, request),
      }),
    };
  }

  const providedSecret = getTrimmedHeader(request, EPIR_SHARED_SECRET_HEADER);
  if (!providedSecret) {
    return {
      ok: false,
      response: new Response(`Unauthorized (missing ${EPIR_SHARED_SECRET_HEADER})`, {
        status: 401,
        headers: cors(env, request),
      }),
    };
  }

  if (!timingSafeEqualText(expectedSharedSecret, providedSecret)) {
    return {
      ok: false,
      response: new Response(`Unauthorized (invalid ${EPIR_SHARED_SECRET_HEADER})`, {
        status: 401,
        headers: cors(env, request),
      }),
    };
  }

  const storefrontId = getTrimmedHeader(request, EPIR_STOREFRONT_HEADER);
  if (!storefrontId) {
    return {
      ok: false,
      response: new Response(`Bad Request (missing ${EPIR_STOREFRONT_HEADER})`, {
        status: 400,
        headers: cors(env, request),
      }),
    };
  }

  const channel = getTrimmedHeader(request, EPIR_CHANNEL_HEADER);
  if (!channel) {
    return {
      ok: false,
      response: new Response(`Bad Request (missing ${EPIR_CHANNEL_HEADER})`, {
        status: 400,
        headers: cors(env, request),
      }),
    };
  }

  return {
    ok: true,
    contextOverride: {
      storefrontId,
      channel,
    },
  };
}

function parseChatRequestBody(
  input: unknown,
  xBrand?: string | null,
  contextOverride?: ChatContextOverride,
): ChatRequestBody | null {
  if (typeof input !== 'object' || input === null) return null;
  const maybe = input as Record<string, unknown>;
  if (!isNonEmptyString(maybe.message)) return null;
  const sessionId = typeof maybe.session_id === 'string' && maybe.session_id.length > 0 ? maybe.session_id : undefined;
  const cartId = typeof maybe.cart_id === 'string' && maybe.cart_id.length > 0 ? maybe.cart_id : undefined;
  const stream = typeof maybe.stream === 'boolean' ? maybe.stream : true; // Domyślnie włączamy stream
  const brandFromBody = typeof maybe.brand === 'string' && maybe.brand.trim().length > 0 ? maybe.brand.trim().toLowerCase() : undefined;
  const brand = brandFromBody ?? (typeof xBrand === 'string' && xBrand.trim().length > 0 ? xBrand.trim().toLowerCase() : undefined);
  // image_base64: surowy base64 lub data URI (data:image/...;base64,...)
  const rawImage = typeof maybe.image_base64 === 'string' && maybe.image_base64.trim().length > 0 ? maybe.image_base64.trim() : undefined;
  const image_base64 = rawImage ? normalizeImageBase64(rawImage) : undefined;
  const storefrontIdFromBody = typeof maybe.storefrontId === 'string' && maybe.storefrontId.trim().length > 0 ? maybe.storefrontId.trim() : undefined;
  const channelFromBody = typeof maybe.channel === 'string' && maybe.channel.trim().length > 0 ? maybe.channel.trim() : undefined;
  const storefrontFromBrand =
    !contextOverride?.storefrontId && !storefrontIdFromBody && brand && STOREFRONTS[brand]
      ? brand
      : undefined;
  const storefrontId = contextOverride?.storefrontId ?? storefrontIdFromBody ?? storefrontFromBrand;
  const inferredChannel = storefrontFromBrand ? STOREFRONTS[storefrontFromBrand]?.channel : undefined;
  const channel = contextOverride?.channel ?? channelFromBody ?? inferredChannel;
  const route = typeof maybe.route === 'string' && maybe.route.trim().length > 0 ? maybe.route.trim() : undefined;
  const collectionHandle = typeof maybe.collectionHandle === 'string' && maybe.collectionHandle.trim().length > 0 ? maybe.collectionHandle.trim() : undefined;
  return {
    message: String(maybe.message),
    session_id: sessionId,
    cart_id: cartId,
    brand,
    stream,
    image_base64,
    storefrontId,
    channel,
    route,
    collectionHandle,
  };
}

/** Normalizuje base64 do formatu data URI wymaganego przez Workers AI vision */
function normalizeImageBase64(raw: string): string {
  if (raw.startsWith('data:image/')) return raw;
  return `data:image/png;base64,${raw}`;
}
function ensureHistoryArray(input: unknown): HistoryEntry[] {
  if (typeof input === 'string' && input.trim().startsWith('[')) {
    try {
      input = JSON.parse(input);
    } catch (e) {
      console.warn('Failed to parse history string:', e);
      return [];
    }
  }
  if (!Array.isArray(input)) return [];
  const out: HistoryEntry[] = [];
  for (const candidate of input) {
    if (typeof candidate !== 'object' || candidate === null) continue;
    const raw = candidate as Record<string, unknown>;
    // Zezwalamy na 'tool' role w historii DO
    const rawToolCalls = (raw as any).tool_calls;
    const hasToolCalls = Array.isArray(rawToolCalls) && rawToolCalls.length > 0;
    const hasContent = isNonEmptyString(raw.content);
    if (!isChatRole(raw.role) || (!hasContent && !hasToolCalls)) continue;
    const ts = typeof raw.ts === 'number' ? raw.ts : now();
    const entry: HistoryEntry = {
      role: raw.role,
      content: hasContent ? String(raw.content) : '',
      ts,
    };
    if (hasToolCalls) entry.tool_calls = rawToolCalls;
    if (typeof raw.tool_call_id === 'string') entry.tool_call_id = raw.tool_call_id;
    if (typeof raw.name === 'string') entry.name = raw.name;
    out.push(entry);
  }
  return out.slice(-MAX_HISTORY_IN_DO);
}
function cors(env: Env, request?: Request): Record<string, string> {
  const requestOrigin = request?.headers.get('Origin');

  const allowedOrigins = (env.ALLOWED_ORIGINS || env.ALLOWED_ORIGIN || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  let allowOrigin = '*';

  if (requestOrigin && allowedOrigins.length > 0) {
    if (allowedOrigins.includes(requestOrigin)) {
      allowOrigin = requestOrigin;
    } else if (requestOrigin === 'null' && allowedOrigins.includes('null')) {
      allowOrigin = 'null';
    } else {
      console.warn(`[worker] ⚠️ Rejected Origin (not whitelisted): ${requestOrigin}`);
      // keep allowOrigin as '*', so browser with disallowed origin will block
    }
  } else if (!requestOrigin && allowedOrigins.length === 1 && allowedOrigins[0] !== '*') {
    // No Origin header (e.g., file://, mobile webviews). If a single whitelist is set, mirror it for predictability.
    allowOrigin = allowedOrigins[0];
  }

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': [
      'Content-Type',
      'Authorization',
      'X-Shop-Signature',
      'X-Shopify-Hmac-Sha256',
      'X-Brand',
      EPIR_SHARED_SECRET_HEADER,
      EPIR_STOREFRONT_HEADER,
      EPIR_CHANNEL_HEADER,
    ].join(','),
  };
}

function withCorsHeaders(baseHeaders: HeadersInit | undefined, env: Env, request: Request): Headers {
  const headers = new Headers(baseHeaders);
  const corsHeaders = cors(env, request);
  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }
  const vary = headers.get('Vary');
  headers.set('Vary', vary ? `${vary}, Origin` : 'Origin');
  return headers;
}

function isPixelPath(pathname: string): boolean {
  return pathname === '/pixel' || pathname.startsWith('/pixel/');
}

// ============================================================================
// DURABLE OBJECT (SessionDO)
// ============================================================================
export class SessionDO {
  private readonly state: DurableObjectState;
  private readonly env: Env;
  private history: HistoryEntry[] = [];
  private cartId: string | null = null;
  private sessionId: string | null = null;
  private lastRequestTimestamp = 0;
  private requestsInWindow = 0;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;

    this.state.blockConcurrencyWhile(async () => {
      const rawHistory = await this.state.storage.get<unknown>('history');
      const storedCartId = await this.state.storage.get<string>('cart_id');
      const storedSessionId = await this.state.storage.get<string>('session_id');
      this.history = ensureHistoryArray(rawHistory);
      if (storedCartId) {
        this.cartId = storedCartId;
      }
      if (storedSessionId) {
        this.sessionId = storedSessionId;
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (!this.rateLimitOk()) {
      return new Response('Rate limit exceeded', { status: 429 });
    }

    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method.toUpperCase();

    // GET /history
    if (method === 'GET' && pathname.endsWith('/history')) {
      return new Response(JSON.stringify(this.history), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // POST /append
    if (method === 'POST' && pathname.endsWith('/append')) {
      const payload = (await request.json().catch(() => null)) as HistoryEntry | null;
      if (!payload || !isChatRole(payload.role) || (payload.content === undefined && !payload.tool_calls)) { // Zezwól na content lub tool_calls
        return new Response('Bad Request', { status: 400 });
      }
      // Upewnij się, że content to string, nawet jeśli jest pusty (dla tool_calls)
      if (payload.content === undefined) payload.content = ""; 
      await this.append(payload);
      return new Response('ok');
    }

    // POST /set-session-id
    if (method === 'POST' && pathname.endsWith('/set-session-id')) {
        const payload = (await request.json().catch(() => null)) as { session_id?: string } | null;
         if (payload?.session_id) {
            this.sessionId = payload.session_id;
            await this.state.storage.put('session_id', payload.session_id);
            return new Response('session_id set');
         }
         return new Response('Bad Request', { status: 400 });
    }

    // POST /set-customer - attach/update recognized customer info for this session
    if (method === 'POST' && pathname.endsWith('/set-customer')) {
      const payload = (await request.json().catch(() => null)) as { customer_id?: string; first_name?: string; last_name?: string } | null;
      if (!payload || !payload.customer_id) {
        return new Response('Bad Request: customer_id required', { status: 400 });
      }
      const customer = {
        customer_id: payload.customer_id,
        first_name: payload.first_name || null,
        last_name: payload.last_name || null,
      };
      await this.state.storage.put('customer', customer);
      return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
    }

    // GET /customer - retrieve known customer info for this session
    if (method === 'GET' && pathname.endsWith('/customer')) {
      const customer = await this.state.storage.get('customer');
      return new Response(JSON.stringify({ customer: customer ?? null }), { headers: { 'Content-Type': 'application/json' } });
    }
    
    // GET /cart-id
    if (method === 'GET' && pathname.endsWith('/cart-id')) {
      return new Response(JSON.stringify({ cart_id: this.cartId }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // POST /set-cart-id
    if (method === 'POST' && pathname.endsWith('/set-cart-id')) {
      const payload = (await request.json().catch(() => null)) as { cart_id?: string } | null;
      if (!payload || typeof payload.cart_id !== 'string') {
        return new Response('Bad Request', { status: 400 });
      }
      this.cartId = payload.cart_id;
      await this.state.storage.put('cart_id', this.cartId);
      return new Response('ok');
    }

    // POST /set-storefront-context (ANALYTICS_KB: storefront_id + channel for messages_raw)
    if (method === 'POST' && pathname.endsWith('/set-storefront-context')) {
      const payload = (await request.json().catch(() => null)) as { storefront_id?: string; channel?: string } | null;
      if (payload) {
        if (typeof payload.storefront_id === 'string') {
          await this.state.storage.put('storefront_id', payload.storefront_id);
        }
        if (typeof payload.channel === 'string') {
          await this.state.storage.put('channel', payload.channel);
        }
      }
      return new Response('ok');
    }

    // POST /replay-check
    if (method === 'POST' && pathname.endsWith('/replay-check')) {
      const payload = await request.json().catch(() => null);
      const p = payload as { signature?: string; timestamp?: string } | null;
      if (!p || !p.signature || !p.timestamp) {
        return new Response(JSON.stringify({ error: 'Invalid payload' }), { status: 400 });
      }
      const { signature, timestamp } = p;
      const key = `replay:${signature}`;
      const used = await this.state.storage.get<boolean>(key);
      if (used) {
        return new Response(JSON.stringify({ used: true }), { status: 200 });
      }
      // Store with expiration (10 minutes) - use alarm or manual cleanup if needed
      await this.state.storage.put(key, true);
      return new Response(JSON.stringify({ used: false }), { status: 200 });
    }

    // POST /track-product-view (z analytics-worker)
    if (method === 'POST' && pathname.endsWith('/track-product-view')) {
      const payload = (await request.json().catch(() => null)) as { product_id?: string; product_type?: string; product_title?: string; duration?: number } | null;
      if (!payload || typeof payload.product_id !== 'string') {
        return new Response('Bad Request: product_id required', { status: 400 });
      }
      await this.trackProductView(payload.product_id, payload.product_type, payload.product_title, payload.duration || 0);
      return new Response('ok');
    }

    // POST /activate-proactive-chat (z analytics-worker)
    if (method === 'POST' && pathname.endsWith('/activate-proactive-chat')) {
        const payload = (await request.json().catch(() => null)) as { customer_id?: string; session_id?: string; reason?: string; timestamp?: number } | null;
        if (!payload || !payload.customer_id || !payload.session_id) {
            return new Response('Bad Request: customer_id and session_id required', { status: 400 });
        }
        await this.activateProactiveChat(payload.customer_id, payload.session_id, payload.reason || 'unknown', payload.timestamp || now());
        return new Response('ok');
    }

    return new Response('Not Found', { status: 404 });
  }

  private rateLimitOk(): boolean {
    const current = now();
    if (current - this.lastRequestTimestamp > RATE_LIMIT_WINDOW_MS) {
      this.requestsInWindow = 1;
      this.lastRequestTimestamp = current;
      return true;
    }
    this.requestsInWindow += 1;
    return this.requestsInWindow <= RATE_LIMIT_MAX_REQUESTS;
  }

  private async append(payload: HistoryEntry): Promise<void> {
    this.history.push({ ...payload, ts: payload.ts || now() });
    // Archiwizuj najstarsze wiadomości do D1 przed usunięciem z pamięci DO
    if (this.history.length > MAX_HISTORY_IN_DO) {
      const toArchive = this.history.slice(0, this.history.length - MAX_HISTORY_IN_DO);
      await this.archiveToD1(toArchive);
    }
    this.history = this.history.slice(-MAX_HISTORY_IN_DO);
    await this.state.storage.put('history', this.history);
  }

  /**
   * Archiwizuje wiadomości do tabeli messages w DB_CHATBOT (D1).
   * Wywoływane gdy historia przekracza limit (alarm/limit after append)
   * lub przed okresowym czyszczeniem. DB_CHATBOT jest dostępny przez this.env.
   */
  private async archiveToD1(messages: HistoryEntry[]): Promise<void> {
    if (!this.env.DB_CHATBOT || messages.length === 0) return;

    const sessionId = this.sessionId ?? this.state.id.toString();
    const db = this.env.DB_CHATBOT;
    const storefrontId = await this.state.storage.get<string>('storefront_id') ?? null;
    const channel = await this.state.storage.get<string>('channel') ?? null;

    try {
      for (const msg of messages) {
        await db
          .prepare(
            `INSERT INTO messages (session_id, role, content, timestamp, tool_calls, tool_call_id, name, storefront_id, channel)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            sessionId,
            msg.role,
            msg.content ?? '',
            msg.ts ?? now(),
            msg.tool_calls ? JSON.stringify(msg.tool_calls) : null,
            msg.tool_call_id ?? null,
            msg.name ?? null,
            storefrontId,
            channel
          )
          .run();
      }
      console.log(`[SessionDO] Archived ${messages.length} messages to D1 for session ${sessionId}`);
    } catch (error) {
      console.error('[SessionDO] Failed to archive to D1:', error);
      // Nie rzucaj – błąd archiwizacji nie powinien przerywać głównego przepływu
    }
  }

  private async trackProductView(
    productId: string,
    productType?: string,
    productTitle?: string,
    duration?: number
  ): Promise<void> {
    const productView = {
      product_id: productId,
      product_type: productType || null,
      product_title: productTitle || null,
      duration: duration || 0,
      timestamp: now(),
      session_id: this.sessionId,
    };
    await this.state.storage.put('last_product_view', productView);
    const productViews = (await this.state.storage.get<Array<any>>('product_views')) || [];
    productViews.push(productView);
    const trimmedViews = productViews.slice(-10);
    await this.state.storage.put('product_views', trimmedViews);
    console.log(`[SessionDO] 👁️ Product view tracked: ${productId} (${duration}s)`, productType);
  }

  private async activateProactiveChat(
    customerId: string,
    sessionId: string,
    reason: string,
    timestamp: number
  ): Promise<void> {
    const activationEvent = {
      customer_id: customerId,
      session_id: sessionId,
      reason: reason,
      timestamp: timestamp,
      activated: true,
    };
    await this.state.storage.put('proactive_chat_active', true);
    await this.state.storage.put('proactive_chat_event', activationEvent);
    const activationHistory = (await this.state.storage.get<Array<any>>('proactive_activations')) || [];
    activationHistory.push(activationEvent);
    const trimmed = activationHistory.slice(-5);
    await this.state.storage.put('proactive_activations', trimmed);
    console.log(`[SessionDO] 🚀 Proactive chat activated for ${customerId}/${sessionId}, reason: ${reason}`);
  }
}

// ============================================================================
// GŁÓWNY HANDLER CZATU (handleChat)
// ZMIENIONY: Usuwa logikę RAG, zawsze wywołuje streaming.
// ============================================================================
async function handleChat(
  request: Request,
  env: Env,
  contextOverride?: ChatContextOverride,
  executionCtx?: ExecutionContext,
): Promise<Response> {
  const xBrand = request.headers.get('X-Brand');
  const raw = await request.json().catch(() => null);

  // Obsługa register_client – rejestracja profilu klienta (Golden Record)
  if (raw && typeof raw === 'object' && (raw as Record<string, unknown>).type === 'register_client') {
    const reg = raw as Record<string, unknown>;
    const clientId = typeof reg.client_id === 'string' ? reg.client_id : typeof reg.clientId === 'string' ? reg.clientId : null;
    if (!clientId || !env.DB_CHATBOT) {
      return new Response(
        JSON.stringify({ error: 'register_client requires client_id and DB_CHATBOT' }),
        { status: 400, headers: { ...cors(env, request), 'Content-Type': 'application/json' } }
      );
    }
    try {
      const profileService = new ProfileService(env.DB_CHATBOT);
      const result = await profileService.updateProfile(clientId, {
        email: typeof reg.email === 'string' ? reg.email : undefined,
        phone: typeof reg.phone === 'string' ? reg.phone : undefined,
        firstName: typeof reg.firstName === 'string' ? reg.firstName : undefined,
        context: Array.isArray(reg.context) ? reg.context : undefined,
        preferences: typeof reg.preferences === 'object' && reg.preferences !== null ? (reg.preferences as Record<string, unknown>) : undefined,
      });
      return new Response(
        JSON.stringify({ ok: true, status: result.status, lead_score: result.lead_score }),
        { status: 200, headers: { ...cors(env, request), 'Content-Type': 'application/json' } }
      );
    } catch (e) {
      console.error('[handleChat] register_client error:', e);
      return new Response(
        JSON.stringify({ error: String((e as Error).message) }),
        { status: 500, headers: { ...cors(env, request), 'Content-Type': 'application/json' } }
      );
    }
  }

  const payload = parseChatRequestBody(raw, xBrand, contextOverride);
  if (!payload) {
    return new Response('Bad Request: message required', { status: 400, headers: cors(env, request) });
  }

  // [TOKEN VAULT] Bez zmian
  const url = new URL(request.url);
  const customerId = url.searchParams.get('logged_in_customer_id') || null;
  const shopId = url.searchParams.get('shop') || env.SHOP_DOMAIN;
  
  // 🔴 POPRAWKA SESJI: Używamy `payload.session_id` LUB generujemy nowy
  const sessionId = payload.session_id ?? crypto.randomUUID();
  const doId = env.SESSION_DO.idFromName(sessionId);
  const stub = env.SESSION_DO.get(doId);
  
  let customerToken: string | undefined;
  if (customerId && shopId) {
    try {
      console.log('[handleChat] 🔐 TokenVault: Generating token...');
      const tokenVaultId = env.TOKEN_VAULT_DO.idFromName('global');
      const tokenVaultStub = env.TOKEN_VAULT_DO.get(tokenVaultId);
      const vault = new TokenVault(tokenVaultStub);
      customerToken = await vault.getOrCreateToken(customerId, shopId);
      console.log('[handleChat] ✅ TokenVault: Token generated:', customerToken.substring(0, 16) + '...');
    } catch (error) {
      console.error('[handleChat] ❌ TokenVault error:', error);
    }
  } else {
    console.log('[handleChat] ⚠️ TokenVault: SKIPPED (customer not logged in or missing shop)');
  }

  // (Optional) If we recognized customerId, fetch customer profile (firstName) and store to SessionDO.
  if (customerId && stub) {
    try {
      // Call a helper in shopify-mcp-client to fetch firstName and lastName
      const { getCustomerById } = await import('./shopify-mcp-client');
      const customer = await getCustomerById(env, customerId);
      if (customer && (customer.firstName || customer.lastName)) {
        await stub.fetch('https://session/set-customer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customer_id: customerId, first_name: customer.firstName, last_name: customer.lastName }),
        });
        console.log('[handleChat] SessionDO: set customer for session:', customerId);
      }
    } catch (e) {
      console.warn('[handleChat] Unable to fetch/store customer profile:', e);
    }
  }

  // 🔴 POPRAWKA SESJI: Jeśli sesja jest NOWA, zapisujemy jej ID w DO
  if (!payload.session_id) {
      await stub.fetch('https://session/set-session-id', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId }),
      });
  }

  // Zapisz wiadomość użytkownika w DO
  await stub.fetch('https://session/append', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'user', content: payload.message, ts: now() } as HistoryEntry),
  });

  // Zapisz cart_id w DO, jeśli dostarczono
  if (payload.cart_id) {
    console.log('[handleChat] Saving cart_id to session:', payload.cart_id);
    await stub.fetch('https://session/set-cart-id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cart_id: payload.cart_id }),
    });
  }

  // Zapisz storefront_id i channel w DO (ANALYTICS_KB: dla messages_raw)
  if (payload.storefrontId || payload.channel) {
    const sfConfig = resolveStorefrontConfig(env, payload.storefrontId);
    await stub.fetch('https://session/set-storefront-context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storefront_id: payload.storefrontId ?? null,
        channel: payload.channel ?? sfConfig?.channel ?? null,
      }),
    });
  }

  // [GREETING PREFILTER] Bez zmian - dobra optymalizacja (pomijamy gdy jest obraz – vision path)
  const greetingCheck = payload.message.toLowerCase().trim();
  const greetingPattern = /^(cześć|czesc|hej|witaj|witam|dzień dobry|dzien dobry|dobry wieczór|dobry wieczor|hi|hello|hey)$/i;
  const isShortGreeting = !payload.image_base64 && greetingCheck.length < 15 && greetingPattern.test(greetingCheck);

  if (isShortGreeting) {
    const greetingReply = (payload.storefrontId === 'kazka' || payload.brand === 'kazka')
      ? 'Witaj! Jestem Aura, doradca marki Kazka Jewelry. Jak mogę Ci dzisiaj pomóc? ✨'
      : (payload.storefrontId === 'zareczyny' || payload.brand === 'zareczyny')
        ? 'Witaj! Jestem Aura, doradca pierścionków zaręczynowych EPIR. Jak mogę Ci dzisiaj pomóc? 💍'
        : 'Witaj! Jestem Aura, doradca z pracowni EPIR Art Jewellery. Jak mogę Ci dzisiaj pomóc? 🌟';
    await stub.fetch('https://session/append', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'assistant', content: greetingReply, ts: now() } as HistoryEntry),
    });

    // 🔴 POPRAWKA SESJI: Zwróć greeting, ale DOŁĄCZ session_id, aby klient mógł ją zapisać
    // (W trybie non-stream; w trybie stream jest to obsługiwane przez streamAssistantResponse)
    if (!payload.stream) {
        return new Response(JSON.stringify({ reply: greetingReply, session_id: sessionId }), {
          headers: { ...cors(env), 'Content-Type': 'application/json' },
        });
    }
    // Jeśli stream=true, przejdź do streamAssistantResponse
  }
  
  // 🔴 ZMIANA: Usunięto logikę `else` (non-streaming).
  // Zakładamy, że frontend *zawsze* obsługuje streaming (co jest prawdą wg assistant.js).
  // Zawsze wywołujemy `streamAssistantResponse`, który teraz zawiera pełną logikę Harmony.
  if (!payload.stream) {
      console.warn("[handleChat] Otrzymano żądanie non-stream, ale kod jest zoptymalizowany pod streaming. Uruchamiam stream mimo wszystko.");
  }

  console.log(`[handleChat] Przekierowanie do streamAssistantResponse dla sesji: ${sessionId}`);
  return streamAssistantResponse(request, sessionId, payload.message, stub, env, customerToken, payload.brand, payload.image_base64, {
    storefrontId: payload.storefrontId,
    channel: payload.channel,
    route: payload.route,
    collectionHandle: payload.collectionHandle,
  }, customerId, executionCtx);
}

// ============================================================================
// HANDLER STREAMINGU (streamAssistantResponse)
// KRYTYCZNA AKTUALIZACJA: Pełna implementacja pętli wywołań narzędzi (Harmony).
// ============================================================================
interface StorefrontContext {
  storefrontId?: string;
  channel?: string;
  route?: string;
  collectionHandle?: string;
}

async function streamAssistantResponse(
  request: Request,
  sessionId: string,
  userMessage: string,
  stub: DurableObjectStub,
  env: Env,
  customerToken?: string,
  brand?: string,
  imageBase64?: string,
  storefrontContext?: StorefrontContext,
  /** Shopify customer id z query App Proxy (`logged_in_customer_id`) — pamięć międzysesyjna tylko gdy ustawione */
  shopifyCustomerId?: string | null,
  executionCtx?: ExecutionContext,
): Promise<Response> {
  const { readable, writable } = new TransformStream();
  const encoder = new TextEncoder();

  // Uruchamiamy całą logikę asynchronicznie, aby natychmiast zwrócić stream
  (async () => {
    const writer = writable.getWriter();
    let history: HistoryEntry[] = []; // Historia dla tej tury
    let accumulatedResponse = ''; // Pełna odpowiedź tekstowa asystenta

    // Funkcja pomocnicza do wysyłania eventów SSE
    async function sendSSE(event: string, data: object | string) {
        const payload = typeof data === 'string' ? data : JSON.stringify(data);
        await writer.write(encoder.encode(`event: ${event}\ndata: ${payload}\n\n`));
    }
    // Funkcja pomocnicza do wysyłania fragmentów tekstu
    async function sendDelta(delta: string) {
        await writer.write(encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`));
    }

    try {
      // 🔴 KROK 1: POPRAWKA SESJI
      // Natychmiast wyślij klientowi ID sesji, aby mógł je zapisać.
      console.log(`[streamAssistant] Inicjalizacja strumienia dla sesji: ${sessionId}`);
      await sendSSE('session', { session_id: sessionId });

      // 🔴 KROK 2: POBIERZ HISTORIĘ I KONTEKST
      const historyResp = await stub.fetch('https://session/history');
      const historyData = await historyResp.json().catch(() => []);
      history = ensureHistoryArray(historyData); // Pełna historia (z rolami 'tool')

      const cartIdResp = await stub.fetch('https://session/cart-id');
      const cartIdData = (await cartIdResp.json().catch(() => ({ cart_id: null }))) as { cart_id?: string | null };
      const cartId = cartIdData.cart_id;

      let crossSessionSummary: string | null = null;
      if (shopifyCustomerId && env.DB_CHATBOT) {
        try {
          crossSessionSummary = await loadPersonMemory(env.DB_CHATBOT, shopifyCustomerId);
        } catch (e) {
          console.warn('[person_memory] load failed:', e);
        }
      }

      const maybeRefreshPersonMemory = () => {
        if (!shopifyCustomerId || !env.DB_CHATBOT || !executionCtx) return;
        executionCtx.waitUntil(
          (async () => {
            try {
              const histResp = await stub.fetch('https://session/history');
              const historyData = await histResp.json().catch(() => []);
              const hist = ensureHistoryArray(historyData);
              const snippet = historyToPlainText(hist);
              if (!snippet.trim()) return;
              const prev = await loadPersonMemory(env.DB_CHATBOT!, shopifyCustomerId);
              const merged = await mergeSessionIntoPersonSummary(env, prev, snippet);
              await upsertPersonMemory(env.DB_CHATBOT!, shopifyCustomerId, merged);
            } catch (e) {
              console.error('[person_memory] refresh failed:', e);
            }
          })(),
        );
      };

      // 🔴 KROK 3: ZBUDUJ WIADOMOŚCI DLA AI (Z LOGIKĄ RAG WORKER)
      
      // Filtrujemy historię, aby usunąć pola, których AI nie rozumie
      const aiHistory = history
        .slice(-MAX_HISTORY_FOR_AI) // Weź tylko X ostatnich wiadomości
        .map(h => ({
            role: h.role,
            content: h.content ?? '',
            ...(h.role === 'tool' && h.name && { name: h.name }),
            ...(h.role === 'tool' && h.tool_call_id && { tool_call_id: h.tool_call_id }),
            ...(h.tool_calls && { tool_calls: h.tool_calls as any }),
        }));
        
      // run_analytics_query tylko gdy channel === "internal-dashboard" (MUST z planu)
      const schemasToUse = storefrontContext?.channel === 'internal-dashboard'
        ? Object.values(TOOL_SCHEMAS)
        : Object.values(TOOL_SCHEMAS).filter((s) => s.name !== 'run_analytics_query');
      const toolDefinitions = schemasToUse.map((schema) => ({
        type: 'function' as const,
        function: {
          name: schema.name,
          description: schema.description,
          parameters: schema.parameters,
        },
      }));

      const toolSchemaString = JSON.stringify(toolDefinitions, null, 2);
      const activeStorefrontConfig = resolveStorefrontConfig(env, storefrontContext?.storefrontId);
      const aiProfileToken = activeStorefrontConfig?.privateToken ?? activeStorefrontConfig?.apiToken;
      const aiProfile = await fetchAIProfile(
        activeStorefrontConfig?.aiProfileGid,
        aiProfileToken,
        env.SHOP_DOMAIN
      );
      const aiProfilePrompt = aiProfile ? buildAIProfilePrompt(aiProfile) : null;

      if (activeStorefrontConfig?.aiProfileGid && !aiProfile) {
        console.warn(
          `[streamAssistant] AI profile unavailable for storefront ${storefrontContext?.storefrontId ?? 'unknown'}; fallback to base prompt`
        );
      }

      const messages: GroqMessage[] = [
        { role: 'system', content: LUXURY_SYSTEM_PROMPT },
        ...(aiProfilePrompt ? [{ role: 'system' as const, content: aiProfilePrompt }] : []),
        { role: 'system', content: `Oto dostępne schematy narzędzi:\n${toolSchemaString}` },
      ];

      // Dodaj kontekst systemowy (jeśli istnieje)
      if (cartId) {
        messages.push({ role: 'system', content: `Kontekst systemowy: Aktualny cart_id sesji to: ${cartId}` });
      }
      if (customerToken) {
        messages.push({ role: 'system', content: `Kontekst systemowy: Klient jest zalogowany. Jego anonimowy token to: ${customerToken}` });
      }
      // Kontekst storefrontu (kazka, zareczyny) – baza wiedzy segmentowana
      if (storefrontContext?.storefrontId || storefrontContext?.channel) {
        const sfKey = storefrontContext.storefrontId;
        const sfConfig = resolveStorefrontConfig(env, sfKey);
        const ctxParts: string[] = [
          `storefrontId: ${storefrontContext.storefrontId ?? 'nieokreślony'}`,
          `channel: ${storefrontContext.channel ?? sfConfig?.channel ?? 'nieokreślony'}`,
        ];
        if (storefrontContext.route) ctxParts.push(`route: ${storefrontContext.route}`);
        if (storefrontContext.collectionHandle) ctxParts.push(`collectionHandle: ${storefrontContext.collectionHandle}`);
        if (sfKey === 'kazka') {
          ctxParts.push('Odpowiadaj w kontekście marki Kazka Jewelry – kamienie szlachetne, biżuteria artystyczna.');
        } else if (sfKey === 'zareczyny') {
          ctxParts.push('Odpowiadaj w kontekście pierścionków zaręczynowych EPIR.');
        }
        messages.push({ role: 'system', content: `Kontekst storefrontu: ${ctxParts.join(', ')}` });
      }

      if (crossSessionSummary) {
        messages.push({
          role: 'system',
          content: `Kontekst systemowy — zapamiętane z wcześniejszych wizyt (skrót): ${crossSessionSummary}`,
        });
      }

      // 🔴 KROK 3b: ZDELEGUJ LOGIKĘ RAG DO RAG_WORKER
      // Zamiast błędnie wykonywać RAG tutaj, pozwalamy AI zdecydować, czy go potrzebuje.
      // Jeśli AI wywoła `search_shop_catalog` lub `search_shop_policies_and_faqs`,
      // `callMcpToolDirect` w `mcp_server.ts` poprawnie wywoła `RAG_WORKER`.
      
      // W `index.ts` (stara wersja) była błędna logika RAG. Teraz jej nie ma.
      // AI samo zdecyduje o wywołaniu narzędzi RAG (search_..._catalog/policies).

      messages.push(...aiHistory);
      // Wiadomość użytkownika (ostatnia) jest już w `aiHistory`

      // 🟢 KROK 3c: TRUNCATE HISTORY - zredukuj długość kontekstu przed wysłaniem do AI
      // Cel: Zapobiegaj overflow kontekstu, oszczędzaj tokeny, zwiększ szybkość
      const messagesForTruncate: HistoryMessage[] = messages.map((m) => ({
        role: m.role as HistoryMessage['role'],
        content: m.content ?? '',
        ...(m.tool_calls && { tool_calls: m.tool_calls }),
        ...(m.tool_call_id && { tool_call_id: m.tool_call_id }),
        ...(m.name && { name: m.name }),
      }));
      const truncatedMessages: GroqMessage[] = truncateWithSummary(messagesForTruncate, 8000, 12).map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.tool_calls && { tool_calls: m.tool_calls }),
        ...(m.tool_call_id && { tool_call_id: m.tool_call_id }),
        ...(m.name && { name: m.name }),
      }));
      
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`[streamAssistant] Rozpoczynam pętlę AI. Sesja: ${sessionId}`);
      console.log('[streamAssistant] 🤖 Model:', imageBase64 ? 'Workers AI Vision' : (env.USE_WORKERS_AI ? 'Workers AI (A/B)' : GROQ_MODEL_ID));
      console.log('[streamAssistant] 📜 System Prompt length:', LUXURY_SYSTEM_PROMPT.length + (aiProfilePrompt?.length ?? 0), 'chars');
      console.log('[streamAssistant] 📚 History entries (before truncation):', aiHistory.length);
      console.log('[streamAssistant] 📨 Total messages (after truncation):', truncatedMessages.length);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      // 🟢 ŚCIEŻKA VISION: gdy image_base64, używamy Workers AI vision (bez tool_calls)
      if (imageBase64 && env.AI?.run) {
        const visionMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
          { role: 'system', content: LUXURY_SYSTEM_PROMPT },
          ...(aiProfilePrompt ? [{ role: 'system' as const, content: aiProfilePrompt }] : []),
          ...(crossSessionSummary
            ? [
                {
                  role: 'system' as const,
                  content: `Kontekst systemowy — zapamiętane z wcześniejszych wizyt (skrót): ${crossSessionSummary}`,
                },
              ]
            : []),
          { role: 'user', content: userMessage },
        ];
        const visionStream = await streamVisionEvents(visionMessages, imageBase64, env);
        const visionReader = visionStream.getReader();
        let visionText = '';
        while (true) {
          const { done, value: event } = await visionReader.read();
          if (done) break;
          if (event.type === 'text') visionText += event.delta;
        }
        if (visionText) await sendDelta(visionText);
        await writer.write(encoder.encode('data: [DONE]\n\n'));
        if (visionText.trim()) {
          await stub.fetch('https://session/append', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: 'assistant', content: visionText, ts: now() } as HistoryEntry),
          });
        }
        maybeRefreshPersonMemory();
        return;
      }

      if (imageBase64 && !env.AI?.run) {
        throw new Error('Vision requires Workers AI binding. Add [ai] binding in wrangler.toml.');
      }

      // Weryfikacja klucza Groq
      const groqKey = typeof env.GROQ_API_KEY === 'string' ? env.GROQ_API_KEY.trim() : '';
      if (!groqKey) {
        throw new Error('AI service temporarily unavailable (Missing GROQ_API_KEY)');
      }

      // 🔴 KROK 4: PĘTLA WYWOŁAŃ NARZĘDZI (native tool_calls)
      let currentMessages: GroqMessage[] = truncatedMessages; // 🟢 Używamy obciętej historii
      const MAX_TOOL_CALLS = 5;
      
      // 🔴 FIX: accumulatedResponse poza pętlą - nie resetuj w każdej iteracji
      let finalTextResponse = ''; 

      for (let i = 0; i < MAX_TOOL_CALLS; i++) {
        const groqStream = await streamGroqEvents(currentMessages, env, toolDefinitions);
        const reader = groqStream.getReader();
        let iterationText = ''; // Tymczasowy buffer dla tej iteracji
        const pendingToolCalls = new Map<string, { id: string; name: string; arguments: string }>();
        let finishReason: string | null = null;

        while (true) {
          const { done, value: event } = await reader.read();
          if (done) break;

          switch (event.type) {
              case 'text':
                iterationText += event.delta;
              break;

            case 'tool_call':
              console.log(`[streamAssistant] 🤖 Wykryto wywołanie narzędzia: ${event.call.name}`);
              pendingToolCalls.set(event.call.id, event.call);
              break;

            case 'usage':
              console.log(`[streamAssistant] 📊 Statystyki użycia: ${JSON.stringify(event)}`);
              break;

            case 'done':
              finishReason = event.finish_reason ?? finishReason;
              break;
          }
        } // koniec while(reader)

        const detectedToolCalls = Array.from(pendingToolCalls.values());

        if (detectedToolCalls.length > 0 || finishReason === 'tool_calls') {
          const toolCallEntries = detectedToolCalls.map((call) => ({
            id: call.id,
            type: 'function' as const,
            function: { name: call.name, arguments: call.arguments },
          }));

          const assistantToolCallEntry: HistoryEntry = {
            role: 'assistant',
            content: '',
            tool_calls: toolCallEntries,
            ts: now(),
          };
          await stub.fetch('https://session/append', {
            method: 'POST',
            body: JSON.stringify(assistantToolCallEntry),
          });

          currentMessages.push({
            role: 'assistant',
            content: null,
            tool_calls: toolCallEntries,
          });

          await sendSSE('tool_call', { tool_call: toolCallEntries.map((t) => ({ id: t.id, name: t.function.name })) });
          await sendSSE('status', { message: `Używam narzędzia: ${toolCallEntries.map((t) => t.function.name).join(', ')}...` });

          for (const call of detectedToolCalls) {
            let parsedArgs: any = {};
            try {
              parsedArgs = call.arguments ? JSON.parse(call.arguments) : {};
            } catch (e) {
              console.warn('[streamAssistant] ⚠️ Nie udało się sparsować argumentów narzędzia, używam pustego obiektu', { error: e, raw: call.arguments });
              parsedArgs = {};
            }

            console.log(`[streamAssistant] 🛠️ Wykonuję narzędzie: ${call.name} z argumentami:`, parsedArgs);
            let toolResult: { result?: unknown; error?: unknown };
            if (call.name === 'run_analytics_query') {
              toolResult = await runAnalyticsQuery(env, parsedArgs);
            } else {
              const brandForMcp = (storefrontContext?.storefrontId === 'kazka' || storefrontContext?.storefrontId === 'zareczyny')
                ? storefrontContext.storefrontId
                : brand;
              toolResult = await callMcpToolDirect(env, call.name, parsedArgs, brandForMcp);
            }
            const toolResultString = JSON.stringify(toolResult.error ? toolResult : toolResult.result);

            console.log(`[streamAssistant] 🛠️ Wynik narzędzia ${call.name}: ${toolResultString.substring(0, 100)}...`);

            const toolMessage: GroqMessage = {
              role: 'tool',
              name: call.name,
              tool_call_id: call.id,
              content: toolResultString,
            };
            currentMessages.push(toolMessage);
            
            await stub.fetch('https://session/append', {
              method: 'POST',
              body: JSON.stringify({ ...toolMessage, ts: now() } as HistoryEntry),
            });
          }
          
          // Kontynuuj pętlę for, aby ponownie wywołać AI
          continue; 

        } else {
          // NIE - To była finalna odpowiedź tekstowa (bez wywołań narzędzi)
          // Wysyłamy akumulowany tekst do klienta i ustawiamy jako finalny.
          finalTextResponse = iterationText;
          if (iterationText) {
            // Prześlij cały tekst tej iteracji (delta) do klienta w jednym evencie.
            await sendDelta(iterationText);
          }
          break; // Wyjdź z pętli for
        }
      } // koniec for(MAX_TOOL_CALLS)

      // Fallback: jeżeli model wielokrotnie wywoływał narzędzia i nie zwrócił tekstu,
      // domykamy odpowiedź jednym zapytaniem non-stream bez narzędzi.
      if (!finalTextResponse.trim()) {
        console.warn('[streamAssistant] ⚠️ Brak finalnego tekstu po pętli tool_calls. Uruchamiam fallback getGroqResponse().');
        try {
          const recoveryText = await getGroqResponse(currentMessages, env);
          if (typeof recoveryText === 'string' && recoveryText.trim()) {
            finalTextResponse = recoveryText;
            await sendDelta(finalTextResponse);
          }
        } catch (recoveryErr) {
          console.error('[streamAssistant] ❌ Fallback getGroqResponse failed:', recoveryErr);
        }
      }

      // Ostateczny fallback UX – nie kończ strumienia pustą odpowiedzią.
      if (!finalTextResponse.trim()) {
        finalTextResponse =
          'Przepraszam, chwilowo nie mogę przygotować pełnej odpowiedzi. Spróbuj proszę ponownie za moment.';
        await sendDelta(finalTextResponse);
      }

      // 🔴 KROK 5: FINALIZACJA I ZAPIS
      console.log('[streamAssistant] ✅ Strumień zakończony. Finalna odpowiedź (tekst):', finalTextResponse.substring(0, 100));
      await writer.write(encoder.encode('data: [DONE]\n\n'));

      // Zapisz finalną odpowiedź asystenta do DO
      if (finalTextResponse.trim()) {
        await stub.fetch('https://session/append', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role: 'assistant',
            content: finalTextResponse,
            ts: now(),
          } as HistoryEntry),
        });
      }

      maybeRefreshPersonMemory();

    } catch (err) {
      console.error('Error in streamAssistantResponse:', err);
      try {
        const errorMsg = `event: error\ndata: ${JSON.stringify({ error: String(err) })}\n\n`;
        await writer.write(encoder.encode(errorMsg));
      } catch (writeErr) {
        console.error('Failed to write error to stream:', writeErr);
      }
    } finally {
      writer.close();
    }
  })(); // koniec bloku async

  // Natychmiast zwróć strumień do klienta
  return new Response(readable, {
    headers: {
      ...cors(env, request),
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

// ============================================================================
// GŁÓWNY EXPORT WORKERA
// ============================================================================
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method.toUpperCase();

    // 1. Proxy /pixel – na początku, przed routingiem czatu (Gateway pattern)
    if (isPixelPath(pathname)) {
      // OPTIONS (preflight CORS) – zwróć CORS headers
      if (method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: withCorsHeaders(undefined, env, request),
        });
      }

      try {
        // Utrzymujemy ścieżkę `/pixel*`, ale podmieniamy host na upstream analytics.
        const analyticsUrl = `https://analytics.internal${pathname}${url.search}`;
        const upstreamRequest = new Request(analyticsUrl, request);

        const proxied = env.ANALYTICS_WORKER
          ? await env.ANALYTICS_WORKER.fetch(upstreamRequest)
          : await fetch(
              `https://epir-analityc-worker.krzysztofdzugaj.workers.dev${pathname}${url.search}`,
              upstreamRequest,
            );

        return new Response(proxied.body, {
          status: proxied.status,
          statusText: proxied.statusText,
          headers: withCorsHeaders(proxied.headers, env, request),
        });
      } catch (error) {
        console.error('[worker] /pixel proxy failed', error);
        return new Response(JSON.stringify({ ok: false, error: 'pixel_proxy_unavailable' }), {
          status: 502,
          headers: withCorsHeaders({ 'Content-Type': 'application/json' }, env, request),
        });
      }
    }

    // Global OPTIONS (dla pozostałych ścieżek)
    if (method === 'OPTIONS') {
      return new Response(null, { headers: cors(env, request) });
    }

    // Healthcheck
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/ping' || url.pathname === '/health')) {
      return new Response('ok', { status: 200, headers: cors(env, request) });
    }

    // Dashboard leadów (Agent Command Center)
    if (url.pathname === '/admin/dashboard' && request.method === 'GET') {
      return new Response(DASHBOARD_HTML, {
        headers: { 'Content-Type': 'text/html; charset=utf-8', ...cors(env, request) },
      });
    }
    if (url.pathname === '/admin/api/leads' && request.method === 'GET') {
      const adminKey = request.headers.get('X-Admin-Key') || url.searchParams.get('key');
      if (!env.ADMIN_KEY || adminKey !== env.ADMIN_KEY) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...cors(env, request) },
        });
      }
      if (!env.DB_CHATBOT) {
        return new Response(JSON.stringify({ error: 'DB_CHATBOT not configured' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...cors(env, request) },
        });
      }
      try {
        const service = new AnalyticsService(env.DB_CHATBOT);
        const [leads, stats] = await Promise.all([
          service.getHotLeads(20),
          service.getDailyStats(),
        ]);
        return new Response(
          JSON.stringify({ leads, stats }),
          { status: 200, headers: { 'Content-Type': 'application/json', ...cors(env, request) } }
        );
      } catch (e) {
        console.error('[admin/api/leads]', e);
        return new Response(
          JSON.stringify({ error: String((e as Error).message) }),
          { status: 500, headers: { 'Content-Type': 'application/json', ...cors(env, request) } }
        );
      }
    }

    // [BEZPIECZEŃSTWO] Globalny strażnik HMAC dla App Proxy
    if (url.pathname.startsWith('/apps/assistant/') && request.method === 'POST') {
      const appProxyAuthError = await authorizeAppProxyRequest(request, env);
      if (appProxyAuthError) {
        return appProxyAuthError;
      }
    }

    // Endpoint czatu (zabezpieczony przez App Proxy)
    if (url.pathname === '/apps/assistant/chat' && request.method === 'POST') {
      return handleChat(request, env, undefined, ctx);
    }

    // Endpoint czatu headless / BFF – zabezpieczony shared secret + headers kontekstowe.
    // Uwaga: Shopify App Proxy przekazuje /apps/assistant/chat jako /chat do backendu
    // i dodaje podpis HMAC w query/headerach.
    if (url.pathname === '/chat' && request.method === 'POST') {
      if (hasAppProxySignature(request, url)) {
        const appProxyAuthError = await authorizeAppProxyRequest(request, env);
        if (appProxyAuthError) {
          return appProxyAuthError;
        }
        return handleChat(request, env, undefined, ctx);
      }

      const s2sResult = verifyS2SChatRequest(request, env);
      if (!s2sResult.ok) {
        return s2sResult.response;
      }
      return handleChat(request, env, s2sResult.contextOverride, ctx);
    }

    // Endpoint serwera MCP (JSON-RPC 2.0)
    if (
      request.method === 'POST' &&
      (url.pathname === '/mcp/tools/call' || url.pathname === '/mcp/tools/list' || url.pathname === '/apps/assistant/mcp')
    ) {
      return handleMcpRequest(request, env);
    }

    return new Response('Not Found', { status: 404, headers: cors(env, request) });
  },
};

// Eksportujemy klasy DO, aby Cloudflare mógł je rozpoznać
export { RateLimiterDO } from './rate-limiter';
export { TokenVaultDO } from './token-vault';

// Eksporty dla testów (jeśli używane)
export {
  parseChatRequestBody,
  ensureHistoryArray,
  cors,
  handleChat,
  verifyAppProxyHmac,
  handleMcpRequest,
  getGroqResponse,
};
