import {describe, expect, it, vi, beforeEach, afterEach} from 'vitest';
import {formatCommerceActionSseChunk, parseChatSseChunk} from './parse-chat-sse-chunk';
import {processCommerceSseChunks} from './process-commerce-sse-chunks';
import {createRevalidateScheduler} from './schedule-revalidate';
import type {CommerceAction} from '../ChatWidget';

const sampleAction: CommerceAction = {
  type: 'cart_updated',
  cart_id: 'gid://shopify/Cart/abc?key=secret',
  checkout_url: 'https://shop.example/checkouts/co/1',
  line_count: 1,
};

describe('parseChatSseChunk', () => {
  it('parses commerce_action from worker-style chunk', () => {
    const chunk = formatCommerceActionSseChunk(sampleAction);
    const parsed = parseChatSseChunk(chunk);
    expect(parsed?.commerce_action).toEqual(sampleAction);
  });
});

describe('processCommerceSseChunks + debounced revalidate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('invokes onCommerceAction per event but revalidate once after debounce', () => {
    const onCommerceAction = vi.fn();
    const revalidate = vi.fn();
    const scheduler = createRevalidateScheduler(revalidate, 300);
    const chunk = formatCommerceActionSseChunk(sampleAction);

    const count = processCommerceSseChunks([chunk, chunk], {
      onCommerceAction,
      scheduleRevalidate: () => scheduler.schedule(),
    });

    expect(count).toBe(2);
    expect(onCommerceAction).toHaveBeenCalledTimes(2);
    expect(revalidate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);

    expect(revalidate).toHaveBeenCalledTimes(1);
  });
});
