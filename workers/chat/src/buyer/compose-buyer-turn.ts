import {
  getGroqResponse,
  GroqStreamError,
  parseGroqFailedGenerationToolCall,
  streamGroqEvents,
  type GroqMessage,
  type GroqToolCall,
} from '../ai-client';
import type { Env } from '../config/bindings';
import { resolveCommerceContext } from '../config/commerce-context';
import { fetchProductFactsByHandle, fetchProductFactsForVariantIds } from '../facts';
import {
  formatProductsBlock,
  PAGE_PRODUCT_HEADER,
} from '../facts/format-product-block';
import type { ProductFacts, VariantFacts } from '../facts/types';
import { buildAIProfilePrompt, fetchAIProfileByHandle } from '../ai-profile';
import { callMcpToolDirect } from '../mcp_server';
import { KAZKA_BUYER_STORE_FACTS, LUXURY_SYSTEM_PROMPT } from '../prompts/luxury-system-prompt';
import { buildBuyerToolDefinitions, filterModelWiredBuyerTools } from './buyer-tools';
import type { BuyerChannelId } from './channel-switch';
import { catalogSnapshotChannel } from './channel-switch';
import {
  defaultCustomOrderUrlForChannel,
  validateCustomOrderUrl,
} from './channel-origins';
import { cartSummaryBlock } from './cart-summary-block';
import {
  continueUrlFromCartPayload,
  normalizeCartPayloadForParsing,
} from './cart-payload-normalize';
import { executeBuyerTool, variantIdsFromCartPayload } from './execute-buyer-tool';
import {
  buildPreviousResponseProductsBlock,
  collectUrlsFromFactsBlocks,
} from './previous-response-products';
import {
  createVariantOptionIndex,
  mergeProductFactsIntoIndex,
  type VariantOptionIndex,
} from './variant-option-gate';
import {
  applyCartMutationHistoryOverride,
  collectAllowedUrls,
  collectOriginalUrlByNorm,
  containsCartCheckoutCtaPhrase,
  guardBuyerReplyLinks,
  sanitizeMarkdownLinks,
  REPLY_CART_LINK_REJECTED_AFTER_MUTATION_MESSAGE,
  REPLY_LINK_REJECTED_CATALOG_MESSAGE,
  REPLY_LINK_REJECTED_NEUTRAL_MESSAGE,
  REPLY_NOT_YET_IN_CART_MESSAGE,
} from './reply-link-guard';
import { withLlmRound0Retry } from './buyer-llm-retry';
import {urlsFromToolResult} from './urls-from-tool-result';
import { readSessionCartId } from './session-cart';
import {
  appendBuyerSessionMessage,
  lastBuyerHistoryEntries,
  readBuyerSessionHistory,
} from './session-history';
import { ensureBuyerSessionContext } from './session-context';
import {
  brandKeyForChannel,
  listAvailableBuyerTools,
  type BuyerToolId,
} from './tool-readiness';
import { detectForcedCartTool } from './cart-intent';
import {
  buildCartContinueReply,
  buildCartErrorReply,
  mergeModelTextWithCartBlock,
  stripAllCartContinueLinks,
  stripBrokenMarkdownLinkPrefix,
  stripContinueUrlFromModelText,
} from './cart-continue-reply';
import {
  ASK_VARIANT_BEFORE_CART_MESSAGE,
  looksLikeToolCallAsText,
  toolAsTextCartMutationAllowed,
  toolAsTextKeyNames,
  toolNameFromAsText,
} from './tool-as-text';

const MAX_TOOL_ROUNDS = 3;
export const FINAL_TOOL_FALLBACK_USER =
  'Nie udało się wykonać operacji, proszę spróbować ponownie.';

const FINAL_RECOVERABLE_TOOL_NAMES = new Set([
  'create_cart',
  'update_cart',
  'search_catalog',
  'get_cart',
]);

function summarizeToolResultsForFallback(messages: GroqMessage[]): string {
  const parts: string[] = [];
  for (const m of messages) {
    if (m.role === 'tool' && typeof m.content === 'string' && m.content.trim()) {
      parts.push(m.content.trim().slice(0, 2500));
    }
  }
  return parts.join('\n---\n').slice(0, 8000);
}

function buildFinalRoundFallbackMessages(
  systemContent: string,
  userText: string,
  priorMessages: GroqMessage[],
): GroqMessage[] {
  const summary = summarizeToolResultsForFallback(priorMessages);
  const system = summary
    ? `${systemContent}\n\n[Wyniki narzędzi tej tury]\n${summary}`
    : systemContent;
  return [
    { role: 'system', content: system },
    { role: 'user', content: userText },
  ];
}

function lastCartLinkFromMessages(messages: GroqMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'tool' || typeof m.content !== 'string') continue;
    try {
      const parsed = JSON.parse(m.content) as Record<string, unknown>;
      const cont =
        typeof parsed.continue_url === 'string' ? parsed.continue_url.trim() : '';
      const checkout =
        typeof parsed.checkout_url === 'string' ? parsed.checkout_url.trim() : '';
      const url = cont || checkout;
      if (url) return url;
    } catch {
      /* skip */
    }
  }
  return null;
}

const HARD_RULES_PAN_PANI = [
  'Zawsze forma grzecznościowa Pan/Pani, nigdy 2. os. l.poj. (ty, możesz, znajdziesz, szukasz).',
  'Gdy płeć nieznana: formy bezosobowe, konsekwentnie w całej rozmowie.',
].join('\n');

const HARD_RULES_PRECEDENCE =
  'Reguły twarde mają pierwszeństwo przed głosem marki.';

function catalogFactsGuidance(modelTools: BuyerToolId[]): string {
  const catalogLine = modelTools.includes('search_catalog')
    ? 'Produkty, ceny, dostępność i linki: wyłącznie z wyniku search_catalog tej tury lub bloku [PRODUKT NA STRONIE].'
    : 'Produkty, ceny, dostępność i linki: wyłącznie z bloku [PRODUKT NA STRONIE] w tej turze (narzędzie katalogu niedostępne).';
  return [
    catalogLine,
    'Nigdy nie pokazuj klientowi id/gid i nie proś go o id wariantu; pytaj o rozmiar, metal lub kamień.',
    'Nie potwierdzaj istnienia produktu, kolekcji, kodu rabatowego ani promocji, których nie ma w wyniku narzędzia, w odpowiedzi bazy wiedzy ani w totals koszyka.',
    'Na nieznaną nazwę lub kod: «nie znajduję takiej pozycji / takiego kodu w ofercie», potem propozycja z wyniku wyszukiwania. Nigdy nie obiecuj naliczenia rabatu.',
  ].join('\n');
}

const GID_PATTERN = /gid:\/\/shopify\/\S+/g;

export function scrubGidFromClientReply(reply: string): string {
  const matches = reply.match(GID_PATTERN);
  if (!matches?.length) return reply.trim();
  console.log(JSON.stringify({ tag: 'buyer.gid_scrubbed', count: matches.length }));
  return reply
    .replace(GID_PATTERN, '')
    .split('\n')
    .map((line) => line.replace(/\s{2,}/g, ' ').trimEnd())
    .join('\n')
    .replace(/\[\s*\]\(\s*\)/g, '')
    .trim();
}

function shouldFallbackToolLoop(err: unknown, round: number): boolean {
  if (round > 0) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /tool_use_failed|not in request\.tools|Tool call validation failed/i.test(msg) ||
    /AI Gateway stream error event from Groq/i.test(msg)
  );
}

/** Groq 400 gdy model nie wywołał wymuszonego narzędzia (tool_choice function). */
function isForcedToolChoiceRejected(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /\b400\b/.test(msg) ||
    /tool_use_failed|Tool call validation failed|failed_generation|tool_choice/i.test(
      msg,
    )
  );
}

function isToolChoiceNoneButCalledTool(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /Tool choice is none, but model called a tool/i.test(msg);
}

function failedGenerationFromStreamError(err: unknown): string | undefined {
  if (err instanceof GroqStreamError && err.failedGeneration) {
    return err.failedGeneration;
  }
  return undefined;
}

function buyerIp(request: Request): string | undefined {
  return request.headers.get('CF-Connecting-IP')?.trim() || undefined;
}

function firstTextFromParts(parts: unknown): string | null {
  if (!Array.isArray(parts)) return null;
  for (const p of parts) {
    if (typeof p !== 'object' || p === null) continue;
    const o = p as Record<string, unknown>;
    if (o.type === 'text' && typeof o.text === 'string' && o.text.trim()) {
      return o.text.trim();
    }
  }
  return null;
}

/** Widżety: `message`, potem `parts[{type:'text'}]`, na końcu legacy `messages[]`. */
export function extractLastUserMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const rec = body as Record<string, unknown>;

  if (typeof rec.message === 'string') {
    const trimmed = rec.message.trim();
    if (trimmed) return trimmed;
  }

  const fromParts = firstTextFromParts(rec.parts);
  if (fromParts) return fromParts;

  const messages = rec.messages;
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m || typeof m !== 'object') continue;
    const role = (m as { role?: string }).role;
    const content = (m as { content?: string }).content;
    if (role === 'user' && typeof content === 'string' && content.trim()) {
      return content.trim();
    }
  }
  return null;
}

export function extractSessionIdFromBody(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const raw = (body as { session_id?: unknown; sessionId?: unknown }).session_id
    ?? (body as { sessionId?: unknown }).sessionId;
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed || undefined;
}

export function extractProductHandleFromBody(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const raw = (body as { productHandle?: unknown }).productHandle;
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed || undefined;
}

type FactsProductInput = {
  title?: string;
  priceDisplay?: string;
  url?: string;
  metals?: string[];
  stones?: string[];
  variants?: Array<{
    variantId?: string;
    title?: string;
    weight?: number | null;
    weightUnit?: string | null;
    available?: boolean;
  }>;
};

function legacyInputToFacts(p: FactsProductInput): ProductFacts {
  const variants: VariantFacts[] = (p.variants ?? []).map((v) => ({
    variantId: v.variantId ?? '',
    title: v.title ?? '',
    image: null,
    sku: null,
    weight: v.weight ?? null,
    weightUnit: v.weightUnit ?? null,
    price: { minor: 0, currency: 'PLN', display_pl: p.priceDisplay },
    compareAtPrice: null,
    available: v.available ?? true,
    selectedOptions: [],
    metal: null,
    size: null,
    stoneOrigin: 'unknown',
    originEvidence: [],
  }));
  const display = p.priceDisplay?.trim();
  return {
    channel: 'epir-online-store',
    productId: 'legacy',
    handle: '',
    title: p.title ?? 'Produkt',
    vendor: '',
    productType: null,
    url: p.url ?? '',
    image: null,
    collections: [],
    descriptionText: '',
    options: [],
    variants,
    priceRange: {
      min: { minor: 0, currency: 'PLN', display_pl: display },
      max: { minor: 0, currency: 'PLN', display_pl: display },
      isFlat: true,
    },
    stones: p.stones ?? [],
    metals: p.metals ?? [],
    sizes: [],
    metafields: {},
    productOriginRaw: null,
    dataIssues: [],
    fetchedAt: new Date().toISOString(),
  };
}

export function factsContextBlock(
  products: FactsProductInput[],
  opts?: { header?: string },
): string {
  if (!products.length) return '';
  const header = opts?.header ?? '[FAKTY Z KATALOGU — tylko to możesz twierdzić]';
  const items = products.map((p) => ({
    product: legacyInputToFacts(p),
    variants: legacyInputToFacts(p).variants,
  }));
  const { descriptive, technical } = formatProductsBlock(header, items, 6);
  return [descriptive, technical].filter(Boolean).join('\n\n');
}

const BUYER_TOOL_BLURBS: Partial<Record<BuyerToolId, string>> = {
  search_catalog: [
    '• search_catalog — gdy klient pyta o produkt, materiał, kamień, styl, kolekcję lub dostępność.',
    '  Podaj query (rdzeń 2–120 znaków); opcjonalnie price_min_pln / price_max_pln w całych złotych.',
    '  Ceny i linki cytuj wyłącznie z wyniku narzędzia (pole products).',
  ].join('\n'),
  ucp_cart: [
    '• create_cart / get_cart / update_cart / cancel_cart — koszyk sesji klienta.',
    '  Koszyk dodawaj tylko po wyraźnej zgodzie. Wariant = id z sekcji DANE TECHNICZNE wyniku search_catalog lub [PRODUKT NA STRONIE] (nie wymyślaj).',
    '  Gdy produkt ma więcej niż jeden wariant — zapytaj o wariant (rozmiar/kamień/metal) przed create_cart; podaj selected_options z wartościami klienta; nigdy „od [min]”.',
    '  Zmiana rozmiaru/wariantu: update_cart z remove_line_ids starej linii + add_items nowego wariantu (selected_options); update_items tylko ilość.',
    '  update_cart: tylko łatka (add_items / update_items / remove_line_ids). Nie podawaj id koszyka ani pełnej listy line_items.',
    '  Po udanej mutacji koszyka nie podawaj ilości, rozmiaru ani ceny pozycji — serwer dołączy blok „Stan koszyka (dane sklepu)” z pełnym wariantem i ceną z wyniku.',
    '  Przy zmianie opcji używaj selected_options z rozmowy / z linii koszyka; nie pytaj ponownie o opcje już znane; nigdy nie pytaj o line_id — użyj „linia:” z bloku koszyka.',
    '  Link koszyka: wyłącznie continue_url z get_cart/create_cart/update_cart tej tury — nie z pamięci sesji.',
  ].join('\n'),
  search_shop_policies_and_faqs: [
    '• search_shop_policies_and_faqs — zwroty, wysyłka, regulamin, kontakt, FAQ.',
    '  Cytuj pole answer ze structuredContent wraz ze sources. Nie dopowiadaj kwot ani terminów.',
  ].join('\n'),
  get_size_table: '• get_size_table — rozmiar pierścionka, pomiar palca, PL/US/UK.',
};

const BUYER_PROMPT_ADDON = 'Nie używaj frazy „od [cena]” przy cenach wariantów.';

export function buildBuyerToolsPrompt(tools: BuyerToolId[]): string {
  const blurbs = tools.map((t) => BUYER_TOOL_BLURBS[t]).filter((b): b is string => Boolean(b));
  if (blurbs.length === 0) {
    return [
      'Narzędzia w tej turze:',
      'Brak dostępnych narzędzi backendu. Nie twierdź, że możesz wywołać narzędzia; odpowiadaj tylko na podstawie profilu i faktów w kontekście.',
    ].join('\n');
  }
  return [
    'Narzędzia dostępne w tej turze (używaj wyłącznie tych — nie wymieniaj innych):',
    ...blurbs,
    BUYER_PROMPT_ADDON,
  ].join('\n');
}

export function scrubBuyerPromptForAvailableTools(
  prompt: string,
  availableTools: BuyerToolId[],
): string {
  const allowed = new Set(availableTools);
  let out = prompt.replace(
    /\nNarzędzia \(krótko — szczegóły schematów dostarcza API\):[\s\S]*?(?=\nTwarde reguły tool-use:)/,
    '\n',
  );

  if (!allowed.has('search_catalog')) {
    out = out.replace(/search_catalog/g, 'wyszukiwanie oferty');
    out = out.replace(/catalog_search/g, 'wyszukiwanie oferty');
    out = out.replace(/catalog_lookup/g, 'podgląd produktu');
    out = out.replace(/catalog_image_search/g, 'wyszukiwanie wizualne');
    out = out.replace(/lookup_catalog/g, 'podgląd produktu');
    out = out.replace(/\bget_product\b/g, 'podgląd produktu');
  }
  if (!allowed.has('get_size_table')) {
    out = out.replace(/get_size_table/g, 'pomiar rozmiaru');
  }
  if (!allowed.has('search_shop_policies_and_faqs')) {
    out = out.replace(/search_shop_policies_and_faqs/g, 'baza polityk sklepu');
  }
  if (!allowed.has('ucp_cart')) {
    out = out.replace(/\b(create_cart|get_cart|update_cart|cancel_cart)\b/g, 'operacja koszyka');
  }
  if (!allowed.has('customer_account_profile')) {
    out = out.replace(/customer_account_profile/g, 'profil konta klienta');
    out = out.replace(/get_most_recent_order_status/g, 'status zamówienia');
  }

  return out;
}

export function buildBuyerTurnSystemPrompt(parts: {
  modelTools: BuyerToolId[];
  profilePrompt: string;
  factsBlock: string;
  channelId?: BuyerChannelId;
}): string {
  const base = scrubBuyerPromptForAvailableTools(LUXURY_SYSTEM_PROMPT, parts.modelTools);
  const kazkaStoreFacts =
    parts.channelId === 'kazka-hydrogen' ? KAZKA_BUYER_STORE_FACTS : '';
  const toolsBlock = buildBuyerToolsPrompt(parts.modelTools);
  const hardRules = [
    HARD_RULES_PAN_PANI,
    HARD_RULES_PRECEDENCE,
    catalogFactsGuidance(parts.modelTools),
  ].join('\n');
  return [base, kazkaStoreFacts, parts.profilePrompt, hardRules, toolsBlock, parts.factsBlock]
    .filter(Boolean)
    .join('\n\n');
}

export function filterToolsForSession(
  tools: BuyerToolId[],
  sessionId: string | undefined,
): BuyerToolId[] {
  if (sessionId?.trim()) return tools;
  return tools.filter((t) => t !== 'ucp_cart');
}

async function collectStreamRound(
  stream: ReadableStream<import('../ai-client').GroqStreamEvent>,
): Promise<{ text: string; toolCalls: GroqToolCall[] }> {
  const reader = stream.getReader();
  let text = '';
  const toolCalls = new Map<string, GroqToolCall>();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    if (value.type === 'text') text += value.delta;
    if (value.type === 'tool_call') toolCalls.set(value.call.id, value.call);
  }
  return { text, toolCalls: [...toolCalls.values()] };
}

export type ComposeBuyerTurnOptions = {
  sessionId?: string;
  productHandle?: string;
  storefrontId?: string;
  bodyChannel?: string;
  analyticsConsent?: 0 | 1;
  /** Brak pola w żądaniu = 0 (fail-closed) — patrz `resolvePreferencesConsentFromBody`. */
  preferencesConsent?: 0 | 1;
  sessionIdSource?: 'cookie' | 'session_storage';
};

type FinalizeReplyContext = {
  allowedUrls: Set<string>;
  originalUrlByNorm: Map<string, string>;
  channelId: BuyerChannelId;
  systemBase: string;
  hadSearchCatalogThisTurn: boolean;
  /** Tylko sukces create_cart/update_cart w tej turze — nie samo sessionCartId. */
  cartMutatedSuccessfullyThisTurn: boolean;
  /** Exact continue_url z udanej mutacji w tej turze (bez UTM). */
  cartContinueUrl?: string | null;
  cartNotices?: string[];
  cartTotalsNote?: string | null;
  cartMutationPayload?: unknown;
  variantOptionIndex?: VariantOptionIndex;
  /** messages type=error z create/update — treść klientowi, bez continue_url. */
  cartClientErrors?: string[];
  hadGetCartThisTurn?: boolean;
};

function cartDeterministicReply(ctx: FinalizeReplyContext): string | null {
  if (!ctx.cartMutatedSuccessfullyThisTurn || !ctx.cartContinueUrl?.trim()) {
    return null;
  }
  return buildCartContinueReply({
    continueUrl: ctx.cartContinueUrl.trim(),
    notices: ctx.cartNotices ?? [],
    totalsNote: ctx.cartTotalsNote,
    cartPayload: ctx.cartMutationPayload,
    catalogIndex: ctx.variantOptionIndex,
  });
}

function scrubToolAsTextOrFallback(
  reply: string,
  ctx: FinalizeReplyContext,
): string {
  if (!looksLikeToolCallAsText(reply)) return reply;
  console.log(
    JSON.stringify({
      tag: 'buyer.tool_as_text_blocked',
      keys: toolAsTextKeyNames(reply),
    }),
  );
  return cartDeterministicReply(ctx) ?? FINAL_TOOL_FALLBACK_USER;
}

function logBuyerTiming(fields: {
  get_cart_ms: number;
  total_ms: number;
  tool_rounds?: number;
  cart_mutated?: boolean;
}): void {
  console.log(
    JSON.stringify({
      tag: 'buyer.timing',
      get_cart_ms: fields.get_cart_ms,
      total_ms: fields.total_ms,
      ...(typeof fields.tool_rounds === 'number'
        ? { tool_rounds: fields.tool_rounds }
        : {}),
      ...(typeof fields.cart_mutated === 'boolean'
        ? { cart_mutated: fields.cart_mutated }
        : {}),
    }),
  );
}

async function finalizeBuyerReply(
  env: Env,
  sessionId: string | undefined,
  userText: string,
  reply: string,
  ctx: FinalizeReplyContext,
): Promise<string> {
  let scrubbed = scrubGidFromClientReply(reply);
  scrubbed = scrubToolAsTextOrFallback(scrubbed, ctx);
  scrubbed = sanitizeMarkdownLinks(scrubbed, ctx.allowedUrls, {
    channelId: ctx.channelId,
    originalByNorm: ctx.originalUrlByNorm,
    shopDomain: env.SHOP_DOMAIN,
  });

  const guardedRaw = await guardBuyerReplyLinks(env, scrubbed, ctx.allowedUrls, {
    sessionId,
    systemBase: ctx.systemBase,
    userText,
    hadSearchCatalogThisTurn: ctx.hadSearchCatalogThisTurn,
  });

  let guarded = applyCartMutationHistoryOverride(
    guardedRaw,
    ctx.cartMutatedSuccessfullyThisTurn,
  );

  const rejectionOrEmpty =
    !guarded.trim() ||
    guarded === REPLY_LINK_REJECTED_CATALOG_MESSAGE ||
    guarded === REPLY_LINK_REJECTED_NEUTRAL_MESSAGE ||
    guarded === REPLY_CART_LINK_REJECTED_AFTER_MUTATION_MESSAGE;

  if (ctx.cartClientErrors?.length) {
    const errBlock = buildCartErrorReply(ctx.cartClientErrors);
    let withoutCartLinks = stripAllCartContinueLinks(guarded);
    const continueUrl = ctx.cartContinueUrl?.trim() ?? '';
    if (continueUrl) {
      withoutCartLinks = stripContinueUrlFromModelText(withoutCartLinks, continueUrl);
    }
    withoutCartLinks = stripBrokenMarkdownLinkPrefix(withoutCartLinks);
    if (rejectionOrEmpty || !withoutCartLinks.trim()) {
      guarded = errBlock;
    } else {
      guarded = `${withoutCartLinks.trim()}\n\n${errBlock}`;
    }
  } else if (ctx.cartMutatedSuccessfullyThisTurn) {
    const deterministic = cartDeterministicReply(ctx);
    if (deterministic) {
      // Zawsze: tekst modelu (bez linków koszyka) + blok „Stan koszyka (dane sklepu)”.
      // https://ucp.dev/2026-08-25/specification/shopping/cart/
      if (rejectionOrEmpty) {
        guarded = deterministic;
      } else {
        guarded = mergeModelTextWithCartBlock(
          guarded,
          deterministic,
          ctx.cartContinueUrl!.trim(),
        );
      }
    }
  } else {
    // Bez mutacji: nie zostawiaj broken „[…”; link koszyka tylko jeśli był z get_cart tej tury (allowlista).
    guarded = stripBrokenMarkdownLinkPrefix(guarded);
    if (
      !ctx.cartMutatedSuccessfullyThisTurn &&
      !ctx.hadGetCartThisTurn &&
      containsCartCheckoutCtaPhrase(guarded)
    ) {
      guarded = REPLY_NOT_YET_IN_CART_MESSAGE;
    }
  }

  if (sessionId?.trim()) {
    try {
      await appendBuyerSessionMessage(env, sessionId, 'user', userText);
      await appendBuyerSessionMessage(env, sessionId, 'assistant', guarded);
    } catch (e) {
      console.warn('[buyer.compose_turn] session history append failed', e);
    }
  }
  return guarded;
}

function toolDefsInclude(defs: ReturnType<typeof buildBuyerToolDefinitions>, name: string): boolean {
  return defs.some((d) => d.function?.name === name);
}

export async function composeBuyerAssistantReply(
  env: Env,
  channelId: BuyerChannelId,
  userText: string,
  request: Request,
  opts?: ComposeBuyerTurnOptions,
): Promise<string> {
  const sessionId = opts?.sessionId?.trim() || undefined;
  const productHandle = opts?.productHandle?.trim() || undefined;
  const catalogChannel = catalogSnapshotChannel(channelId);

  await ensureBuyerSessionContext(env, {
    sessionId,
    channelId,
    storefrontId: opts?.storefrontId,
    bodyChannel: opts?.bodyChannel,
    userText,
    analyticsConsent: opts?.analyticsConsent,
    preferencesConsent: opts?.preferencesConsent,
    sessionIdSource: opts?.sessionIdSource,
  });

  const turnStartedAt = Date.now();
  let getCartMs = 0;
  const profile = await fetchAIProfileByHandle(env, channelId, buyerIp(request));
  const profilePrompt = profile ? buildAIProfilePrompt(profile) : '';
  const readyAll = await listAvailableBuyerTools(env, channelId);
  const availableTools = filterToolsForSession(readyAll, sessionId);

  const history =
    sessionId ? lastBuyerHistoryEntries(await readBuyerSessionHistory(env, sessionId)) : [];

  const contextBlocks: string[] = [];
  const allowedVariantIds = new Set<string>();
  const allowedUrlSeeds: string[] = [];
  const variantOptionIndex = createVariantOptionIndex();

  // Formularz indywidualny: EPIR+GZ hardcode; Kazka z ai_profile.custom_order_url.
  const profileOrderUrl = profile?.custom_order_url
    ? validateCustomOrderUrl(profile.custom_order_url, channelId)
    : null;
  const defaultOrderUrl = defaultCustomOrderUrlForChannel(channelId);
  const customOrderUrl = profileOrderUrl || defaultOrderUrl;
  if (customOrderUrl) {
    allowedUrlSeeds.push(customOrderUrl);
    contextBlocks.push(
      `[FORMULARZ ZAMÓWIENIA INDYWIDUALNEGO]\nurl: ${customOrderUrl}`,
    );
  }

  const prevProducts = await buildPreviousResponseProductsBlock(
    env,
    channelId,
    catalogChannel,
    history,
    request,
  );
  if (prevProducts.block) {
    contextBlocks.push(prevProducts.block);
    for (const id of prevProducts.variantIds) allowedVariantIds.add(id);
    allowedUrlSeeds.push(...prevProducts.urls);
    for (const p of prevProducts.products) mergeProductFactsIntoIndex(variantOptionIndex, p);
  }

  if (productHandle) {
    try {
      const product = await fetchProductFactsByHandle(env, catalogChannel, productHandle, {
        clientRequest: request,
        urlChannel: channelId,
      });
      if (product) {
        const formatted = formatProductsBlock(PAGE_PRODUCT_HEADER, [{ product }], 1);
        contextBlocks.push(
          [formatted.descriptive, formatted.technical].filter(Boolean).join('\n\n'),
        );
        for (const id of formatted.variantIds) allowedVariantIds.add(id);
        mergeProductFactsIntoIndex(variantOptionIndex, product);
      }
    } catch (e) {
      console.warn('[buyer.compose_turn] page product skipped', e);
    }
  }

  let sessionCartId: string | null = null;
  if (sessionId && availableTools.includes('ucp_cart')) {
    sessionCartId = await readSessionCartId(env, sessionId);
    if (sessionCartId) {
      const cartT0 = Date.now();
      try {
        const brand = brandKeyForChannel(channelId);
        const cartOut = await callMcpToolDirect(
          env,
          'get_cart',
          {},
          {
            brand,
            sessionCartId,
            commerceContext: resolveCommerceContext(brand),
          },
        );
        getCartMs = Date.now() - cartT0;
        if (cartOut?.error) {
          console.log(
            JSON.stringify({
              tag: 'buyer.session_cart_read_failed',
              reason: 'protocol_error',
              code: typeof cartOut.error?.code === 'number' ? cartOut.error.code : null,
            }),
          );
          contextBlocks.push(
            '[KOSZYK SESJI]\nNie udało się odczytać zawartości koszyka. Nie proś klientki o identyfikator linii — zaproponuj ponowienie lub nowy koszyk.',
          );
        } else {
          const payload = normalizeCartPayloadForParsing(cartOut.result ?? cartOut);
          const summary = cartSummaryBlock(payload);
          if (summary) contextBlocks.push(summary);
          const vids = variantIdsFromCartPayload(payload);
          for (const vid of vids) allowedVariantIds.add(vid);
          // continue_url z preloadu NIE idzie na allowlistę — tylko z get_cart narzędzia lub mutacji.
          if (vids.length) {
            try {
              const products = await fetchProductFactsForVariantIds(
                env,
                catalogChannel,
                vids,
                { clientRequest: request, urlChannel: channelId },
              );
              for (const p of products) mergeProductFactsIntoIndex(variantOptionIndex, p);
            } catch (e) {
              console.warn('[buyer.compose_turn] cart variant facts skipped', e);
            }
          }
        }
      } catch (e) {
        getCartMs = Date.now() - cartT0;
        console.log(
          JSON.stringify({
            tag: 'buyer.session_cart_read_failed',
            reason: 'exception',
          }),
        );
        console.warn('[buyer.compose_turn] session cart variants skipped', e);
        contextBlocks.push(
          '[KOSZYK SESJI]\nNie udało się odczytać zawartości koszyka. Nie proś klientki o identyfikator linii.',
        );
      }
    }
  }

  const modelTools = filterModelWiredBuyerTools(availableTools);
  const factsBlock = contextBlocks.join('\n\n');
  const systemParts = buildBuyerTurnSystemPrompt({
    modelTools,
    profilePrompt,
    factsBlock,
    channelId,
  });
  allowedUrlSeeds.push(...collectUrlsFromFactsBlocks(contextBlocks));
  const allowedUrls = collectAllowedUrls(allowedUrlSeeds);
  const originalUrlByNorm = collectOriginalUrlByNorm(allowedUrlSeeds);
  const finalizeCtx: FinalizeReplyContext = {
    allowedUrls,
    originalUrlByNorm,
    channelId,
    systemBase: systemParts,
    hadSearchCatalogThisTurn: false,
    cartMutatedSuccessfullyThisTurn: false,
    variantOptionIndex,
  };

  const messages: GroqMessage[] = [
    { role: 'system', content: systemParts },
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: 'user', content: userText },
  ];

  const toolDefinitions = buildBuyerToolDefinitions(modelTools);
  let toolRoundsUsed = 0;

  const finishReply = async (reply: string): Promise<string> => {
    const out = await finalizeBuyerReply(env, sessionId, userText, reply, finalizeCtx);
    logBuyerTiming({
      get_cart_ms: getCartMs,
      total_ms: Date.now() - turnStartedAt,
      tool_rounds: toolRoundsUsed,
      cart_mutated: finalizeCtx.cartMutatedSuccessfullyThisTurn,
    });
    return out;
  };

  if (toolDefinitions.length === 0) {
    const reply = await withLlmRound0Retry(0, () =>
      getGroqResponse(messages, env, {
        timingLabel: 'buyer_turn',
        sessionId,
      }),
    );
    return finishReply(reply);
  }

  let forcedToolUsed = false;

  const applyExecutedTool = async (call: GroqToolCall): Promise<void> => {
    const executed = await executeBuyerTool({
      env,
      channelId,
      readyTools: availableTools,
      name: call.name,
      argsJson: call.arguments,
      sessionId,
      sessionCartId,
      allowedVariantIds,
      variantOptionIndex,
      shopifyCustomerId: null,
      request,
    });
    if (executed.sessionCartId !== undefined) {
      sessionCartId = executed.sessionCartId;
    }
    if (executed.newVariantIds?.length) {
      for (const id of executed.newVariantIds) allowedVariantIds.add(id);
    }
    if (call.name === 'search_catalog') {
      finalizeCtx.hadSearchCatalogThisTurn = true;
    }
    if (executed.cartClientErrors?.length) {
      finalizeCtx.cartClientErrors = executed.cartClientErrors;
    }
    if (call.name === 'get_cart') {
      finalizeCtx.hadGetCartThisTurn = true;
      // Link koszyka bez mutacji: tylko continue_url z get_cart tej tury (nie z preloadu sesji).
      const fromTool = continueUrlFromCartPayload(
        normalizeCartPayloadForParsing(
          (() => {
            try {
              return JSON.parse(executed.content);
            } catch {
              return null;
            }
          })(),
        ),
      );
      if (fromTool) {
        for (const normalized of collectAllowedUrls([fromTool])) {
          allowedUrls.add(normalized);
          if (!finalizeCtx.originalUrlByNorm.has(normalized)) {
            finalizeCtx.originalUrlByNorm.set(normalized, fromTool);
          }
        }
      }
    }
    if (executed.cartMutationSucceeded) {
      finalizeCtx.cartMutatedSuccessfullyThisTurn = true;
      if (executed.continueUrl) {
        finalizeCtx.cartContinueUrl = executed.continueUrl;
        for (const normalized of collectAllowedUrls([executed.continueUrl])) {
          allowedUrls.add(normalized);
          finalizeCtx.originalUrlByNorm.set(normalized, executed.continueUrl);
        }
      }
      if (executed.cartNotices?.length) {
        finalizeCtx.cartNotices = executed.cartNotices;
      }
      if (executed.cartTotalsNote) {
        finalizeCtx.cartTotalsNote = executed.cartTotalsNote;
      }
      if (executed.cartMutationPayload !== undefined) {
        finalizeCtx.cartMutationPayload = executed.cartMutationPayload;
      }
    }
    for (const url of urlsFromToolResult(call.name, executed.content, channelId)) {
      for (const normalized of collectAllowedUrls([url])) {
        allowedUrls.add(normalized);
        if (!finalizeCtx.originalUrlByNorm.has(normalized)) {
          finalizeCtx.originalUrlByNorm.set(normalized, url);
        }
      }
    }
    messages.push({
      role: 'tool',
      tool_call_id: call.id,
      name: call.name,
      content: executed.content,
    });
  };

  const safeApplyExecutedTool = async (call: GroqToolCall): Promise<void> => {
    try {
      await applyExecutedTool(call);
    } catch (toolErr) {
      console.warn(
        JSON.stringify({
          tag: 'buyer.tool_exec_failed',
          tool: call.name,
          reason: toolErr instanceof Error ? toolErr.message.slice(0, 120) : 'error',
        }),
      );
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        name: call.name,
        content: JSON.stringify({ error: 'tool_failed' }),
      });
    }
  };

  /**
   * Named tool_choice tylko: (a) get_cart po intencji odczytu;
   * (b) tool-as-text create/update gdy warianty na allowliście katalogu.
   * @see https://console.groq.com/docs/tool-use/local-tool-calling
   */
  const resolveForcedToolName = (text: string): string | null => {
    if (looksLikeToolCallAsText(text)) {
      const fromText = toolNameFromAsText(text);
      if (!fromText || !toolDefsInclude(toolDefinitions, fromText)) return null;
      if (fromText === 'get_cart') return 'get_cart';
      if (
        (fromText === 'create_cart' || fromText === 'update_cart') &&
        toolAsTextCartMutationAllowed(text, allowedVariantIds)
      ) {
        return fromText;
      }
      return null;
    }
    if (!finalizeCtx.cartMutatedSuccessfullyThisTurn) {
      const cartTool = detectForcedCartTool(userText, sessionCartId);
      if (cartTool && toolDefsInclude(toolDefinitions, cartTool)) return cartTool;
    }
    return null;
  };

  const clientReplyForToolAsTextWithoutForce = (text: string): string => {
    const name = toolNameFromAsText(text);
    if (name === 'create_cart' || name === 'update_cart') {
      return ASK_VARIANT_BEFORE_CART_MESSAGE;
    }
    return FINAL_TOOL_FALLBACK_USER;
  };

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    toolRoundsUsed = round + 1;
    let text: string;
    let toolCalls: GroqToolCall[];
    try {
      const stream = await withLlmRound0Retry(round, () =>
        streamGroqEvents(
          messages,
          env,
          toolDefinitions,
          sessionId,
          `buyer_tool_loop_${round}`,
        ),
      );
      ({ text, toolCalls } = await collectStreamRound(stream));
    } catch (err) {
      if (shouldFallbackToolLoop(err, round)) {
        console.warn(JSON.stringify({ tag: 'buyer.tool_loop_fallback', round }));
        const reply = await getGroqResponse(messages, env, {
          timingLabel: `buyer_tool_loop_fallback_${round}`,
          sessionId,
        });
        return finishReply(reply);
      }
      throw err;
    }

    if (toolCalls.length === 0) {
      const forcedName =
        !forcedToolUsed ? resolveForcedToolName(text) : null;
      if (forcedName) {
        forcedToolUsed = true;
        console.log(
          JSON.stringify({
            tag: looksLikeToolCallAsText(text)
              ? 'buyer.tool_as_text_retry'
              : 'buyer.cart_intent_force_tool',
            keys: looksLikeToolCallAsText(text)
              ? toolAsTextKeyNames(text)
              : undefined,
            forced: forcedName,
          }),
        );
        try {
          const forceStream = await streamGroqEvents(
            messages,
            env,
            toolDefinitions,
            sessionId,
            `buyer_tool_loop_${round}_forced`,
            {
              toolChoice: {
                type: 'function',
                function: { name: forcedName },
              },
            },
          );
          const forced = await collectStreamRound(forceStream);
          if (forced.toolCalls.length === 0) {
            return finishReply(
              looksLikeToolCallAsText(text)
                ? clientReplyForToolAsTextWithoutForce(text)
                : FINAL_TOOL_FALLBACK_USER,
            );
          }
          messages.push({
            role: 'assistant',
            content: forced.text || null,
            tool_calls: forced.toolCalls.map((c) => ({
              id: c.id,
              type: 'function' as const,
              function: { name: c.name, arguments: c.arguments },
            })),
          });
          for (const call of forced.toolCalls) {
            await safeApplyExecutedTool(call);
          }
          continue;
        } catch (forceErr) {
          // https://console.groq.com/docs/tool-use — 400 gdy brak wymuszonego tool call
          console.log(
            JSON.stringify({
              tag: 'buyer.forced_tool_choice_failed',
              forced: forcedName,
              reason: isForcedToolChoiceRejected(forceErr)
                ? 'groq_rejected'
                : 'stream_error',
            }),
          );
          return finishReply(FINAL_TOOL_FALLBACK_USER);
        }
      }
      if (looksLikeToolCallAsText(text)) {
        console.log(
          JSON.stringify({
            tag: 'buyer.tool_as_text_blocked',
            keys: toolAsTextKeyNames(text),
          }),
        );
        return finishReply(clientReplyForToolAsTextWithoutForce(text));
      }
      return finishReply(text);
    }

    messages.push({
      role: 'assistant',
      content: text || null,
      tool_calls: toolCalls.map((c) => ({
        id: c.id,
        type: 'function' as const,
        function: { name: c.name, arguments: c.arguments },
      })),
    });

    for (const call of toolCalls) {
      await safeApplyExecutedTool(call);
    }
  }

  try {
    const finalStream = await withLlmRound0Retry(MAX_TOOL_ROUNDS, () =>
      streamGroqEvents(
        messages,
        env,
        toolDefinitions,
        sessionId,
        'buyer_tool_loop_final',
        { toolChoice: 'none' },
      ),
    );
    const { text: finalText } = await collectStreamRound(finalStream);
    return finishReply(finalText);
  } catch (finalErr) {
    if (isToolChoiceNoneButCalledTool(finalErr)) {
      const rawFg = failedGenerationFromStreamError(finalErr);
      const recoveredCall = parseGroqFailedGenerationToolCall(rawFg);
      if (recoveredCall && FINAL_RECOVERABLE_TOOL_NAMES.has(recoveredCall.name)) {
        console.log(
          JSON.stringify({
            tag: 'buyer.final_tool_recovered',
            tool: recoveredCall.name,
          }),
        );
        await safeApplyExecutedTool(recoveredCall);
        const afterMutation = cartDeterministicReply(finalizeCtx);
        if (afterMutation) {
          // Ostatnia niepusta proza assistant (także gdy w tej samej turze były tool_calls).
          let lead = '';
          for (let i = messages.length - 1; i >= 0; i--) {
            const m = messages[i];
            if (m.role !== 'assistant') continue;
            const c = typeof m.content === 'string' ? m.content.trim() : '';
            if (c) {
              lead = c;
              break;
            }
          }
          return finishReply(lead || afterMutation);
        }
        try {
          const recoverStream = await streamGroqEvents(
            messages,
            env,
            toolDefinitions,
            sessionId,
            'buyer_tool_loop_final_recover',
            { toolChoice: 'none' },
          );
          const { text: recoverText } = await collectStreamRound(recoverStream);
          return finishReply(recoverText.trim() || FINAL_TOOL_FALLBACK_USER);
        } catch {
          const detAfterRecover = cartDeterministicReply(finalizeCtx);
          if (detAfterRecover) {
            return finishReply(detAfterRecover);
          }
          return finishReply(FINAL_TOOL_FALLBACK_USER);
        }
      }
      if (recoveredCall && !FINAL_RECOVERABLE_TOOL_NAMES.has(recoveredCall.name)) {
        return finishReply(FINAL_TOOL_FALLBACK_USER);
      }
    }
    console.warn(JSON.stringify({ tag: 'buyer.tool_loop_fallback', round: 'final' }));
    const fallbackMessages = buildFinalRoundFallbackMessages(
      systemParts,
      userText,
      messages,
    );
    try {
      const reply = await getGroqResponse(fallbackMessages, env, {
        timingLabel: 'buyer_tool_loop_final_fallback',
        sessionId,
      });
      return finishReply(reply);
    } catch {
      const deterministic = cartDeterministicReply(finalizeCtx);
      if (deterministic) {
        return finishReply(deterministic);
      }
      const cartLink = lastCartLinkFromMessages(messages);
      // Link tylko po mutacji w tej turze — nie z samego sessionCartId.
      const staticReply =
        finalizeCtx.cartMutatedSuccessfullyThisTurn && cartLink
          ? buildCartContinueReply(
              cartLink,
              finalizeCtx.cartNotices ?? [],
              finalizeCtx.cartTotalsNote,
            )
          : FINAL_TOOL_FALLBACK_USER;
      return finishReply(staticReply);
    }
  }
}
