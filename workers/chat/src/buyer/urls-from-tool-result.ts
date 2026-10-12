import {continueUrlFromCartPayload, normalizeCartPayloadForParsing} from './cart-payload-normalize';
import {collectUrlsFromFactsBlocks} from './previous-response-products';
import {urlsInReply} from './reply-link-guard';

export function urlsFromToolResult(toolName: string, content: string): string[] {
  if (toolName === 'get_size_table') {
    return urlsInReply(content);
  }

  const urls: string[] = [];
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
          const url = (source as {url?: unknown}).url;
          if (typeof url === 'string' && url.trim()) urls.push(url.trim());
        }
      }
      if (typeof parsed.answer === 'string') {
        urls.push(...urlsInReply(parsed.answer));
      }
    }
  } catch {
    /* not JSON */
  }
  return urls;
}
