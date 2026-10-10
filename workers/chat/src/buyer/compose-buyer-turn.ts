import { getGroqResponse } from '../ai-client';
import type { Env } from '../config/bindings';
import { getCatalogRepository } from '../facts';
import { buildAIProfilePrompt, fetchAIProfileByHandle } from '../ai-profile';
import { LUXURY_SYSTEM_PROMPT } from '../prompts/luxury-system-prompt';
import type { BuyerChannelId } from './channel-switch';
import { catalogSnapshotChannel } from './channel-switch';
import { listAvailableBuyerTools, type BuyerToolId } from './tool-readiness';

function buyerIp(request: Request): string | undefined {
  return request.headers.get('CF-Connecting-IP')?.trim() || undefined;
}

export function extractLastUserMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const messages = (body as { messages?: unknown }).messages;
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

function factsContextBlock(products: Array<{ title?: string; priceDisplay?: string; variants?: unknown[] }>): string {
  if (!products.length) return '';
  const lines = products.slice(0, 4).map((p) => {
    const title = p.title?.trim() || 'Produkt';
    const price = p.priceDisplay?.trim();
    const variantCount = Array.isArray(p.variants) ? p.variants.length : 0;
    const variantHint = variantCount > 1 ? ' (wiele wariantów — zapytaj o wariant, nie podawaj „od …”)' : '';
    const pricePart = price ? `, cena karty: ${price}` : '';
    return `- ${title}${pricePart}${variantHint}`;
  });
  return ['[FAKTY Z KATALOGU — tylko to możesz twierdzić]', ...lines].join('\n');
}

const BUYER_TOOL_BLURBS: Record<BuyerToolId, string> = {
  search_catalog: '• search_catalog — produkty, materiały, kamienie, kolekcje, dostępność.',
  ucp_cart: '• ucp_cart (create_cart / get_cart / update_cart / cancel_cart) — koszyk; continue_url z wyniku.',
  search_shop_policies_and_faqs:
    '• search_shop_policies_and_faqs — zwroty, wysyłka, regulamin, kontakt, FAQ.',
  get_size_table: '• get_size_table — rozmiar pierścionka, pomiar palca, PL/US/UK.',
  customer_account_profile:
    '• customer_account_profile — profil zalogowanego klienta (gość: nie zgaduj danych konta).',
};

/** Lists only tools readiness passed for this turn. Empty → no tool identifiers. */
export function buildBuyerToolsPrompt(tools: BuyerToolId[]): string {
  if (tools.length === 0) {
    return [
      'Narzędzia w tej turze:',
      'Brak dostępnych narzędzi backendu. Nie twierdź, że możesz wywołać narzędzia; odpowiadaj tylko na podstawie profilu i faktów w kontekście.',
    ].join('\n');
  }
  return [
    'Narzędzia dostępne w tej turze (używaj wyłącznie tych — nie wymieniaj innych):',
    ...tools.map((t) => BUYER_TOOL_BLURBS[t]),
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
  availableTools: BuyerToolId[];
  profilePrompt: string;
  factsBlock: string;
}): string {
  const base = scrubBuyerPromptForAvailableTools(LUXURY_SYSTEM_PROMPT, parts.availableTools);
  const toolsBlock = buildBuyerToolsPrompt(parts.availableTools);
  return [base, toolsBlock, parts.profilePrompt, parts.factsBlock].filter(Boolean).join('\n\n');
}

export async function composeBuyerAssistantReply(
  env: Env,
  channelId: BuyerChannelId,
  userText: string,
  request: Request,
): Promise<string> {
  const catalogChannel = catalogSnapshotChannel(channelId);
  const profile = await fetchAIProfileByHandle(env, channelId, buyerIp(request));
  const profilePrompt = profile ? buildAIProfilePrompt(profile) : '';
  const availableTools = await listAvailableBuyerTools(env, channelId);

  let factsBlock = '';
  try {
    const repo = await getCatalogRepository(env, catalogChannel, { clientRequest: request });
    const { matches } = await repo.search({ text: userText }, 4);
    factsBlock = factsContextBlock(
      matches.map((m) => ({
        title: m.product.title,
        priceDisplay:
          m.matchingPriceRange.min.display_pl ??
          m.product.priceRange.min.display_pl,
        variants: m.matchingVariants.length ? m.matchingVariants : m.product.variants,
      })),
    );
  } catch (e) {
    console.warn('[buyer.compose_turn] catalog facts skipped', e);
  }

  const systemParts = buildBuyerTurnSystemPrompt({
    availableTools,
    profilePrompt,
    factsBlock,
  });

  const reply = await getGroqResponse(
    [
      { role: 'system', content: systemParts },
      { role: 'user', content: userText },
    ],
    env,
    { timingLabel: 'buyer_turn' },
  );

  return reply.trim();
}
