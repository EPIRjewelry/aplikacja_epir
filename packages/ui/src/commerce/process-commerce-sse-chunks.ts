import type {CommerceAction} from '../ChatWidget';
import {parseChatSseChunk} from './parse-chat-sse-chunk';

export type ProcessCommerceSseChunksOptions = {
  onCommerceAction?: (action: CommerceAction) => void;
  scheduleRevalidate?: () => void;
};

/**
 * Symuluje pętlę ChatWidget: chunki SSE → commerce_action + debounced revalidate.
 */
export function processCommerceSseChunks(
  chunks: string[],
  options: ProcessCommerceSseChunksOptions,
): number {
  let commerceActionCount = 0;
  for (const chunk of chunks) {
    const parsed = parseChatSseChunk(chunk);
    if (!parsed) continue;
    if (parsed.commerce_action && options.onCommerceAction) {
      options.onCommerceAction(parsed.commerce_action);
      commerceActionCount += 1;
    }
    if (parsed.commerce_action && options.scheduleRevalidate) {
      options.scheduleRevalidate();
    }
  }
  return commerceActionCount;
}
