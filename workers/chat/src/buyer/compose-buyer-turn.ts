import {
  getGroqResponse,
  streamGroqEvents,
  type GroqMessage,
  type GroqToolCall,
} from '../ai-client';
import type { Env } from '../config/bindings';
import { resolveCommerceContext } from '../config/commerce-context';
import { getCatalogRepository } from '../facts';
import { buildAIProfilePrompt, fetchAIProfileByHandle } from '../ai-profile';
import { callMcpToolDirect } from '../mcp_server';
import { LUXURY_SYSTEM_PROMPT } from '../prompts/luxury-system-prompt';
import { buildBuyerToolDefinitions, filterModelWiredBuyerTools } from './buyer-tools';
import type { BuyerChannelId } from './channel-switch';
import { catalogSnapshotChannel } from './channel-switch';
import { executeBuyerTool, variantIdsFromCartPayload } from './execute-buyer-tool';
import { readSessionCartId } from './session-cart';
import {
  brandKeyForChannel,
  listAvailableBuyerTools,
  type BuyerToolId,
} from './tool-readiness';

const MAX_TOOL_ROUNDS = 3;

/** Catalog is facts-path only; never advertise search_catalog as a callable tool. */
const CATALOG_FACTS_GUIDANCE = [
  'Produkty i ceny: wyłącznie z bloku [FAKTY Z KATALOGU] w tej turze (jeśli jest obecny).',
  'Gdy bloku brak: dopytaj klienta o preferencje albo zaproponuj kolekcję z profilu marki; nie wymyślaj produktów, cen ani linków.',
].join('\n');

/**
 * ai-client wraps Groq SSE errors as "AI Gateway stream error event from Groq"
 * (underlying tool_use_failed is only in console); match both forms.
 */
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

type FactsProductInput = {
  title?: string;
  priceDisplay?: string;
  variants?: Array<{ variantId?: string; title?: string }>;
};

export function factsContextBlock(
  products: FactsProductInput[],
  opts?: { includeVariants?: boolean },
): string {
  if (!products.length) return '';
  const includeVariants = opts?.includeVariants === true;
  const productLines: string[] = [];

  for (const p of products.slice(0, 4)) {
    const title = p.title?.trim() || 'Produkt';
    const price = p.priceDisplay?.trim();
    const variants = Array.isArray(p.variants) ? p.variants : [];
    const variantCount = variants.length;
    const variantHint =
      !includeVariants && variantCount > 1
        ? ' (wiele wariantów — zapytaj o wariant, nie podawaj „od …”)'
        : '';
    const pricePart = price ? `, cena karty: ${price}` : '';
    productLines.push(`- ${title}${pricePart}${variantHint}`);

    if (includeVariants && variantCount > 0) {
      for (const v of variants.slice(0, 6)) {
        const vTitle = v.title?.trim() || 'wariant';
        const vId = v.variantId?.trim();
        if (vId) productLines.push(`  wariant: ${vTitle} — id: ${vId}`);
      }
    }
  }

  return ['[FAKTY Z KATALOGU — tylko to możesz twierdzić]', ...productLines].join('\n');
}

/** Blurbs only for tools wired to Groq (MODEL_WIRED_BUYER_TOOLS). */
const BUYER_TOOL_BLURBS: Partial<Record<BuyerToolId, string>> = {
  ucp_cart: [
    '• create_cart / get_cart / update_cart / cancel_cart — koszyk sesji klienta.',
    '  Koszyk dodawaj tylko po wyraźnej zgodzie. Wariant = gid://shopify/ProductVariant/... z faktów katalogu tej tury (nie wymyślaj).',
    '  Gdy produkt ma więcej niż jeden wariant — zapytaj o wariant (rozmiar/kamień/metal) przed create_cart; nigdy „od [min]”.',
    '  update_cart: tylko łatka (add_items / update_items / remove_line_ids). Nie podawaj id koszyka ani pełnej listy line_items.',
    '  Link do klienta wyłącznie continue_url z wyniku narzędzia.',
  ].join('\n'),
  search_shop_policies_and_faqs: [
    '• search_shop_policies_and_faqs — zwroty, wysyłka, regulamin, kontakt, FAQ.',
    '  Cytuj pole answer tak, jak zwróciła baza wiedzy, i podaj źródło. Nie dopowiadaj.',
  ].join('\n'),
  get_size_table: '• get_size_table — rozmiar pierścionka, pomiar palca, PL/US/UK.',
};

const BUYER_PROMPT_ADDON = [
  'Forma grzecznościowa: Pan/Pani.',
  'Nie używaj frazy „od [cena]” przy cenach wariantów.',
].join('\n');

/** Lists only model-wired tools for this turn. Empty → no tool identifiers. */
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

/**
 * Scrub tool identifiers that readiness did not grant for this turn.
 * Stock "Narzędzia (krótko…)" inventory is removed; the dynamic block is appended separately.
 */
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
  /** Tools exposed to the model (MODEL_WIRED ∩ readiness), not full readiness list. */
  modelTools: BuyerToolId[];
  profilePrompt: string;
  factsBlock: string;
}): string {
  const base = scrubBuyerPromptForAvailableTools(LUXURY_SYSTEM_PROMPT, parts.modelTools);
  const toolsBlock = buildBuyerToolsPrompt(parts.modelTools);
  return [base, toolsBlock, CATALOG_FACTS_GUIDANCE, parts.profilePrompt, parts.factsBlock]
    .filter(Boolean)
    .join('\n\n');
}

/** Drop cart tools when session cannot persist cart across turns. */
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

function collectVariantIdsFromMatches(
  matches: Array<{ product: { variants: Array<{ variantId: string }> }; matchingVariants: Array<{ variantId: string }> }>,
): Set<string> {
  const ids = new Set<string>();
  for (const m of matches) {
    for (const v of m.matchingVariants) {
      if (v.variantId) ids.add(v.variantId);
    }
    for (const v of m.product.variants) {
      if (v.variantId) ids.add(v.variantId);
    }
  }
  return ids;
}

export type ComposeBuyerTurnOptions = {
  sessionId?: string;
};

export async function composeBuyerAssistantReply(
  env: Env,
  channelId: BuyerChannelId,
  userText: string,
  request: Request,
  opts?: ComposeBuyerTurnOptions,
): Promise<string> {
  const sessionId = opts?.sessionId?.trim() || undefined;
  const catalogChannel = catalogSnapshotChannel(channelId);
  const profile = await fetchAIProfileByHandle(env, channelId, buyerIp(request));
  const profilePrompt = profile ? buildAIProfilePrompt(profile) : '';
  const readyAll = await listAvailableBuyerTools(env, channelId);
  const availableTools = filterToolsForSession(readyAll, sessionId);

  let factsBlock = '';
  const allowedVariantIds = new Set<string>();
  try {
    const repo = await getCatalogRepository(env, catalogChannel, { clientRequest: request });
    const { matches } = await repo.search({ text: userText }, 4);
    for (const id of collectVariantIdsFromMatches(matches)) {
      allowedVariantIds.add(id);
    }
    factsBlock = factsContextBlock(
      matches.map((m) => ({
        title: m.product.title,
        priceDisplay:
          m.matchingPriceRange.min.display_pl ??
          m.product.priceRange.min.display_pl,
        variants: m.matchingVariants.length ? m.matchingVariants : m.product.variants,
      })),
      { includeVariants: availableTools.includes('ucp_cart') },
    );
  } catch (e) {
    console.warn('[buyer.compose_turn] catalog facts skipped', e);
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
          for (const vid of variantIdsFromCartPayload(cartOut.result ?? cartOut)) {
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
    factsBlock,
  });

  const messages: GroqMessage[] = [
    { role: 'system', content: systemParts },
    { role: 'user', content: userText },
  ];

  const toolDefinitions = buildBuyerToolDefinitions(modelTools);
  if (toolDefinitions.length === 0) {
    const reply = await getGroqResponse(messages, env, {
      timingLabel: 'buyer_turn',
      sessionId,
    });
    return reply.trim();
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
      // Same messages (system + [FAKTY Z KATALOGU]) — reply still grounded in catalog facts.
      if (shouldFallbackToolLoop(err, round)) {
        console.warn(JSON.stringify({ tag: 'buyer.tool_loop_fallback', round }));
        const reply = await getGroqResponse(messages, env, {
          timingLabel: `buyer_tool_loop_fallback_${round}`,
          sessionId,
        });
        return reply.trim();
      }
      throw err;
    }

    if (toolCalls.length === 0) {
      return text.trim();
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
      });
      if (executed.sessionCartId !== undefined) {
        sessionCartId = executed.sessionCartId;
      }
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        name: call.name,
        content: executed.content,
      });
    }
  }

  const finalStream = await streamGroqEvents(
    messages,
    env,
    toolDefinitions,
    sessionId,
    'buyer_tool_loop_final',
    { toolChoice: 'none' },
  );
  const { text: finalText } = await collectStreamRound(finalStream);
  return finalText.trim();
}
