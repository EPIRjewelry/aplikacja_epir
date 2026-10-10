import {
  getGroqResponse,
  streamGroqEvents,
  type GroqMessage,
  type GroqToolCall,
} from '../ai-client';
import type { Env } from '../config/bindings';
import { resolveCommerceContext } from '../config/commerce-context';
import { fetchProductFactsByHandle } from '../facts';
import {
  formatProductsBlock,
  PAGE_PRODUCT_HEADER,
} from '../facts/format-product-block';
import type { ProductFacts, VariantFacts } from '../facts/types';
import { buildAIProfilePrompt, fetchAIProfileByHandle } from '../ai-profile';
import { callMcpToolDirect } from '../mcp_server';
import { LUXURY_SYSTEM_PROMPT } from '../prompts/luxury-system-prompt';
import { buildBuyerToolDefinitions, filterModelWiredBuyerTools } from './buyer-tools';
import type { BuyerChannelId } from './channel-switch';
import { catalogSnapshotChannel } from './channel-switch';
import { cartSummaryBlock } from './cart-summary-block';
import { executeBuyerTool, variantIdsFromCartPayload } from './execute-buyer-tool';
import { readSessionCartId } from './session-cart';
import {
  appendBuyerSessionMessage,
  lastBuyerHistoryEntries,
  readBuyerSessionHistory,
} from './session-history';
import {
  brandKeyForChannel,
  listAvailableBuyerTools,
  type BuyerToolId,
} from './tool-readiness';

const MAX_TOOL_ROUNDS = 3;

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
  return reply.replace(GID_PATTERN, '').replace(/\s{2,}/g, ' ').trim();
}

function shouldFallbackToolLoop(err: unknown, round: number): boolean {
  if (round > 0) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /tool_use_failed|not in request\.tools|Tool call validation failed/i.test(msg) ||
    /AI Gateway stream error event from Groq/i.test(msg)
  );
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
    '  Gdy produkt ma więcej niż jeden wariant — zapytaj o wariant (rozmiar/kamień/metal) przed create_cart; nigdy „od [min]”.',
    '  update_cart: tylko łatka (add_items / update_items / remove_line_ids). Nie podawaj id koszyka ani pełnej listy line_items.',
    '  Link do klienta wyłącznie continue_url z wyniku narzędzia.',
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
}): string {
  const base = scrubBuyerPromptForAvailableTools(LUXURY_SYSTEM_PROMPT, parts.modelTools);
  const toolsBlock = buildBuyerToolsPrompt(parts.modelTools);
  const hardRules = [
    HARD_RULES_PAN_PANI,
    HARD_RULES_PRECEDENCE,
    catalogFactsGuidance(parts.modelTools),
  ].join('\n');
  return [base, parts.profilePrompt, hardRules, toolsBlock, parts.factsBlock]
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
};

async function finalizeBuyerReply(
  env: Env,
  sessionId: string | undefined,
  userText: string,
  reply: string,
): Promise<string> {
  const scrubbed = scrubGidFromClientReply(reply);
  if (sessionId?.trim()) {
    await appendBuyerSessionMessage(env, sessionId, 'user', userText);
    await appendBuyerSessionMessage(env, sessionId, 'assistant', scrubbed);
  }
  return scrubbed;
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
  const profile = await fetchAIProfileByHandle(env, channelId, buyerIp(request));
  const profilePrompt = profile ? buildAIProfilePrompt(profile) : '';
  const readyAll = await listAvailableBuyerTools(env, channelId);
  const availableTools = filterToolsForSession(readyAll, sessionId);

  const contextBlocks: string[] = [];
  const allowedVariantIds = new Set<string>();

  if (productHandle) {
    try {
      const product = await fetchProductFactsByHandle(env, catalogChannel, productHandle, {
        clientRequest: request,
      });
      if (product) {
        const formatted = formatProductsBlock(PAGE_PRODUCT_HEADER, [{ product }], 1);
        contextBlocks.push(
          [formatted.descriptive, formatted.technical].filter(Boolean).join('\n\n'),
        );
        for (const id of formatted.variantIds) allowedVariantIds.add(id);
      }
    } catch (e) {
      console.warn('[buyer.compose_turn] page product skipped', e);
    }
  }

  let sessionCartId: string | null = null;
  if (sessionId && availableTools.includes('ucp_cart')) {
    sessionCartId = await readSessionCartId(env, sessionId);
    if (sessionCartId) {
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
        if (!cartOut?.error) {
          const payload = cartOut.result ?? cartOut;
          const summary = cartSummaryBlock(payload);
          if (summary) contextBlocks.push(summary);
          for (const vid of variantIdsFromCartPayload(payload)) {
            allowedVariantIds.add(vid);
          }
        }
      } catch (e) {
        console.warn('[buyer.compose_turn] session cart variants skipped', e);
      }
    }
  }

  const modelTools = filterModelWiredBuyerTools(availableTools);
  const systemParts = buildBuyerTurnSystemPrompt({
    modelTools,
    profilePrompt,
    factsBlock: contextBlocks.join('\n\n'),
  });

  const history =
    sessionId ? lastBuyerHistoryEntries(await readBuyerSessionHistory(env, sessionId)) : [];

  const messages: GroqMessage[] = [
    { role: 'system', content: systemParts },
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: 'user', content: userText },
  ];

  const toolDefinitions = buildBuyerToolDefinitions(modelTools);
  if (toolDefinitions.length === 0) {
    const reply = await getGroqResponse(messages, env, {
      timingLabel: 'buyer_turn',
      sessionId,
    });
    return finalizeBuyerReply(env, sessionId, userText, reply);
  }

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let text: string;
    let toolCalls: GroqToolCall[];
    try {
      const stream = await streamGroqEvents(
        messages,
        env,
        toolDefinitions,
        sessionId,
        `buyer_tool_loop_${round}`,
      );
      ({ text, toolCalls } = await collectStreamRound(stream));
    } catch (err) {
      if (shouldFallbackToolLoop(err, round)) {
        console.warn(JSON.stringify({ tag: 'buyer.tool_loop_fallback', round }));
        const reply = await getGroqResponse(messages, env, {
          timingLabel: `buyer_tool_loop_fallback_${round}`,
          sessionId,
        });
        return finalizeBuyerReply(env, sessionId, userText, reply);
      }
      throw err;
    }

    if (toolCalls.length === 0) {
      return finalizeBuyerReply(env, sessionId, userText, text);
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
      const executed = await executeBuyerTool({
        env,
        channelId,
        readyTools: availableTools,
        name: call.name,
        argsJson: call.arguments,
        sessionId,
        sessionCartId,
        allowedVariantIds,
        shopifyCustomerId: null,
        request,
      });
      if (executed.sessionCartId !== undefined) {
        sessionCartId = executed.sessionCartId;
      }
      if (executed.newVariantIds?.length) {
        for (const id of executed.newVariantIds) allowedVariantIds.add(id);
      }
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        name: call.name,
        content: executed.content,
      });
    }
  }

  try {
    const finalStream = await streamGroqEvents(
      messages,
      env,
      toolDefinitions,
      sessionId,
      'buyer_tool_loop_final',
      { toolChoice: 'none' },
    );
    const { text: finalText } = await collectStreamRound(finalStream);
    return finalizeBuyerReply(env, sessionId, userText, finalText);
  } catch {
    console.warn(JSON.stringify({ tag: 'buyer.tool_loop_fallback', round: 'final' }));
    const reply = await getGroqResponse(messages, env, {
      timingLabel: 'buyer_tool_loop_final_fallback',
      sessionId,
    });
    return finalizeBuyerReply(env, sessionId, userText, reply);
  }
}
