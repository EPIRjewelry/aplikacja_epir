import type {CommerceAction} from '../ChatWidget';

export type ParsedChatSsePayload = {
  session_id?: string;
  error?: string;
  delta?: string;
  content?: string;
  done?: boolean;
  commerce_action?: CommerceAction;
};

/**
 * Parsuje pojedynczy chunk SSE (separator \\n\\n) — linie data: scalone jak w ChatWidget.
 */
export function parseChatSseChunk(rawChunk: string): ParsedChatSsePayload | null {
  const lines = rawChunk.split(/\r?\n/);
  const dataLines = lines.filter((l) => l.startsWith('data:')).map((l) => l.slice(5));
  const dataStr = dataLines.join('\n').trim();
  if (!dataStr || dataStr === '[DONE]') return null;
  try {
    return JSON.parse(dataStr) as ParsedChatSsePayload;
  } catch {
    return null;
  }
}

/**
 * Serializuje event commerce_action tak jak workers/chat sendSSE.
 */
export function formatCommerceActionSseChunk(commerceAction: CommerceAction): string {
  const payload = JSON.stringify({commerce_action: commerceAction});
  return `event: commerce_action\ndata: ${payload}\n\n`;
}
