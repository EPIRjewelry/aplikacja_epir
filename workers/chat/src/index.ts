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
 * Teraz to AI decyduje, kiedy wywołać narzędzia (jak search_catalog)
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
  getGroqResponse,
  GroqMessage,
  KimiContentPart,
  shouldUseWorkersAi,
  injectKimiMultimodalUserContent,
} from './ai-client';
import { CHAT_MODEL_ID } from './config/model-params';
import { INTERNAL_DASHBOARD_SYSTEM_PROMPT } from './prompts/internal-dashboard-system-prompt';
import { LUXURY_SYSTEM_PROMPT } from './prompts/luxury-system-prompt'; // 🟢 Używa nowego promptu v2
import { TOOL_SCHEMAS } from './mcp_tools'; // 🔵 Używa poprawionych schematów v2
import { truncateWithSummary, type Message as HistoryMessage } from './utils/history'; // 🔵 History truncation
import { stripLeakedToolCallsLiterals } from './utils/stripLeakedToolCallsLiterals';
import { executeToolWithParsedArguments } from './utils/tool-call-args';
import { callMcpToolDirect, handleMcpRequest } from './mcp_server';
import { STOREFRONTS, resolveStorefrontConfig } from './config/storefronts';

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
  loadPersonMemoryRecord,
  upsertPersonMemoryVersioned,
  historyToPlainText,
  mergeSessionIntoPersonSummary,
} from './person-memory';
import { handleConsentAppProxy, handleConsentS2S } from './consent';

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
  message_uid?: string;
}

interface ChatRequestBody {
  message: string;
  session_id?: string;
  cart_id?: string;
  brand?: string;
  stream?: boolean;
  /** Multimodal (workers-ai-provider / widget): text + opcjonalny plik */
  parts?: Array<{ type: string; text?: string; data?: string; mediaType?: string }>;
  /** Obraz w base64 — multimodal w tym samym modelu Kimi K2.5 */
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

const IMAGE_ATTACHMENT_PLACEHOLDER = '(załącznik obrazu)';

type ChatContextOverride = {
  storefrontId?: string;
  channel?: string;
  brand?: string;
};

type RequiredRoutingContext = Required<Pick<ChatContextOverride, 'storefrontId' | 'channel'>> & Pick<ChatContextOverride, 'brand'>;

type S2SChatAuthorizationResult =
  | {
      ok: true;
      contextOverride: RequiredRoutingContext;
    }
  | {
      ok: false;
      response: Response;
    };

const EPIR_SHARED_SECRET_HEADER = 'X-EPIR-SHARED-SECRET';
const EPIR_STOREFRONT_HEADER = 'X-EPIR-STOREFRONT-ID';
const EPIR_CHANNEL_HEADER = 'X-EPIR-CHANNEL';
const APP_PROXY_CHAT_CONTEXT_OVERRIDE: Required<ChatContextOverride> = {
  storefrontId: 'online-store',
  channel: 'online-store',
  brand: 'epir',
};

function getSystemPromptForChannel(channel?: string): string {
  return channel === 'internal-dashboard'
    ? INTERNAL_DASHBOARD_SYSTEM_PROMPT
    : LUXURY_SYSTEM_PROMPT;
}

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
  const querySignature = url.searchParams.get('signature');
  const signature = querySignature ?? request.headers.get('x-shopify-hmac-sha256') ?? '';
  const timestamp = url.searchParams.get('timestamp') ?? '';
  const isShopifyQuerySignature = Boolean(querySignature);

  // Shopify App Proxy signatures (query `signature`) can legitimately repeat across requests.
  // Enforcing one-time replay for query signature causes false-positive 401 in normal storefront chat usage.
  // Keep replay protection for header-based signatures only.
  if (signature && timestamp && !isShopifyQuerySignature) {
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

// Stałe konfiguracyjne
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const MAX_HISTORY_FOR_AI = 20; // Ogranicz liczbę wiadomości wysyłanych do AI
const MAX_HISTORY_IN_DO = 200; // Ogranicz przechowywanie w DO
const PERSON_MEMORY_LOCK_TTL_MS = 15_000;
const PERSON_MEMORY_RECENT_TTL_MS = 5 * 60_000;

// --- Funkcje pomocnicze i parsery (bez zmian) ---
function now(): number {
  return Date.now();
}
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

type EffectiveShopifyCustomerIdResolution = {
  customerId: string | null;
  source: 'request' | 'session' | 'none';
};

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveEffectiveShopifyCustomerId(
  requestCustomerId?: string | null,
  sessionCustomerId?: string | null,
): EffectiveShopifyCustomerIdResolution {
  const requestCustomer = normalizeOptionalString(requestCustomerId);
  if (requestCustomer) {
    return {
      customerId: requestCustomer,
      source: 'request',
    };
  }

  const sessionCustomer = normalizeOptionalString(sessionCustomerId);
  if (sessionCustomer) {
    return {
      customerId: sessionCustomer,
      source: 'session',
    };
  }

  return {
    customerId: null,
    source: 'none',
  };
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


function parseHistoryRequestBody(input: unknown): { session_id: string } | null {
  if (typeof input !== 'object' || input === null) return null;
  const maybe = input as Record<string, unknown>;
  const sessionId = typeof maybe.session_id === 'string' ? maybe.session_id.trim() : '';
  if (!sessionId) return null;
  return { session_id: sessionId };
}

function normalizeHistoryForUi(history: HistoryEntry[]): Array<{ role: 'user' | 'assistant'; content: string }> {
  return history
    .filter((entry) => entry.role === 'user' || entry.role === 'assistant')
    .map((entry) => ({
      role: entry.role as 'user' | 'assistant',
      content: typeof entry.content === 'string' ? entry.content.trim() : '',
    }))
    .filter((entry) => entry.content.length > 0);
}

async function handleHistoryRequest(request: Request, env: Env): Promise<Response> {
  const raw = await request.json().catch(() => null);
  const payload = parseHistoryRequestBody(raw);
  if (!payload) {
    return new Response('Bad Request: session_id required', {
      status: 400,
      headers: cors(env, request),
    });
  }

  const doId = env.SESSION_DO.idFromName(payload.session_id);
  const stub = env.SESSION_DO.get(doId);

  let historyRaw: unknown;
  try {
    const historyResp = await stub.fetch('https://session/history');
    if (!historyResp.ok) {
      throw new Error(`Session history returned ${historyResp.status}`);
    }
    historyRaw = await historyResp.json().catch(() => []);
  } catch (error) {
    console.error('[handleHistory] Failed to fetch session history', error);
    return new Response(JSON.stringify({ error: 'history_unavailable' }), {
      status: 502,
      headers: {
        ...cors(env, request),
        'Content-Type': 'application/json',
      },
    });
  }

  const history = normalizeHistoryForUi(ensureHistoryArray(historyRaw));
  return new Response(JSON.stringify({ session_id: payload.session_id, history }), {
    status: 200,
    headers: {
      ...cors(env, request),
      'Content-Type': 'application/json',
    },
  });
}

/** Parsuje tablicę `parts` (AI SDK v6 / widget): text + opcjonalny file (base64). */
function extractFromPartsArray(parts: unknown): { text: string; imageRaw?: string; mediaType?: string } | null {
  if (!Array.isArray(parts) || parts.length === 0) return null;
  let text = '';
  let imageRaw: string | undefined;
  let mediaType: string | undefined;
  for (const p of parts) {
    if (typeof p !== 'object' || p === null) continue;
    const o = p as Record<string, unknown>;
    if (o.type === 'text' && typeof o.text === 'string') {
      text += o.text;
    }
    if (o.type === 'file' && typeof o.data === 'string' && o.data.trim().length > 0) {
      imageRaw = o.data.trim();
      mediaType = typeof o.mediaType === 'string' && o.mediaType.trim().length > 0 ? o.mediaType.trim() : 'image/jpeg';
    }
  }
  const textTrim = text.trim();
  if (!textTrim && !imageRaw) return null;
  return { text: textTrim, imageRaw, mediaType };
}

function parseChatRequestBody(
  input: unknown,
  xBrand?: string | null,
  contextOverride?: ChatContextOverride,
): ChatRequestBody | null {
  if (typeof input !== 'object' || input === null) return null;
  const maybe = input as Record<string, unknown>;
  const fromParts = extractFromPartsArray(maybe.parts);
  const messageField = isNonEmptyString(maybe.message) ? String(maybe.message).trim() : '';
  const messageText = messageField.length > 0 ? messageField : (fromParts?.text ?? '');
  const hasLegacyImage =
    typeof maybe.image_base64 === 'string' && maybe.image_base64.trim().length > 0;
  if (!messageText && !fromParts?.imageRaw && !hasLegacyImage) {
    return null;
  }
  const sessionId = typeof maybe.session_id === 'string' && maybe.session_id.length > 0 ? maybe.session_id : undefined;
  const cartId = typeof maybe.cart_id === 'string' && maybe.cart_id.length > 0 ? maybe.cart_id : undefined;
  const stream = typeof maybe.stream === 'boolean' ? maybe.stream : true; // Domyślnie włączamy stream
  const brandFromBody = typeof maybe.brand === 'string' && maybe.brand.trim().length > 0 ? maybe.brand.trim().toLowerCase() : undefined;
  const brand = contextOverride?.brand
    ?? brandFromBody
    ?? (typeof xBrand === 'string' && xBrand.trim().length > 0 ? xBrand.trim().toLowerCase() : undefined);
  const rawImageLegacy = hasLegacyImage ? String(maybe.image_base64).trim() : undefined;
  const rawFromParts = fromParts?.imageRaw;
  const rawImage = rawImageLegacy ?? rawFromParts;
  let image_base64: string | undefined;
  if (rawImage) {
    if (rawImage.startsWith('data:image/')) {
      image_base64 = rawImage;
    } else if (rawFromParts && fromParts?.mediaType && fromParts.mediaType.startsWith('image/')) {
      image_base64 = `data:${fromParts.mediaType};base64,${rawImage}`;
    } else {
      image_base64 = normalizeImageBase64(rawImage);
    }
  }
  const resolvedMessage = messageText || (image_base64 ? IMAGE_ATTACHMENT_PLACEHOLDER : '');
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
    message: resolvedMessage,
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

/** Normalizuje base64 do formatu data URI wymaganego przez Workers AI (multimodal Kimi) */
function normalizeImageBase64(raw: string): string {
  if (raw.startsWith('data:image/')) return raw;
  return `data:image/png;base64,${raw}`;
}

function normalizeImageCaption(rawCaption: string): string {
  return String(rawCaption || '')
    .replace(/\s+/g, ' ')
    .replace(/^opis\s*(zdjęcia|obrazu)?\s*[:\-]\s*/i, '')
    .trim()
    .slice(0, 360);
}

async function generateImageCaption(
  env: Env,
  sessionId: string,
  imageBase64: string,
  userMessage: string,
): Promise<string | null> {
  const userContext = userMessage.trim();
  const userParts: KimiContentPart[] = [];
  if (userContext && userContext !== IMAGE_ATTACHMENT_PLACEHOLDER) {
    userParts.push({ type: 'text', text: `Kontekst wiadomości użytkownika: ${userContext}` });
  }
  userParts.push({
    type: 'text',
    text:
      'Opisz to zdjęcie po polsku w maksymalnie dwóch krótkich zdaniach. Opis ma być neutralny, konkretny i bez domysłów.',
  });
  userParts.push({ type: 'image_url', image_url: { url: imageBase64 } });

  const captionPrompt: GroqMessage[] = [
    {
      role: 'system',
      content:
        'Tworzysz krótki opis obrazu do pamięci rozmowy. Nie zadawaj pytań, nie dodawaj porad zakupowych, nie zgaduj niepewnych szczegółów.',
    },
    { role: 'user', content: userParts },
  ];

  try {
    const raw = await getGroqResponse(captionPrompt, env, {
      max_tokens: 120,
      sessionId: `${sessionId}_img_caption`,
    });
    const normalized = normalizeImageCaption(raw);
    return normalized || null;
  } catch (error) {
    console.warn('[image_caption] failed:', error);
    return null;
  }
}

function buildImageSurrogateContent(userMessage: string, caption: string): string {
  const normalizedCaption = normalizeImageCaption(caption);
  const normalizedUser = userMessage.trim();
  if (!normalizedCaption) return normalizedUser || IMAGE_ATTACHMENT_PLACEHOLDER;
  if (normalizedUser && normalizedUser !== IMAGE_ATTACHMENT_PLACEHOLDER) {
    return `${normalizedUser}\n[Opis załączonego zdjęcia: ${normalizedCaption}]`;
  }
  return `Użytkownik przesłał zdjęcie. Opis: ${normalizedCaption}`;
}

const CHAT_ATTACHMENT_EMBEDDING_MODEL = '@cf/baai/bge-large-en-v1.5';
let chatAttachmentEmbeddingsSchemaReady: Promise<void> | null = null;

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function ensureChatAttachmentEmbeddingsTable(db: D1Database): Promise<void> {
  if (!chatAttachmentEmbeddingsSchemaReady) {
    chatAttachmentEmbeddingsSchemaReady = (async () => {
      await db
        .prepare(
          `CREATE TABLE IF NOT EXISTS chat_attachment_embeddings (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            message_ts INTEGER NOT NULL,
            content_hash TEXT NOT NULL,
            caption_text TEXT NOT NULL,
            embedding_model TEXT NOT NULL,
            embedding_json TEXT NOT NULL,
            storefront_id TEXT,
            channel TEXT,
            created_at INTEGER NOT NULL
          )`,
        )
        .run();
      await db
        .prepare(
          `CREATE INDEX IF NOT EXISTS idx_chat_attachment_embeddings_session
           ON chat_attachment_embeddings(session_id, created_at DESC)`,
        )
        .run();
      await db
        .prepare(
          `CREATE INDEX IF NOT EXISTS idx_chat_attachment_embeddings_hash
           ON chat_attachment_embeddings(content_hash)`,
        )
        .run();
    })().catch((error) => {
      chatAttachmentEmbeddingsSchemaReady = null;
      throw error;
    });
  }
  await chatAttachmentEmbeddingsSchemaReady;
}

async function embedCaptionTextForAnalytics(env: Env, caption: string): Promise<number[] | null> {
  if (!env.AI?.run) return null;
  try {
    const res = (await env.AI.run(CHAT_ATTACHMENT_EMBEDDING_MODEL, {
      text: [caption],
    })) as { data?: unknown[] };
    const maybeVector = res?.data?.[0];
    if (!Array.isArray(maybeVector)) return null;
    const vector = maybeVector
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v));
    return vector.length > 0 ? vector : null;
  } catch (error) {
    console.warn('[attachment_analytics] embedding failed:', error);
    return null;
  }
}

async function emitAttachmentUploadedEvent(
  env: Env,
  payload: {
    sessionId: string;
    messageTs: number;
    contentHash: string;
    captionText: string;
    storefrontId?: string;
    channel?: string;
  },
): Promise<void> {
  if (!env.ANALYTICS_WORKER) return;
  try {
    await env.ANALYTICS_WORKER.fetch('https://analytics.internal/pixel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'chat_attachment_uploaded',
        data: {
          sessionId: payload.sessionId,
          messageTs: payload.messageTs,
          storefront_id: payload.storefrontId ?? null,
          channel: payload.channel ?? null,
          contentHash: payload.contentHash,
          captionText: payload.captionText,
          captionLength: payload.captionText.length,
          source: 'chat_worker',
        },
      }),
    });
  } catch (error) {
    console.warn('[attachment_analytics] event emit failed:', error);
  }
}

async function persistAttachmentEmbedding(
  env: Env,
  payload: {
    sessionId: string;
    messageTs: number;
    contentHash: string;
    captionText: string;
    storefrontId?: string;
    channel?: string;
  },
): Promise<void> {
  if (!env.DB_CHATBOT) return;
  const vector = await embedCaptionTextForAnalytics(env, payload.captionText);
  if (!vector) return;
  try {
    await ensureChatAttachmentEmbeddingsTable(env.DB_CHATBOT);
    const id = `${payload.sessionId}:${payload.messageTs}:${payload.contentHash.slice(0, 16)}`;
    await env.DB_CHATBOT.prepare(
      `INSERT OR REPLACE INTO chat_attachment_embeddings (
        id, session_id, message_ts, content_hash, caption_text, embedding_model, embedding_json, storefront_id, channel, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        payload.sessionId,
        payload.messageTs,
        payload.contentHash,
        payload.captionText,
        CHAT_ATTACHMENT_EMBEDDING_MODEL,
        JSON.stringify(vector),
        payload.storefrontId ?? null,
        payload.channel ?? null,
        now(),
      )
      .run();
  } catch (error) {
    console.warn('[attachment_analytics] embedding persistence failed:', error);
  }
}

async function persistAttachmentAnalytics(
  env: Env,
  payload: {
    imageBase64: string;
    sessionId: string;
    messageTs: number;
    captionText: string;
    storefrontId?: string;
    channel?: string;
  },
): Promise<void> {
  try {
    const contentHash = await sha256Hex(payload.imageBase64);
    const eventPayload = {
      sessionId: payload.sessionId,
      messageTs: payload.messageTs,
      contentHash,
      captionText: payload.captionText,
      storefrontId: payload.storefrontId,
      channel: payload.channel,
    };
    await emitAttachmentUploadedEvent(env, eventPayload);
    await persistAttachmentEmbedding(env, eventPayload);
  } catch (error) {
    console.warn('[attachment_analytics] pipeline failed:', error);
  }
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

const REPLAY_KEY_TTL_MS = 10 * 60_000;
const MAX_PRODUCT_VIEWS_IN_DO = 10;
const MAX_PROACTIVE_ACTIVATIONS_IN_DO = 5;

type SessionContextRow = {
  id: 1;
  cart_id: string | null;
  session_id: string | null;
  storefront_id: string | null;
  channel: string | null;
};

type SessionCustomerRow = {
  customer_id: string;
  first_name: string | null;
  last_name: string | null;
};

type SessionMetaRow = {
  id: 1;
  created_at: number | null;
  message_seq: number;
  tool_call_seq: number;
  usage_seq: number;
  cart_activity_seq: number;
};

type MessageSqlRow = {
  id: number;
  role: ChatRole;
  content: string;
  ts: number;
  tool_calls: string | null;
  tool_call_id: string | null;
  name: string | null;
  message_uid: string | null;
};

type PersonMemoryLockState = {
  owner_request_id: string;
  expires_at: number;
};

type PersonMemoryRefreshResult = {
  ok: boolean;
  status:
    | 'success'
    | 'idempotent'
    | 'in_flight'
    | 'lock_conflict'
    | 'empty_snippet'
    | 'version_conflict'
    | 'db_unavailable'
    | 'error';
  request_id: string;
  version?: number;
  owner_request_id?: string;
  expires_at?: number;
  summary?: string | null;
  reason?: string;
};

function emptySessionContext(): SessionContextRow {
  return {
    id: 1,
    cart_id: null,
    session_id: null,
    storefront_id: null,
    channel: null,
  };
}

function emptySessionMeta(): SessionMetaRow {
  return {
    id: 1,
    created_at: null,
    message_seq: 0,
    tool_call_seq: 0,
    usage_seq: 0,
    cart_activity_seq: 0,
  };
}

function isSqlUniqueConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /unique/i.test(message);
}

function truncatePersistError(error: unknown, maxLength = 500): string {
  const message = error instanceof Error ? error.message : String(error ?? 'Unknown persistence error');
  if (message.length <= maxLength) return message;
  return `${message.slice(0, Math.max(0, maxLength - 3))}...`;
}

function tryExtractCartId(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;

  const record = value as Record<string, unknown>;
  if (typeof record.cart_id === 'string' && record.cart_id) return record.cart_id;
  if (typeof record.id === 'string' && record.id.startsWith('gid://shopify/Cart/')) return record.id;

  if (record.cart && typeof record.cart === 'object') {
    const nested = tryExtractCartId(record.cart);
    if (nested) return nested;
  }
  if (record.result && typeof record.result === 'object') {
    const nested = tryExtractCartId(record.result);
    if (nested) return nested;
  }

  return null;
}

// ============================================================================
// DURABLE OBJECT (SessionDO)
// ============================================================================
export class SessionDO {
  private readonly state: DurableObjectState;
  private readonly env: Env;
  private readonly sql: DurableObjectStorage['sql'];
  private lastRequestTimestamp = 0;
  private requestsInWindow = 0;
  private readonly personMemoryLocks = new Map<string, PersonMemoryLockState>();
  private readonly personMemoryRecentResults = new Map<
    string,
    {
      request_id: string;
      expires_at: number;
      result: PersonMemoryRefreshResult;
    }
  >();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.sql = state.storage.sql;

    this.state.blockConcurrencyWhile(async () => {
      this.initializeSchema();
    });
  }

  private initializeSchema(): void {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS session_context (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        cart_id TEXT,
        session_id TEXT,
        storefront_id TEXT,
        channel TEXT
      )
    `);
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS session_meta (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        created_at INTEGER,
        message_seq INTEGER NOT NULL DEFAULT 0,
        tool_call_seq INTEGER NOT NULL DEFAULT 0,
        usage_seq INTEGER NOT NULL DEFAULT 0,
        cart_activity_seq INTEGER NOT NULL DEFAULT 0
      )
    `);
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS session_customer (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        customer_id TEXT NOT NULL,
        first_name TEXT,
        last_name TEXT
      )
    `);
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        ts INTEGER NOT NULL,
        tool_calls TEXT,
        tool_call_id TEXT,
        name TEXT
      )
    `);
    this.execIgnoreDuplicateColumn('ALTER TABLE messages ADD COLUMN message_uid TEXT');
    this.sql.exec(`
      CREATE INDEX IF NOT EXISTS idx_session_messages_ts
      ON messages(ts ASC, id ASC)
    `);
    this.sql.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_session_messages_uid
      ON messages(message_uid)
    `);
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS replay_keys (
        signature TEXT PRIMARY KEY,
        expires_at INTEGER NOT NULL
      )
    `);
    this.sql.exec(`
      CREATE INDEX IF NOT EXISTS idx_replay_keys_expires_at
      ON replay_keys(expires_at)
    `);
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS product_views (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id TEXT NOT NULL,
        product_type TEXT,
        product_title TEXT,
        duration INTEGER NOT NULL,
        ts INTEGER NOT NULL,
        session_id TEXT
      )
    `);
    this.sql.exec(`
      CREATE INDEX IF NOT EXISTS idx_product_views_ts
      ON product_views(ts ASC, id ASC)
    `);
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS proactive_chat_activations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        ts INTEGER NOT NULL,
        activated INTEGER NOT NULL DEFAULT 1
      )
    `);
    this.sql.exec(`
      CREATE INDEX IF NOT EXISTS idx_proactive_chat_activations_ts
      ON proactive_chat_activations(ts ASC, id ASC)
    `);
    this.sql.exec('INSERT OR IGNORE INTO session_context (id) VALUES (1)');
    this.sql.exec(`
      INSERT OR IGNORE INTO session_meta (id, created_at, message_seq, tool_call_seq, usage_seq, cart_activity_seq)
      VALUES (1, NULL, 0, 0, 0, 0)
    `);
  }

  private execIgnoreDuplicateColumn(sql: string): void {
    try {
      this.sql.exec(sql);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? '');
      if (!/duplicate column/i.test(message)) {
        throw error;
      }
    }
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
      return new Response(JSON.stringify(this.getHistory()), {
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

    // POST /replace-last-user-text
    if (method === 'POST' && pathname.endsWith('/replace-last-user-text')) {
      const payload = (await request.json().catch(() => null)) as {
        content?: string;
        ts?: number;
        expected_content?: string;
      } | null;
      if (!payload || typeof payload.content !== 'string' || !payload.content.trim()) {
        return new Response('Bad Request', { status: 400 });
      }
      const replaced = await this.replaceLastUserText(
        payload.content,
        typeof payload.ts === 'number' ? payload.ts : undefined,
        typeof payload.expected_content === 'string' ? payload.expected_content : undefined,
      );
      return new Response(JSON.stringify({ ok: true, replaced }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // POST /set-session-id
    if (method === 'POST' && pathname.endsWith('/set-session-id')) {
        const payload = (await request.json().catch(() => null)) as { session_id?: string } | null;
         if (payload?.session_id) {
          this.setSessionId(payload.session_id);
          await this.persistSessionRecord({ lastActivity: now() });
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
      this.setCustomer(customer);
      await this.persistSessionRecord({ lastActivity: now() });
      return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
    }

    // GET /customer - retrieve known customer info for this session
    if (method === 'GET' && pathname.endsWith('/customer')) {
      const customer = this.getCustomer();
      return new Response(JSON.stringify({ customer: customer ?? null }), { headers: { 'Content-Type': 'application/json' } });
    }
    
    // GET /cart-id
    if (method === 'GET' && pathname.endsWith('/cart-id')) {
      return new Response(JSON.stringify({ cart_id: this.getCartId() }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // POST /set-cart-id
    if (method === 'POST' && pathname.endsWith('/set-cart-id')) {
      const payload = (await request.json().catch(() => null)) as { cart_id?: string } | null;
      if (!payload || typeof payload.cart_id !== 'string') {
        return new Response('Bad Request', { status: 400 });
      }
      this.setCartId(payload.cart_id);
      await this.persistSessionRecord({ lastActivity: now() });
      return new Response('ok');
    }

    // POST /set-storefront-context (kanoniczny kontrakt danych: storefront_id + channel dla messages_raw)
    if (method === 'POST' && pathname.endsWith('/set-storefront-context')) {
      const payload = (await request.json().catch(() => null)) as { storefront_id?: string; channel?: string } | null;
      if (payload && (typeof payload.storefront_id === 'string' || typeof payload.channel === 'string')) {
        this.setStorefrontContext(payload.storefront_id, payload.channel);
        await this.persistSessionRecord({ lastActivity: now() });
      }
      return new Response('ok');
    }

    if (method === 'POST' && pathname.endsWith('/persist-tool-call')) {
      const payload = (await request.json().catch(() => null)) as {
        tool_call_uid?: string;
        tool_name?: string;
        arguments?: unknown;
        result?: unknown;
        status?: string;
        duration_ms?: number;
        timestamp?: number;
      } | null;
      if (!payload?.tool_name || typeof payload.tool_name !== 'string') {
        return new Response('Bad Request: tool_name required', { status: 400 });
      }
      await this.persistToolCallRecord({
        tool_call_uid: payload.tool_call_uid,
        tool_name: payload.tool_name,
        arguments: payload.arguments,
        result: payload.result,
        status: payload.status,
        duration_ms: payload.duration_ms,
        timestamp: payload.timestamp,
      });
      return new Response('ok');
    }

    if (method === 'POST' && pathname.endsWith('/persist-usage')) {
      const payload = (await request.json().catch(() => null)) as {
        usage_uid?: string;
        model?: string;
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
        timestamp?: number;
      } | null;
      if (!payload?.model || typeof payload.model !== 'string') {
        return new Response('Bad Request: model required', { status: 400 });
      }
      await this.persistUsageRecord({
        usage_uid: payload.usage_uid,
        model: payload.model,
        prompt_tokens: payload.prompt_tokens,
        completion_tokens: payload.completion_tokens,
        total_tokens: payload.total_tokens,
        timestamp: payload.timestamp,
      });
      return new Response('ok');
    }

    if (method === 'POST' && pathname.endsWith('/persist-cart-activity')) {
      const payload = (await request.json().catch(() => null)) as {
        items?: Array<{
          activity_uid?: string;
          cart_id?: string | null;
          action?: string;
          product_id?: string | null;
          variant_id?: string | null;
          quantity?: number | null;
          timestamp?: number;
        }>;
      } | null;
      const items = Array.isArray(payload?.items) ? payload.items.filter((item) => typeof item?.action === 'string') : [];
      if (items.length === 0) {
        return new Response('Bad Request: items required', { status: 400 });
      }
      await this.persistCartActivityRecords(items as Array<{
        activity_uid?: string;
        cart_id?: string | null;
        action: string;
        product_id?: string | null;
        variant_id?: string | null;
        quantity?: number | null;
        timestamp?: number;
      }>);
      return new Response('ok');
    }

    if (method === 'POST' && pathname.endsWith('/acquire-memory-lock')) {
      const payload = (await request.json().catch(() => null)) as {
        shopify_customer_id?: string;
        request_id?: string;
        lock_ttl_ms?: number;
      } | null;
      if (!payload?.shopify_customer_id || !payload?.request_id) {
        return new Response('Bad Request: shopify_customer_id and request_id required', { status: 400 });
      }
      const lock = this.acquirePersonMemoryLock(
        payload.shopify_customer_id,
        payload.request_id,
        typeof payload.lock_ttl_ms === 'number' ? payload.lock_ttl_ms : PERSON_MEMORY_LOCK_TTL_MS,
      );
      return new Response(JSON.stringify({ ok: true, ...lock }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (method === 'POST' && pathname.endsWith('/release-memory-lock')) {
      const payload = (await request.json().catch(() => null)) as {
        shopify_customer_id?: string;
        request_id?: string;
      } | null;
      if (!payload?.shopify_customer_id || !payload?.request_id) {
        return new Response('Bad Request: shopify_customer_id and request_id required', { status: 400 });
      }
      const released = this.releasePersonMemoryLock(payload.shopify_customer_id, payload.request_id);
      return new Response(JSON.stringify({ ok: true, released }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (method === 'POST' && pathname.endsWith('/refresh-memory-atomic')) {
      const payload = (await request.json().catch(() => null)) as {
        shopify_customer_id?: string;
        request_id?: string;
        reason?: string;
      } | null;
      if (!payload?.shopify_customer_id || !payload?.request_id) {
        return new Response('Bad Request: shopify_customer_id and request_id required', { status: 400 });
      }
      try {
        const result = await this.refreshPersonMemoryAtomic({
          shopify_customer_id: payload.shopify_customer_id,
          request_id: payload.request_id,
          reason: payload.reason,
        });
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (error) {
        console.error('[person_memory] refresh failed:', error);
        return new Response(JSON.stringify({
          ok: false,
          status: 'error',
          request_id: payload.request_id,
          reason: payload.reason,
        } satisfies PersonMemoryRefreshResult), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // POST /replay-check
    if (method === 'POST' && pathname.endsWith('/replay-check')) {
      const payload = await request.json().catch(() => null);
      const p = payload as { signature?: string; timestamp?: string } | null;
      if (!p || !p.signature || !p.timestamp) {
        return new Response(JSON.stringify({ error: 'Invalid payload' }), { status: 400 });
      }
      const used = this.checkAndMarkReplay(p.signature);
      return new Response(JSON.stringify({ used }), { status: 200 });
    }

    // POST /track-product-view (z analytics-worker)
    if (method === 'POST' && pathname.endsWith('/track-product-view')) {
      const payload = (await request.json().catch(() => null)) as { product_id?: string; product_type?: string; product_title?: string; duration?: number } | null;
      if (!payload || typeof payload.product_id !== 'string') {
        return new Response('Bad Request: product_id required', { status: 400 });
      }
      this.trackProductView(payload.product_id, payload.product_type, payload.product_title, payload.duration || 0);
      return new Response('ok');
    }

    // POST /activate-proactive-chat (z analytics-worker)
    if (method === 'POST' && pathname.endsWith('/activate-proactive-chat')) {
        const payload = (await request.json().catch(() => null)) as { customer_id?: string; session_id?: string; reason?: string; timestamp?: number } | null;
        if (!payload || !payload.customer_id || !payload.session_id) {
            return new Response('Bad Request: customer_id and session_id required', { status: 400 });
        }
      this.activateProactiveChat(payload.customer_id, payload.session_id, payload.reason || 'unknown', payload.timestamp || now());
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

  private getSessionContext(): SessionContextRow {
    const row = this.sql.exec(
      'SELECT cart_id, session_id, storefront_id, channel FROM session_context WHERE id = 1',
    ).one() as Omit<SessionContextRow, 'id'> | null;

    return {
      ...emptySessionContext(),
      ...(row ?? {}),
    };
  }

  private writeSessionContext(next: SessionContextRow): void {
    this.sql.exec(
      'UPDATE session_context SET cart_id = ?, session_id = ?, storefront_id = ?, channel = ? WHERE id = 1',
      next.cart_id,
      next.session_id,
      next.storefront_id,
      next.channel,
    );
  }

  private updateSessionContext(patch: Partial<Omit<SessionContextRow, 'id'>>): void {
    const current = this.getSessionContext();
    this.writeSessionContext({
      id: 1,
      cart_id: patch.cart_id !== undefined ? patch.cart_id : current.cart_id,
      session_id: patch.session_id !== undefined ? patch.session_id : current.session_id,
      storefront_id: patch.storefront_id !== undefined ? patch.storefront_id : current.storefront_id,
      channel: patch.channel !== undefined ? patch.channel : current.channel,
    });
  }

  private getCartId(): string | null {
    return this.getSessionContext().cart_id;
  }

  private setCartId(cartId: string): void {
    this.updateSessionContext({ cart_id: cartId });
  }

  private setSessionId(sessionId: string): void {
    this.updateSessionContext({ session_id: sessionId });
  }

  private setStorefrontContext(storefrontId?: string, channel?: string): void {
    const patch: Partial<Omit<SessionContextRow, 'id'>> = {};
    if (typeof storefrontId === 'string') {
      patch.storefront_id = storefrontId;
    }
    if (typeof channel === 'string') {
      patch.channel = channel;
    }
    if (Object.keys(patch).length > 0) {
      this.updateSessionContext(patch);
    }
  }

  private getSessionId(): string {
    return this.getSessionContext().session_id ?? this.getDurableObjectId() ?? 'unknown-session';
  }

  private getDurableObjectId(): string | null {
    const durableObjectId = (this.state as DurableObjectState & { id?: { toString(): string } }).id;
    return durableObjectId && typeof durableObjectId.toString === 'function'
      ? durableObjectId.toString()
      : null;
  }

  private setCustomer(customer: SessionCustomerRow): void {
    this.sql.exec(
      'INSERT OR REPLACE INTO session_customer (id, customer_id, first_name, last_name) VALUES (1, ?, ?, ?)',
      customer.customer_id,
      customer.first_name,
      customer.last_name,
    );
  }

  private getCustomer(): SessionCustomerRow | null {
    const rows = this.sql.exec(
      'SELECT customer_id, first_name, last_name FROM session_customer WHERE id = 1',
    ).toArray() as SessionCustomerRow[];
    return rows[0] ?? null;
  }

  private getSessionMeta(): SessionMetaRow {
    const rows = this.sql.exec(
      'SELECT created_at, message_seq, tool_call_seq, usage_seq, cart_activity_seq FROM session_meta WHERE id = 1',
    ).toArray() as Array<Omit<SessionMetaRow, 'id'>>;
    const row = rows[0];

    return {
      ...emptySessionMeta(),
      ...(row ?? {}),
    };
  }

  private writeSessionMeta(next: SessionMetaRow): void {
    this.sql.exec(
      'INSERT OR REPLACE INTO session_meta (id, created_at, message_seq, tool_call_seq, usage_seq, cart_activity_seq) VALUES (1, ?, ?, ?, ?, ?)',
      next.created_at,
      next.message_seq,
      next.tool_call_seq,
      next.usage_seq,
      next.cart_activity_seq,
    );
  }

  private getOrCreateSessionCreatedAt(fallbackTs = now()): number {
    const meta = this.getSessionMeta();
    if (typeof meta.created_at === 'number' && Number.isFinite(meta.created_at)) {
      return meta.created_at;
    }
    meta.created_at = fallbackTs;
    this.writeSessionMeta(meta);
    return fallbackTs;
  }

  private nextSessionSequence(key: 'message_seq' | 'tool_call_seq' | 'usage_seq' | 'cart_activity_seq'): number {
    const meta = this.getSessionMeta();
    meta[key] += 1;
    this.writeSessionMeta(meta);
    return meta[key];
  }

  private makeSessionUid(prefix: 'msg' | 'tool' | 'usage' | 'cart', key: 'message_seq' | 'tool_call_seq' | 'usage_seq' | 'cart_activity_seq'): string {
    return `${this.getSessionId()}:${prefix}:${this.nextSessionSequence(key)}`;
  }

  private selectMessageRows(): MessageSqlRow[] {
    return this.sql.exec(
      'SELECT id, role, content, ts, tool_calls, tool_call_id, name, message_uid FROM messages ORDER BY ts ASC, id ASC',
    ).toArray() as MessageSqlRow[];
  }

  private deserializeHistoryEntry(row: MessageSqlRow): HistoryEntry {
    let toolCalls: unknown;
    if (typeof row.tool_calls === 'string' && row.tool_calls.trim().length > 0) {
      try {
        toolCalls = JSON.parse(row.tool_calls);
      } catch (error) {
        console.warn('[SessionDO] Failed to parse tool_calls JSON:', error);
      }
    }

    return {
      role: row.role,
      content: row.content ?? '',
      ts: row.ts,
      ...(toolCalls !== undefined ? { tool_calls: toolCalls } : {}),
      ...(row.tool_call_id ? { tool_call_id: row.tool_call_id } : {}),
      ...(row.name ? { name: row.name } : {}),
    };
  }

  private getHistory(): HistoryEntry[] {
    return this.selectMessageRows().map((row) => this.deserializeHistoryEntry(row)).slice(-MAX_HISTORY_IN_DO);
  }

  private async append(payload: HistoryEntry): Promise<void> {
    const ts = payload.ts || now();
    const messageUid = payload.message_uid ?? this.makeSessionUid('msg', 'message_seq');
    this.sql.exec(
      'INSERT INTO messages (role, content, ts, tool_calls, tool_call_id, name, message_uid) VALUES (?, ?, ?, ?, ?, ?, ?)',
      payload.role,
      payload.content ?? '',
      ts,
      payload.tool_calls !== undefined ? JSON.stringify(payload.tool_calls) : null,
      payload.tool_call_id ?? null,
      payload.name ?? null,
      messageUid,
    );
    await this.persistMessageRow({
      id: -1,
      role: payload.role,
      content: payload.content ?? '',
      ts,
      tool_calls: payload.tool_calls !== undefined ? JSON.stringify(payload.tool_calls) : null,
      tool_call_id: payload.tool_call_id ?? null,
      name: payload.name ?? null,
      message_uid: messageUid,
    });

    const rows = this.selectMessageRows();
    if (rows.length > MAX_HISTORY_IN_DO) {
      const overflowRows = rows.slice(0, rows.length - MAX_HISTORY_IN_DO);
      await this.archiveToD1(overflowRows);
      for (const row of overflowRows) {
        this.sql.exec('DELETE FROM messages WHERE id = ?', row.id);
      }
    }
  }

  private async replaceLastUserText(
    content: string,
    expectedTs?: number,
    expectedContent?: string,
  ): Promise<boolean> {
    const nextContent = content.trim();
    if (!nextContent) return false;
    const expected = expectedContent?.trim();
    const rows = this.selectMessageRows();

    const findFromEnd = (predicate: (entry: MessageSqlRow) => boolean): number => {
      for (let i = rows.length - 1; i >= 0; i--) {
        if (predicate(rows[i])) return i;
      }
      return -1;
    };

    let targetIdx = findFromEnd((entry) => {
      if (entry.role !== 'user') return false;
      if (typeof expectedTs === 'number' && entry.ts !== expectedTs) return false;
      if (expected && entry.content !== expected) return false;
      return true;
    });

    if (targetIdx < 0 && typeof expectedTs === 'number') {
      targetIdx = findFromEnd((entry) => entry.role === 'user' && entry.ts === expectedTs);
    }
    if (targetIdx < 0 && expected) {
      targetIdx = findFromEnd((entry) => entry.role === 'user' && entry.content === expected);
    }
    if (targetIdx < 0) return false;

    const current = rows[targetIdx];
    this.sql.exec('UPDATE messages SET content = ? WHERE id = ?', nextContent, current.id);
    await this.persistMessageRow({
      ...current,
      content: nextContent,
    });
    return true;
  }

  private cleanupExpiredReplayKeys(cutoff = now()): void {
    this.sql.exec('DELETE FROM replay_keys WHERE expires_at < ?', cutoff);
  }

  private checkAndMarkReplay(signature: string): boolean {
    this.cleanupExpiredReplayKeys();
    try {
      this.sql.exec(
        'INSERT INTO replay_keys (signature, expires_at) VALUES (?, ?)',
        signature,
        now() + REPLAY_KEY_TTL_MS,
      );
      return false;
    } catch (error) {
      if (isSqlUniqueConstraintError(error)) {
        return true;
      }
      throw error;
    }
  }

  /**
   * Archiwizuje wiadomości do tabeli messages w DB_CHATBOT (D1).
   * Wywoływane gdy historia przekracza limit (alarm/limit after append)
   * lub przed okresowym czyszczeniem. DB_CHATBOT jest dostępny przez this.env.
   */
  private async archiveToD1(messages: MessageSqlRow[]): Promise<void> {
    if (messages.length === 0) return;
    for (const message of messages) {
      await this.persistMessageRow(message);
    }
    console.log(`[SessionDO] Ensured ${messages.length} messages in D1 for session ${this.getSessionId()}`);
  }

  private buildSessionSnapshot(lastActivity = now()) {
    const sessionContext = this.getSessionContext();
    const customer = this.getCustomer();
    const meta = this.getSessionMeta();
    const createdAt = typeof meta.created_at === 'number' && Number.isFinite(meta.created_at)
      ? meta.created_at
      : this.getOrCreateSessionCreatedAt(lastActivity);

    return {
      session_id: this.getSessionId(),
      customer_id: customer?.customer_id ?? null,
      first_name: customer?.first_name ?? null,
      last_name: customer?.last_name ?? null,
      cart_id: sessionContext.cart_id ?? null,
      created_at: createdAt,
      last_activity: lastActivity,
      archived_at: lastActivity,
      message_count: meta.message_seq,
      storefront_id: sessionContext.storefront_id ?? null,
      channel: sessionContext.channel ?? null,
    };
  }

  private async persistSessionRecord(options?: {
    lastActivity?: number;
    persistStatus?: 'ok' | 'error';
    lastPersistError?: string | null;
    lastPersistErrorAt?: number | null;
  }): Promise<void> {
    if (!this.env.DB_CHATBOT) return;

    const snapshot = this.buildSessionSnapshot(options?.lastActivity ?? now());
    try {
      await this.env.DB_CHATBOT
        .prepare(
          `INSERT INTO sessions (
            session_id, customer_id, first_name, last_name, cart_id,
            created_at, last_activity, archived_at, message_count,
            storefront_id, channel, persist_status, last_persist_error, last_persist_error_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(session_id) DO UPDATE SET
            customer_id = excluded.customer_id,
            first_name = excluded.first_name,
            last_name = excluded.last_name,
            cart_id = excluded.cart_id,
            last_activity = excluded.last_activity,
            archived_at = excluded.archived_at,
            message_count = excluded.message_count,
            storefront_id = excluded.storefront_id,
            channel = excluded.channel,
            persist_status = excluded.persist_status,
            last_persist_error = excluded.last_persist_error,
            last_persist_error_at = excluded.last_persist_error_at`
        )
        .bind(
          snapshot.session_id,
          snapshot.customer_id,
          snapshot.first_name,
          snapshot.last_name,
          snapshot.cart_id,
          snapshot.created_at,
          snapshot.last_activity,
          snapshot.archived_at,
          snapshot.message_count,
          snapshot.storefront_id,
          snapshot.channel,
          options?.persistStatus ?? 'ok',
          options?.lastPersistError ?? null,
          options?.lastPersistErrorAt ?? null,
        )
        .run();
    } catch (error) {
      console.error('[SessionDO] Failed to persist session snapshot to D1', {
        session_id: snapshot.session_id,
        error: truncatePersistError(error),
      });
    }
  }

  private async persistFailure(scope: string, error: unknown, timestamp = now()): Promise<void> {
    const message = truncatePersistError(error);
    console.error('[SessionDO] D1 persistence failure', {
      session_id: this.getSessionId(),
      scope,
      error: message,
    });
    await this.persistSessionRecord({
      lastActivity: timestamp,
      persistStatus: 'error',
      lastPersistError: `${scope}: ${message}`,
      lastPersistErrorAt: timestamp,
    });
  }

  private async persistMessageRow(row: MessageSqlRow): Promise<void> {
    if (!this.env.DB_CHATBOT || !row.message_uid) return;

    const sessionId = this.getSessionId();
    const sessionContext = this.getSessionContext();

    try {
      await this.env.DB_CHATBOT
        .prepare(
          `INSERT INTO messages (
            session_id, role, content, timestamp, tool_calls, tool_call_id, name, storefront_id, channel, message_uid
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(message_uid) DO UPDATE SET
            role = excluded.role,
            content = excluded.content,
            timestamp = excluded.timestamp,
            tool_calls = excluded.tool_calls,
            tool_call_id = excluded.tool_call_id,
            name = excluded.name,
            storefront_id = excluded.storefront_id,
            channel = excluded.channel`
        )
        .bind(
          sessionId,
          row.role,
          row.content ?? '',
          row.ts ?? now(),
          row.tool_calls,
          row.tool_call_id ?? null,
          row.name ?? null,
          sessionContext.storefront_id ?? null,
          sessionContext.channel ?? null,
          row.message_uid,
        )
        .run();
      await this.persistSessionRecord({ lastActivity: row.ts ?? now() });
    } catch (error) {
      await this.persistFailure('messages', error, row.ts ?? now());
    }
  }

  private async persistToolCallRecord(payload: {
    tool_call_uid?: string;
    tool_name: string;
    arguments?: unknown;
    result?: unknown;
    status?: string;
    duration_ms?: number;
    timestamp?: number;
  }): Promise<void> {
    if (!this.env.DB_CHATBOT) return;

    const timestamp = typeof payload.timestamp === 'number' ? payload.timestamp : now();
    const toolCallUid = payload.tool_call_uid ?? this.makeSessionUid('tool', 'tool_call_seq');

    try {
      await this.env.DB_CHATBOT
        .prepare(
          `INSERT INTO tool_calls (
            session_id, tool_name, arguments, result, status, duration_ms, timestamp, tool_call_uid
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(tool_call_uid) DO UPDATE SET
            tool_name = excluded.tool_name,
            arguments = excluded.arguments,
            result = excluded.result,
            status = excluded.status,
            duration_ms = excluded.duration_ms,
            timestamp = excluded.timestamp`
        )
        .bind(
          this.getSessionId(),
          payload.tool_name,
          payload.arguments !== undefined ? JSON.stringify(payload.arguments) : null,
          payload.result !== undefined ? JSON.stringify(payload.result) : null,
          payload.status ?? 'success',
          typeof payload.duration_ms === 'number' ? Math.trunc(payload.duration_ms) : null,
          timestamp,
          toolCallUid,
        )
        .run();
      await this.persistSessionRecord({ lastActivity: timestamp });
    } catch (error) {
      await this.persistFailure('tool_calls', error, timestamp);
    }
  }

  private async persistUsageRecord(payload: {
    usage_uid?: string;
    model: string;
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    timestamp?: number;
  }): Promise<void> {
    if (!this.env.DB_CHATBOT) return;

    const timestamp = typeof payload.timestamp === 'number' ? payload.timestamp : now();
    const usageUid = payload.usage_uid ?? this.makeSessionUid('usage', 'usage_seq');
    const promptTokens = typeof payload.prompt_tokens === 'number' ? Math.max(0, Math.trunc(payload.prompt_tokens)) : 0;
    const completionTokens = typeof payload.completion_tokens === 'number' ? Math.max(0, Math.trunc(payload.completion_tokens)) : 0;
    const totalTokens = typeof payload.total_tokens === 'number'
      ? Math.max(0, Math.trunc(payload.total_tokens))
      : promptTokens + completionTokens;

    try {
      await this.env.DB_CHATBOT
        .prepare(
          `INSERT INTO usage_stats (
            session_id, model, prompt_tokens, completion_tokens, total_tokens, timestamp, usage_uid
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(usage_uid) DO UPDATE SET
            model = excluded.model,
            prompt_tokens = excluded.prompt_tokens,
            completion_tokens = excluded.completion_tokens,
            total_tokens = excluded.total_tokens,
            timestamp = excluded.timestamp`
        )
        .bind(
          this.getSessionId(),
          payload.model,
          promptTokens,
          completionTokens,
          totalTokens,
          timestamp,
          usageUid,
        )
        .run();
      await this.persistSessionRecord({ lastActivity: timestamp });
    } catch (error) {
      await this.persistFailure('usage_stats', error, timestamp);
    }
  }

  private async persistCartActivityRecords(items: Array<{
    activity_uid?: string;
    cart_id?: string | null;
    action: string;
    product_id?: string | null;
    variant_id?: string | null;
    quantity?: number | null;
    timestamp?: number;
  }>): Promise<void> {
    if (!this.env.DB_CHATBOT || items.length === 0) return;

    for (const item of items) {
      const timestamp = typeof item.timestamp === 'number' ? item.timestamp : now();
      const activityUid = item.activity_uid ?? this.makeSessionUid('cart', 'cart_activity_seq');
      try {
        await this.env.DB_CHATBOT
          .prepare(
            `INSERT INTO cart_activity (
              session_id, cart_id, action, product_id, variant_id, quantity, timestamp, activity_uid
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(activity_uid) DO UPDATE SET
              cart_id = excluded.cart_id,
              action = excluded.action,
              product_id = excluded.product_id,
              variant_id = excluded.variant_id,
              quantity = excluded.quantity,
              timestamp = excluded.timestamp`
          )
          .bind(
            this.getSessionId(),
            item.cart_id ?? null,
            item.action,
            item.product_id ?? null,
            item.variant_id ?? null,
            typeof item.quantity === 'number' ? Math.trunc(item.quantity) : null,
            timestamp,
            activityUid,
          )
          .run();
      } catch (error) {
        await this.persistFailure('cart_activity', error, timestamp);
        return;
      }
    }

    const lastTimestamp = items.reduce((max, item) => {
      const ts = typeof item.timestamp === 'number' ? item.timestamp : 0;
      return Math.max(max, ts);
    }, 0) || now();
    await this.persistSessionRecord({ lastActivity: lastTimestamp });
  }

  private trimProductViews(): void {
    const rows = this.sql.exec('SELECT id FROM product_views ORDER BY ts ASC, id ASC').toArray() as Array<{ id: number }>;
    const overflow = rows.slice(0, Math.max(0, rows.length - MAX_PRODUCT_VIEWS_IN_DO));
    for (const row of overflow) {
      this.sql.exec('DELETE FROM product_views WHERE id = ?', row.id);
    }
  }

  private trackProductView(
    productId: string,
    productType?: string,
    productTitle?: string,
    duration?: number
  ): void {
    const ts = now();
    this.sql.exec(
      'INSERT INTO product_views (product_id, product_type, product_title, duration, ts, session_id) VALUES (?, ?, ?, ?, ?, ?)',
      productId,
      productType || null,
      productTitle || null,
      duration || 0,
      ts,
      this.getSessionContext().session_id,
    );
    this.trimProductViews();
    console.log(`[SessionDO] 👁️ Product view tracked: ${productId} (${duration}s)`, productType);
  }

  private trimProactiveActivations(): void {
    const rows = this.sql.exec(
      'SELECT id FROM proactive_chat_activations ORDER BY ts ASC, id ASC',
    ).toArray() as Array<{ id: number }>;
    const overflow = rows.slice(0, Math.max(0, rows.length - MAX_PROACTIVE_ACTIVATIONS_IN_DO));
    for (const row of overflow) {
      this.sql.exec('DELETE FROM proactive_chat_activations WHERE id = ?', row.id);
    }
  }

  private activateProactiveChat(
    customerId: string,
    sessionId: string,
    reason: string,
    timestamp: number
  ): void {
    this.sql.exec(
      'INSERT INTO proactive_chat_activations (customer_id, session_id, reason, ts, activated) VALUES (?, ?, ?, ?, ?)',
      customerId,
      sessionId,
      reason,
      timestamp,
      1,
    );
    this.trimProactiveActivations();
    console.log(`[SessionDO] 🚀 Proactive chat activated for ${customerId}/${sessionId}, reason: ${reason}`);
  }

  private cleanupExpiredPersonMemoryState(referenceTs = now()): void {
    for (const [customerId, lock] of this.personMemoryLocks.entries()) {
      if (lock.expires_at <= referenceTs) {
        this.personMemoryLocks.delete(customerId);
      }
    }
    for (const [key, entry] of this.personMemoryRecentResults.entries()) {
      if (entry.expires_at <= referenceTs) {
        this.personMemoryRecentResults.delete(key);
      }
    }
  }

  private recentPersonMemoryKey(customerId: string, requestId: string): string {
    return `${customerId}::${requestId}`;
  }

  private getRecentPersonMemoryResult(customerId: string, requestId: string): PersonMemoryRefreshResult | null {
    this.cleanupExpiredPersonMemoryState();
    const entry = this.personMemoryRecentResults.get(this.recentPersonMemoryKey(customerId, requestId));
    return entry ? entry.result : null;
  }

  private rememberPersonMemoryResult(customerId: string, requestId: string, result: PersonMemoryRefreshResult): void {
    this.cleanupExpiredPersonMemoryState();
    this.personMemoryRecentResults.set(this.recentPersonMemoryKey(customerId, requestId), {
      request_id: requestId,
      expires_at: now() + PERSON_MEMORY_RECENT_TTL_MS,
      result,
    });
  }

  private acquirePersonMemoryLock(
    customerId: string,
    requestId: string,
    ttlMs = PERSON_MEMORY_LOCK_TTL_MS,
  ): { acquired: boolean; already_owned: boolean; owner_request_id: string; expires_at: number } {
    const safeTtl = Number.isFinite(ttlMs) ? Math.max(1_000, Math.trunc(ttlMs)) : PERSON_MEMORY_LOCK_TTL_MS;
    const currentTs = now();
    this.cleanupExpiredPersonMemoryState(currentTs);
    const existing = this.personMemoryLocks.get(customerId);
    if (existing) {
      return {
        acquired: false,
        already_owned: existing.owner_request_id === requestId,
        owner_request_id: existing.owner_request_id,
        expires_at: existing.expires_at,
      };
    }
    const lock = {
      owner_request_id: requestId,
      expires_at: currentTs + safeTtl,
    } satisfies PersonMemoryLockState;
    this.personMemoryLocks.set(customerId, lock);
    console.log('[person_memory] lock_acquire', JSON.stringify({
      customer_id: customerId,
      request_id: requestId,
      expires_at: lock.expires_at,
    }));
    return {
      acquired: true,
      already_owned: false,
      owner_request_id: requestId,
      expires_at: lock.expires_at,
    };
  }

  private releasePersonMemoryLock(customerId: string, requestId: string): boolean {
    const existing = this.personMemoryLocks.get(customerId);
    if (!existing || existing.owner_request_id !== requestId) return false;
    this.personMemoryLocks.delete(customerId);
    console.log('[person_memory] lock_release', JSON.stringify({
      customer_id: customerId,
      request_id: requestId,
    }));
    return true;
  }

  private async refreshPersonMemoryAtomic(payload: {
    shopify_customer_id: string;
    request_id: string;
    reason?: string;
  }): Promise<PersonMemoryRefreshResult> {
    const cached = this.getRecentPersonMemoryResult(payload.shopify_customer_id, payload.request_id);
    if (cached) {
      console.log('[person_memory] idempotent_hit', JSON.stringify({
        customer_id: payload.shopify_customer_id,
        request_id: payload.request_id,
        source: 'do-cache',
        cached_status: cached.status,
      }));
      return { ...cached, status: 'idempotent' };
    }

    if (!this.env.DB_CHATBOT) {
      return {
        ok: true,
        status: 'db_unavailable',
        request_id: payload.request_id,
        reason: payload.reason,
      };
    }

    const lock = this.acquirePersonMemoryLock(payload.shopify_customer_id, payload.request_id);
    if (!lock.acquired) {
      const result = {
        ok: true,
        status: lock.already_owned ? 'in_flight' : 'lock_conflict',
        request_id: payload.request_id,
        owner_request_id: lock.owner_request_id,
        expires_at: lock.expires_at,
        reason: payload.reason,
      } satisfies PersonMemoryRefreshResult;
      console.warn('[person_memory] lock_conflict', JSON.stringify({
        customer_id: payload.shopify_customer_id,
        request_id: payload.request_id,
        owner_request_id: lock.owner_request_id,
        already_owned: lock.already_owned,
      }));
      return result;
    }

    try {
      const snippet = historyToPlainText(this.getHistory());
      if (!snippet.trim()) {
        const result = {
          ok: true,
          status: 'empty_snippet',
          request_id: payload.request_id,
          reason: payload.reason,
        } satisfies PersonMemoryRefreshResult;
        this.rememberPersonMemoryResult(payload.shopify_customer_id, payload.request_id, result);
        return result;
      }

      const current = await loadPersonMemoryRecord(this.env.DB_CHATBOT, payload.shopify_customer_id);
      if (current?.lastUpdatedByRequestId === payload.request_id) {
        const result = {
          ok: true,
          status: 'idempotent',
          request_id: payload.request_id,
          version: current.version,
          summary: current.summary,
          reason: payload.reason,
        } satisfies PersonMemoryRefreshResult;
        this.rememberPersonMemoryResult(payload.shopify_customer_id, payload.request_id, result);
        console.log('[person_memory] idempotent_hit', JSON.stringify({
          customer_id: payload.shopify_customer_id,
          request_id: payload.request_id,
          source: 'd1-row',
          version: current.version,
        }));
        return result;
      }

      const merged = await mergeSessionIntoPersonSummary(this.env, current?.summary ?? null, snippet);
      const writeResult = await upsertPersonMemoryVersioned(this.env.DB_CHATBOT, {
        shopifyCustomerId: payload.shopify_customer_id,
        summary: merged,
        expectedVersion: current?.version ?? 0,
        requestId: payload.request_id,
      });

      if (writeResult.status === 'conflict') {
        const result = {
          ok: true,
          status: 'version_conflict',
          request_id: payload.request_id,
          version: writeResult.record?.version,
          summary: writeResult.record?.summary ?? null,
          reason: payload.reason,
        } satisfies PersonMemoryRefreshResult;
        this.rememberPersonMemoryResult(payload.shopify_customer_id, payload.request_id, result);
        console.warn('[person_memory] version_conflict', JSON.stringify({
          customer_id: payload.shopify_customer_id,
          request_id: payload.request_id,
          expected_version: current?.version ?? 0,
          actual_version: writeResult.record?.version ?? null,
        }));
        return result;
      }

      const result = {
        ok: true,
        status: writeResult.status === 'idempotent' ? 'idempotent' : 'success',
        request_id: payload.request_id,
        version: writeResult.record.version,
        summary: writeResult.record.summary,
        reason: payload.reason,
      } satisfies PersonMemoryRefreshResult;
      this.rememberPersonMemoryResult(payload.shopify_customer_id, payload.request_id, result);
      console.log('[person_memory] refresh_success', JSON.stringify({
        customer_id: payload.shopify_customer_id,
        request_id: payload.request_id,
        version: writeResult.record.version,
        status: result.status,
        reason: payload.reason ?? 'chat_turn',
      }));
      return result;
    } finally {
      this.releasePersonMemoryLock(payload.shopify_customer_id, payload.request_id);
    }
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
  const customerId = normalizeOptionalString(url.searchParams.get('logged_in_customer_id'));
  const shopId = normalizeOptionalString(url.searchParams.get('shop')) ?? normalizeOptionalString(env.SHOP_DOMAIN);
  
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
      console.log('[handleChat] getCustomerById result:', JSON.stringify(customer));
      if (customer && (customer.firstName || customer.lastName)) {
        await stub.fetch('https://session/set-customer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customer_id: customerId, first_name: customer.firstName, last_name: customer.lastName }),
        });
        console.log('[handleChat] SessionDO: set customer for session:', customerId);
      }
    } catch (e) {
      console.warn('[handleChat] getCustomerById EXCEPTION:',
        e instanceof Error ? e.message : String(e));
      console.warn('[handleChat] getCustomerById STACK:',
        e instanceof Error ? e.stack : 'no stack');
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
  const userMessageTs = now();
  await stub.fetch('https://session/append', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'user', content: payload.message, ts: userMessageTs } as HistoryEntry),
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

  // Zapisz storefront_id i channel w DO (kanoniczny kontrakt danych: dla messages_raw)
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

  // [GREETING PREFILTER] Bez zmian - dobra optymalizacja (pomijamy gdy jest obraz – ścieżka multimodalna)
  const greetingCheck = payload.message.toLowerCase().trim();
  const greetingPattern = /^(cześć|czesc|hej|witaj|witam|dzień dobry|dzien dobry|dobry wieczór|dobry wieczor|hi|hello|hey)$/i;
  const isShortGreeting = !payload.image_base64 && greetingCheck.length < 15 && greetingPattern.test(greetingCheck);

  if (isShortGreeting) {
    const greetingReply = payload.channel === 'internal-dashboard'
      ? 'Witaj! Jestem Dev-asystent EPIR. Mogę pomóc w architekturze, analytics i operacjach systemu. 🛠️'
      : (payload.storefrontId === 'kazka' || payload.brand === 'kazka')
        ? 'Witaj! Jestem Gemma, doradca marki Kazka Jewelry. Jak mogę Ci dzisiaj pomóc? ✨'
        : (payload.storefrontId === 'zareczyny' || payload.brand === 'zareczyny')
          ? 'Witaj! Jestem Gemma, doradca pierścionków zaręczynowych EPIR. Jak mogę Ci dzisiaj pomóc? 💍'
          : 'Witaj! Jestem Gemma, doradca z pracowni EPIR Art Jewellery. Jak mogę Ci dzisiaj pomóc? 🌟';
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
  return streamAssistantResponse(request, sessionId, payload.message, userMessageTs, stub, env, customerToken, payload.brand, payload.image_base64, {
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
  userMessageTs: number,
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

      // Pobierz profil klienta z SessionDO
      let customerFirstName: string | null = null;
      const customerResp = await stub.fetch('https://session/customer');
      const customerData = await customerResp.json().catch(() => ({ customer: null })) as {
        customer?: {
          customer_id?: string | null;
          first_name?: string | null;
        } | null;
      };
      const sessionCustomer = customerData?.customer ?? null;
      customerFirstName = normalizeOptionalString(sessionCustomer?.first_name ?? null);
      const effectiveCustomerContext = resolveEffectiveShopifyCustomerId(
        shopifyCustomerId,
        sessionCustomer?.customer_id ?? null,
      );
      const effectiveShopifyCustomerId = effectiveCustomerContext.customerId;
      const shopId = normalizeOptionalString(new URL(request.url).searchParams.get('shop')) ?? normalizeOptionalString(env.SHOP_DOMAIN);

      let effectiveCustomerToken = customerToken;
      if (!effectiveCustomerToken && effectiveShopifyCustomerId && shopId) {
        try {
          const tokenVaultId = env.TOKEN_VAULT_DO.idFromName('global');
          const tokenVaultStub = env.TOKEN_VAULT_DO.get(tokenVaultId);
          const vault = new TokenVault(tokenVaultStub);
          effectiveCustomerToken = await vault.getOrCreateToken(effectiveShopifyCustomerId, shopId);
          if (effectiveCustomerContext.source === 'session') {
            console.log('[streamAssistant] 🔐 TokenVault: recovered token via SessionDO customer context');
          }
        } catch (error) {
          console.warn('[streamAssistant] TokenVault recovery failed:', error);
        }
      }

      let crossSessionSummary: string | null = null;
      if (effectiveShopifyCustomerId && env.DB_CHATBOT) {
        try {
          crossSessionSummary = await loadPersonMemory(env.DB_CHATBOT, effectiveShopifyCustomerId);
        } catch (e) {
          console.warn('[person_memory] load failed:', e);
        }
      }

      const buildPersonMemoryRequestId = (reason: 'chat_turn' | 'image_surrogate') =>
        `${sessionId}:person_memory:${userMessageTs}:${reason}`;

      const refreshPersonMemory = async (reason: 'chat_turn' | 'image_surrogate') => {
        if (!effectiveShopifyCustomerId || !env.DB_CHATBOT) return;
        const requestId = buildPersonMemoryRequestId(reason);
        try {
          const refreshResp = await stub.fetch('https://session/refresh-memory-atomic', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              shopify_customer_id: effectiveShopifyCustomerId,
              request_id: requestId,
              reason,
            }),
          });
          const refreshData = (await refreshResp.json().catch(() => null)) as Record<string, unknown> | null;
          if (!refreshResp.ok) {
            console.error('[person_memory] refresh failed:', refreshData ?? { status: refreshResp.status, request_id: requestId });
            return;
          }
          console.log('[person_memory] refresh result', JSON.stringify(refreshData ?? { request_id: requestId, status: 'unknown' }));
        } catch (e) {
          console.error('[person_memory] refresh failed:', e);
        }
      };

      const maybeRefreshPersonMemory = () => {
        if (!effectiveShopifyCustomerId || !env.DB_CHATBOT) return;
        const task = refreshPersonMemory('chat_turn');
        if (executionCtx) {
          executionCtx.waitUntil(task);
          return;
        }
        void task;
      };

      const maybePersistImageSurrogate = () => {
        if (!imageBase64) return;
        const task = async () => {
          try {
            const caption = await generateImageCaption(env, sessionId, imageBase64, userMessage);
            if (!caption) return;
            const surrogate = buildImageSurrogateContent(userMessage, caption);
            const replaceResp = await stub.fetch('https://session/replace-last-user-text', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ts: userMessageTs,
                expected_content: userMessage,
                content: surrogate,
              }),
            });
            if (!replaceResp.ok) {
              console.warn('[image_caption] replace-last-user-text failed with status', replaceResp.status);
            }
            await persistAttachmentAnalytics(env, {
              imageBase64,
              sessionId,
              messageTs: userMessageTs,
              captionText: caption,
              storefrontId: storefrontContext?.storefrontId,
              channel: storefrontContext?.channel,
            });
          } catch (e) {
            console.warn('[image_caption] surrogate persist failed:', e);
          } finally {
            await refreshPersonMemory('image_surrogate');
          }
        };

        if (executionCtx) {
          executionCtx.waitUntil(task());
          return;
        }
        void task();
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
      if (activeStorefrontConfig?.aiProfileGid && !aiProfileToken) {
        console.warn('[streamAssistant] AI profile skipped: no Storefront token in env for this storefront alias', {
          storefrontId: storefrontContext?.storefrontId ?? null,
        });
      }
      const aiProfile = await fetchAIProfile(
        activeStorefrontConfig?.aiProfileGid,
        aiProfileToken,
        env.SHOP_DOMAIN
      );
      const aiProfilePrompt = aiProfile ? buildAIProfilePrompt(aiProfile) : null;

      if (activeStorefrontConfig?.aiProfileGid && !aiProfile) {
        console.warn(
          `[streamAssistant] AI profile unavailable for storefront ${storefrontContext?.storefrontId ?? 'unknown'}; fallback to base prompt (check pre-flight logs, metaobject publish, token scope)`
        );
      }

      const baseSystemPrompt = getSystemPromptForChannel(storefrontContext?.channel);

      const messages: GroqMessage[] = [
        { role: 'system', content: baseSystemPrompt },
        ...(aiProfilePrompt ? [{ role: 'system' as const, content: aiProfilePrompt }] : []),
        { role: 'system', content: `Oto dostępne schematy narzędzi:\n${toolSchemaString}` },
      ];

      // Dodaj kontekst systemowy (jeśli istnieje)
      if (cartId) {
        messages.push({ role: 'system', content: `Kontekst systemowy: Aktualny cart_id sesji to: ${cartId}` });
      }
      if (effectiveCustomerToken || effectiveShopifyCustomerId) {
        const loginContextParts = ['Kontekst systemowy: Klient jest zalogowany.'];
        if (customerFirstName) {
          loginContextParts.push(`Imię klienta: ${customerFirstName}.`);
        }
        if (effectiveCustomerToken) {
          loginContextParts.push(`Jego anonimowy token to: ${effectiveCustomerToken}`);
        }
        messages.push({ role: 'system', content: loginContextParts.join(' ') });
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
      // Jeśli AI wywoła `search_catalog` lub `search_shop_policies_and_faqs`,
      // `callMcpToolDirect` w `mcp_server.ts` poprawnie wywoła `RAG_WORKER`.
      
      // W `index.ts` (stara wersja) była błędna logika RAG. Teraz jej nie ma.
      // AI samo zdecyduje o wywołaniu narzędzi RAG (search_..._catalog/policies).

      messages.push(...aiHistory);
      // Wiadomość użytkownika (ostatnia) jest już w `aiHistory`

      // 🟢 KROK 3c: TRUNCATE HISTORY - zredukuj długość kontekstu przed wysłaniem do AI
      // Cel: Zapobiegaj overflow kontekstu, oszczędzaj tokeny, zwiększ szybkość
      const messagesForTruncate: HistoryMessage[] = messages.map((m) => ({
        role: m.role as HistoryMessage['role'],
        content:
          typeof m.content === 'string'
            ? m.content
            : Array.isArray(m.content)
              ? m.content
                  .filter((part): part is Extract<KimiContentPart, { type: 'text' }> => part.type === 'text')
                  .map((part) => part.text)
                  .join('\n')
              : '',
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
      console.log('[streamAssistant] 🤖 Model:', imageBase64 ? `${CHAT_MODEL_ID} (multimodal)` : CHAT_MODEL_ID);
      console.log('[streamAssistant] 📜 System Prompt length:', LUXURY_SYSTEM_PROMPT.length + (aiProfilePrompt?.length ?? 0), 'chars');
      console.log('[streamAssistant] 📚 History entries (before truncation):', aiHistory.length);
      console.log('[streamAssistant] 📨 Total messages (after truncation):', truncatedMessages.length);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      if (!shouldUseWorkersAi(env)) {
        throw new Error('Workers AI binding missing. Add [ai] binding in wrangler.toml.');
      }

      // Workers AI: nagłówek x-session-affinity (ses_<sessionId>) — workersAiRunOptions(sessionId) w ai-client.ts;
      // stabilizuje routing/cache prefiksu (niższy TTFT przy tej samej sesji). sessionId musi przejść
      // normalizeWorkersAiSessionId — domyślny UUID z klienta / crypto.randomUUID() jest zgodny.

      // 🔴 KROK 4: PĘTLA WYWOŁAŃ NARZĘDZI (native tool_calls)
      let currentMessages: GroqMessage[] = imageBase64
        ? injectKimiMultimodalUserContent(truncatedMessages, imageBase64)
        : truncatedMessages;
      // Świadomie bez „Code Mode” (wykonywalny TS generowany przez model) na kanale storefront — wymagałby osobnej
      // piaskownicy i przeglądu ESOG; opóźnienia MCP ogranicza pętla i MAX_TOOL_CALLS.
      const MAX_TOOL_CALLS = 5;
      
      // 🔴 FIX: accumulatedResponse poza pętlą - nie resetuj w każdej iteracji
      let finalTextResponse = ''; 

      for (let i = 0; i < MAX_TOOL_CALLS; i++) {
        const groqStream = await streamGroqEvents(currentMessages, env, toolDefinitions, sessionId);
        const reader = groqStream.getReader();
        let iterationText = ''; // Tymczasowy buffer dla tej iteracji
        const pendingToolCalls = new Map<string, { id: string; name: string; arguments: string }>();
        let finishReason: string | null = null;
        let usageTotals = { prompt_tokens: 0, completion_tokens: 0 };

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
              // Nie sumuj wielu zdarzeń usage w jednej turze: Workers AI może powtarzać chunki
              // z tym samym lub rosnącym skumulowanym usage — sumowanie zawyżało metryki w logach.
              usageTotals.prompt_tokens = event.prompt_tokens;
              usageTotals.completion_tokens = event.completion_tokens;
              break;

            case 'done':
              finishReason = event.finish_reason ?? finishReason;
              break;
          }
        } // koniec while(reader)

        console.log(
          JSON.stringify({
            tag: 'chat.stream.turn',
            model: CHAT_MODEL_ID,
            session_id: sessionId,
            storefrontId: storefrontContext?.storefrontId ?? null,
            channel: storefrontContext?.channel ?? null,
            shopify_customer_id_present: Boolean(shopifyCustomerId),
            effective_customer_id_present: Boolean(effectiveShopifyCustomerId),
            shopify_customer_id_fallback_used: effectiveCustomerContext.source === 'session',
            effective_customer_source: effectiveCustomerContext.source,
            customer_token_present: Boolean(effectiveCustomerToken),
            finish_reason: finishReason,
            tool_calls_count: pendingToolCalls.size,
            usage_prompt_tokens: usageTotals.prompt_tokens,
            usage_completion_tokens: usageTotals.completion_tokens,
          }),
        );

        const iterationUsageTotal = usageTotals.prompt_tokens + usageTotals.completion_tokens;
        if (iterationUsageTotal > 0) {
          await stub.fetch('https://session/persist-usage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              usage_uid: `${sessionId}:usage:${userMessageTs}:${i}`,
              model: CHAT_MODEL_ID,
              prompt_tokens: usageTotals.prompt_tokens,
              completion_tokens: usageTotals.completion_tokens,
              total_tokens: iterationUsageTotal,
              timestamp: now(),
            }),
          });
        }

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
            const toolStartedAt = now();
            const { toolResult, parsedArgs, skippedExecution } = await executeToolWithParsedArguments(
              call.name,
              call.arguments,
              async (safeArgs) => {
                console.log(`[streamAssistant] 🛠️ Wykonuję narzędzie: ${call.name} z argumentami:`, safeArgs);
                if (call.name === 'run_analytics_query') {
                  return runAnalyticsQuery(env, safeArgs as { queryId?: string; dateFrom?: number; dateTo?: number });
                }
                const brandForMcp = (storefrontContext?.storefrontId === 'kazka' || storefrontContext?.storefrontId === 'zareczyny')
                  ? storefrontContext.storefrontId
                  : brand;
                return callMcpToolDirect(env, call.name, safeArgs, brandForMcp);
              },
            );

            if (skippedExecution) {
              console.warn('[streamAssistant] ⚠️ Nie udało się sparsować argumentów narzędzia — pomijam wywołanie MCP', {
                tool: call.name,
                raw: call.arguments,
                error: (toolResult as any)?.error,
              });
            } else {
              console.log(`[streamAssistant] ✅ Narzędzie ${call.name} wykonane`, { args: parsedArgs ?? {} });
            }
            const toolFinishedAt = now();
            const toolCallUid = `${sessionId}:tool:${userMessageTs}:${call.id}`;
            const toolPersistStatus = skippedExecution ? 'invalid_arguments' : toolResult.error ? 'error' : 'success';
            await stub.fetch('https://session/persist-tool-call', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                tool_call_uid: toolCallUid,
                tool_name: call.name,
                arguments: parsedArgs ?? { raw: call.arguments },
                result: toolResult.error ? { error: toolResult.error } : toolResult.result,
                status: toolPersistStatus,
                duration_ms: toolFinishedAt - toolStartedAt,
                timestamp: toolFinishedAt,
              }),
            });

            const parsedArgsRecord =
              parsedArgs && typeof parsedArgs === 'object' ? (parsedArgs as Record<string, unknown>) : null;
            const resolvedCartId =
              (parsedArgsRecord && typeof parsedArgsRecord.cart_id === 'string' ? parsedArgsRecord.cart_id : null) ??
              tryExtractCartId(toolResult.result);
            if ((call.name === 'get_cart' || call.name === 'update_cart') && resolvedCartId) {
              await stub.fetch('https://session/set-cart-id', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cart_id: resolvedCartId }),
              });
            }

            if (call.name === 'get_cart' && resolvedCartId) {
              await stub.fetch('https://session/persist-cart-activity', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  items: [
                    {
                      activity_uid: `${toolCallUid}:view`,
                      cart_id: resolvedCartId,
                      action: 'view',
                      timestamp: toolFinishedAt,
                    },
                  ],
                }),
              });
            }

            if (call.name === 'update_cart' && parsedArgsRecord) {
              const cartActivityItems: Array<Record<string, unknown>> = [];
              const addItems = Array.isArray(parsedArgsRecord.add_items) ? parsedArgsRecord.add_items : [];
              const updateItems = Array.isArray(parsedArgsRecord.update_items) ? parsedArgsRecord.update_items : [];
              const removeLineIds = Array.isArray(parsedArgsRecord.remove_line_ids) ? parsedArgsRecord.remove_line_ids : [];

              addItems.forEach((item, index) => {
                if (!item || typeof item !== 'object') return;
                const row = item as Record<string, unknown>;
                cartActivityItems.push({
                  activity_uid: `${toolCallUid}:add:${index}`,
                  cart_id: resolvedCartId,
                  action: 'add',
                  variant_id: typeof row.product_variant_id === 'string' ? row.product_variant_id : null,
                  quantity: typeof row.quantity === 'number' ? row.quantity : null,
                  timestamp: toolFinishedAt,
                });
              });

              updateItems.forEach((item, index) => {
                if (!item || typeof item !== 'object') return;
                const row = item as Record<string, unknown>;
                const quantity = typeof row.quantity === 'number' ? row.quantity : null;
                cartActivityItems.push({
                  activity_uid: `${toolCallUid}:update:${index}`,
                  cart_id: resolvedCartId,
                  action: quantity === 0 ? 'remove' : 'update',
                  product_id: typeof row.id === 'string' ? row.id : null,
                  quantity,
                  timestamp: toolFinishedAt,
                });
              });

              removeLineIds.forEach((lineId, index) => {
                if (typeof lineId !== 'string') return;
                cartActivityItems.push({
                  activity_uid: `${toolCallUid}:remove:${index}`,
                  cart_id: resolvedCartId,
                  action: 'remove',
                  product_id: lineId,
                  timestamp: toolFinishedAt,
                });
              });

              if (cartActivityItems.length > 0) {
                await stub.fetch('https://session/persist-cart-activity', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ items: cartActivityItems }),
                });
              }
            }
            const toolResultString = toolResult.error
              ? JSON.stringify({
                  notice:
                    'Narzędzie sklepu (Shopify MCP) nie zwróciło wyniku — nie twierdź o politykach ani usługach z pamięci marki; zaproponuj Kontakt lub ponowienie.',
                  ...toolResult,
                })
              : JSON.stringify(toolResult.result);

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
          // Usuń image_url z wiadomości – obraz wysyłamy tylko w pierwszej iteracji
          if (imageBase64) {
            currentMessages = currentMessages.map((m) => {
              if (!Array.isArray(m.content)) return m;
              const textParts = (m.content as KimiContentPart[]).filter(
                (p): p is { type: 'text'; text: string } => p.type === 'text',
              );
              const textContent = textParts.map((p) => p.text).join('');
              return { ...m, content: textContent };
            });
          }
          continue; 

        } else {
          // NIE - To była finalna odpowiedź tekstowa (bez wywołań narzędzi)
          // Model czasem powiela z promptu literalny tekst `tool_calls: [...]` — nie pokazuj tego klientowi.
          finalTextResponse = stripLeakedToolCallsLiterals(iterationText);
          if (finalTextResponse) {
            await sendDelta(finalTextResponse);
          }
          break; // Wyjdź z pętli for
        }
      } // koniec for(MAX_TOOL_CALLS)

      // Fallback: jeżeli model wielokrotnie wywoływał narzędzia i nie zwrócił tekstu,
      // domykamy odpowiedź jednym zapytaniem non-stream bez narzędzi.
      if (!finalTextResponse.trim()) {
        console.warn('[streamAssistant] ⚠️ Brak finalnego tekstu po pętli tool_calls. Uruchamiam fallback getGroqResponse().');
        try {
          const recoveryText = await getGroqResponse(currentMessages, env, { sessionId });
          if (typeof recoveryText === 'string' && recoveryText.trim()) {
            finalTextResponse = stripLeakedToolCallsLiterals(recoveryText);
            if (finalTextResponse) await sendDelta(finalTextResponse);
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

      if (imageBase64) {
        maybePersistImageSurrogate();
      } else {
        maybeRefreshPersonMemory();
      }

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
      return handleChat(request, env, APP_PROXY_CHAT_CONTEXT_OVERRIDE, ctx);
    }

    // Consent Gate (App Proxy — auth jak wyżej dla /apps/assistant/*)
    if (url.pathname === '/apps/assistant/consent' && request.method === 'POST') {
      return handleConsentAppProxy(request, env);
    }

    // Historia czatu storefrontu (App Proxy)
    if (url.pathname === '/apps/assistant/history' && request.method === 'POST') {
      return handleHistoryRequest(request, env);
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
        return handleChat(request, env, APP_PROXY_CHAT_CONTEXT_OVERRIDE, ctx);
      }

      const s2sResult = verifyS2SChatRequest(request, env);
      if (!s2sResult.ok) {
        return s2sResult.response;
      }
      return handleChat(request, env, s2sResult.contextOverride, ctx);
    }

    // Historia czatu headless / BFF – ten sam kontrakt auth co `/chat`.
    if (url.pathname === '/history' && request.method === 'POST') {
      if (hasAppProxySignature(request, url)) {
        const appProxyAuthError = await authorizeAppProxyRequest(request, env);
        if (appProxyAuthError) {
          return appProxyAuthError;
        }
        return handleHistoryRequest(request, env);
      }

      const s2sHistory = verifyS2SChatRequest(request, env);
      if (!s2sHistory.ok) {
        return s2sHistory.response;
      }
      return handleHistoryRequest(request, env);
    }

    // Consent Gate (S2S jak /chat — ten sam kontrakt nagłówków)
    if (url.pathname === '/consent' && request.method === 'POST') {
      if (hasAppProxySignature(request, url)) {
        const appProxyAuthError = await authorizeAppProxyRequest(request, env);
        if (appProxyAuthError) {
          return appProxyAuthError;
        }
        return handleConsentAppProxy(request, env);
      }

      const s2sConsent = verifyS2SChatRequest(request, env);
      if (!s2sConsent.ok) {
        return s2sConsent.response;
      }
      return handleConsentS2S(request, env, s2sConsent.contextOverride);
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
  getSystemPromptForChannel,
  resolveEffectiveShopifyCustomerId,
  verifyAppProxyHmac,
  handleMcpRequest,
  getGroqResponse,
};
