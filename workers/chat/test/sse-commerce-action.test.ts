import {describe, expect, it} from 'vitest';
import type {CommerceActionPayload} from '../src/utils/commerce-result';

/** Lustrzuje workers/chat sendSSE dla commerce_action. */
function formatWorkerCommerceActionSse(action: CommerceActionPayload): string {
  const payload = JSON.stringify({commerce_action: action});
  return `event: commerce_action\ndata: ${payload}\n\n`;
}

function parseDataLineFromChunk(chunk: string): Record<string, unknown> | null {
  const dataLine = chunk
    .split(/\r?\n/)
    .find((line) => line.startsWith('data:'));
  if (!dataLine) return null;
  const json = dataLine.slice(5).trim();
  if (!json) return null;
  return JSON.parse(json) as Record<string, unknown>;
}

describe('SSE commerce_action wire format', () => {
  it('serializes cart_updated payload for front parsers', () => {
    const action: CommerceActionPayload = {
      type: 'cart_updated',
      cart_id: 'gid://shopify/Cart/test?key=k1',
      checkout_url: 'https://epir-art-silver-jewellery.myshopify.com/cart/c/test?key=k1',
      line_count: 2,
    };

    const chunk = formatWorkerCommerceActionSse(action);
    const parsed = parseDataLineFromChunk(chunk);
    const commerce = parsed?.commerce_action as CommerceActionPayload | undefined;

    expect(commerce?.type).toBe('cart_updated');
    expect(commerce?.cart_id).toContain('gid://shopify/Cart/');
    expect(commerce?.checkout_url).toContain('/cart/c/');
    expect(commerce?.line_count).toBe(2);
  });
});
