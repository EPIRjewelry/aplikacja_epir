import { getGroqResponse } from '../ai-client';
import type { Env } from '../config/bindings';
import { getCatalogRepository } from '../facts';
import type { ProductFacts } from '../facts/types';
import { buildAIProfilePrompt, fetchAIProfileByHandle } from '../ai-profile';
import { LUXURY_SYSTEM_PROMPT } from '../prompts/luxury-system-prompt';
import type { BuyerChannelId } from './channel-switch';
import { catalogSnapshotChannel } from './channel-switch';

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

export async function composeBuyerAssistantReply(
  env: Env,
  channelId: BuyerChannelId,
  userText: string,
  request: Request,
): Promise<string> {
  const catalogChannel = catalogSnapshotChannel(channelId);
  const profile = await fetchAIProfileByHandle(env, channelId, buyerIp(request));
  const profilePrompt = profile ? buildAIProfilePrompt(profile) : '';

  let factsBlock = '';
  try {
    const repo = await getCatalogRepository(env, catalogChannel, { clientRequest: request });
    const { matches } = await repo.search({ text: userText }, 4);
    factsBlock = factsContextBlock(
      matches.map((m) => ({
        title: m.title,
        priceDisplay: m.priceDisplay,
        variants: m.variants,
      })),
    );
  } catch (e) {
    console.warn('[buyer.compose_turn] catalog facts skipped', e);
  }

  const systemParts = [LUXURY_SYSTEM_PROMPT, profilePrompt, factsBlock].filter(Boolean).join('\n\n');

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
