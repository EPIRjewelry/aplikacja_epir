import type { BuyerChannelId } from './channel-switch';
import { resolveUrlForChannel } from './channel-origins';
import { continueUrlFromCartPayload, normalizeCartPayloadForParsing } from './cart-payload-normalize';
import { collectUrlsFromFactsBlocks } from './previous-response-products';
import { urlsInReply } from './reply-link-guard';

export function urlsFromToolResult(
  toolName: string,
  content: string,
  channelId?: BuyerChannelId,
): string[] {
  if (toolName === 'get_size_table') {
    return urlsInReply(content);
  }

  const urls: string[] = [];
  const pushResolved = (raw: string) => {
    if (!channelId) {
      if (raw.trim().startsWith('http')) urls.push(raw.trim());
      return;
    }
    const resolved = resolveUrlForChannel(raw, channelId);
    if (resolved) urls.push(resolved);
  };

  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const cartUrl = continueUrlFromCartPayload(parsed);
    if (cartUrl) urls.push(cartUrl);
    const wrappedUrl = continueUrlFromCartPayload(normalizeCartPayloadForParsing(parsed));
    if (wrappedUrl) urls.push(wrappedUrl);
    if (typeof parsed.continue_url === 'string') urls.push(parsed.continue_url);
    if (typeof parsed.checkout_url === 'string') urls.push(parsed.checkout_url);
    if (typeof parsed.products === 'string') {
      urls.push(...collectUrlsFromFactsBlocks([parsed.products]));
    }
    if (toolName === 'search_shop_policies_and_faqs') {
      if (Array.isArray(parsed.sources)) {
        for (const source of parsed.sources) {
          if (!source || typeof source !== 'object') continue;
          const url = (source as { url?: unknown }).url;
          if (typeof url === 'string' && url.trim()) pushResolved(url);
        }
      }
      if (typeof parsed.answer === 'string') {
        for (const u of urlsInReply(parsed.answer)) pushResolved(u);
        // Relative markdown w answer: [tekst](/pages/…)
        const relRe = /\[[^\]]*\]\((\/[^)\s]+)\)/g;
        let m: RegExpExecArray | null;
        while ((m = relRe.exec(parsed.answer)) !== null) {
          if (m[1]) pushResolved(m[1]);
        }
      }
    }
  } catch {
    /* not JSON */
  }
  return urls;
}
