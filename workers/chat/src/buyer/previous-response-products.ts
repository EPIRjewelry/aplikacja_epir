import type {Env} from '../config/bindings';
import {fetchProductFactsByHandle} from '../facts';
import {formatProductsBlock} from '../facts/format-product-block';
import type {BuyerChannelId} from './channel-switch';
import type {BuyerHistoryEntry} from './session-history';

export const PREV_RESPONSE_HEADER = '[PRODUKTY Z POPRZEDNIEJ ODPOWIEDZI]';

const CHANNEL_PRODUCT_HOSTS: Record<BuyerChannelId, string[]> = {
  'epir-online-store': ['epirbizuteria.pl', 'www.epirbizuteria.pl', 'l.epirbizuteria.pl'],
  'kazka-hydrogen': ['kazka.epirbizuteria.pl'],
  'epir-zareczyny': [
    'zareczyny.epirbizuteria.pl',
    'epirbizuteria.pl',
    'www.epirbizuteria.pl',
  ],
};

const PRODUCT_PATH_RE =
  /https?:\/\/([^/\s]+)(\/[^)\s]*)?\/products\/([a-z0-9-]+)/gi;

export function productHostsForChannel(channelId: BuyerChannelId): string[] {
  return CHANNEL_PRODUCT_HOSTS[channelId] ?? CHANNEL_PRODUCT_HOSTS['epir-online-store'];
}

export function extractProductHandlesFromAssistantText(
  text: string,
  channelId: BuyerChannelId,
  max = 6,
): string[] {
  const allowed = new Set(productHostsForChannel(channelId).map((h) => h.toLowerCase()));
  const handles: string[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  PRODUCT_PATH_RE.lastIndex = 0;
  while ((m = PRODUCT_PATH_RE.exec(text)) !== null && handles.length < max) {
    const host = m[1].toLowerCase();
    if (!allowed.has(host)) continue;
    const handle = m[3].toLowerCase();
    if (seen.has(handle)) continue;
    seen.add(handle);
    handles.push(handle);
  }
  return handles;
}

export function collectUrlsFromFactsBlocks(blocks: string[]): string[] {
  const urls: string[] = [];
  const urlLine = /^\s*url:\s*(https?:\/\/\S+)/im;
  for (const block of blocks) {
    for (const line of block.split('\n')) {
      const m = line.match(urlLine);
      if (m?.[1]) urls.push(m[1].trim());
    }
  }
  return urls;
}

export async function buildPreviousResponseProductsBlock(
  env: Env,
  channelId: BuyerChannelId,
  catalogChannel: 'epir-online-store' | 'kazka-hydrogen',
  history: BuyerHistoryEntry[],
  request: Request,
): Promise<{block: string; variantIds: string[]; urls: string[]}> {
  const lastAssistant = [...history].reverse().find((h) => h.role === 'assistant');
  if (!lastAssistant?.content) {
    return {block: '', variantIds: [], urls: []};
  }
  const handles = extractProductHandlesFromAssistantText(lastAssistant.content, channelId);
  if (!handles.length) return {block: '', variantIds: [], urls: [] };

  const products = [];
  for (const handle of handles) {
    try {
      const product = await fetchProductFactsByHandle(env, catalogChannel, handle, {
        clientRequest: request,
        urlChannel: channelId,
      });
      if (product) products.push({product});
    } catch {
      /* skip */
    }
  }
  if (!products.length) return {block: '', variantIds: [], urls: [] };

  const formatted = formatProductsBlock(PREV_RESPONSE_HEADER, products, handles.length);
  const urls = products.map((p) => p.product.url).filter(Boolean);
  return {
    block: [formatted.descriptive, formatted.technical].filter(Boolean).join('\n\n'),
    variantIds: formatted.variantIds,
    urls,
  };
}
