/**
 * Kontrakt wiadomości kolejki `memory-extract`.
 *
 * Producer: streamAssistant / SessionDO (po zakończeniu tury).
 * Consumer: workers/chat queue handler (patrz `memory/consumer.ts`).
 *
 * Idempotencja: `idempotencyKey = sha256-like(customer_id:last_message_id)`.
 */

export const MEMORY_EXTRACT_MESSAGE_VERSION = 1 as const;

export type MemoryExtractMessage = {
  v: typeof MEMORY_EXTRACT_MESSAGE_VERSION;
  kind: 'chat_turn_archive';
  sessionId: string;
  shopifyCustomerId: string;
  /** ID tury (ostatni message_ts lub hash) — do idempotentności. */
  idempotencyKey: string;
  /** Ostatnie N wiadomości do ekstrakcji (już zfiltrowane pod kątem KB-clamp). */
  turns: Array<{
    role: 'user' | 'assistant' | 'tool';
    content: string;
    ts?: number;
    toolName?: string;
    toolCallId?: string;
    toolCalls?: Array<{ id: string; name: string; arguments?: string }>;
    messageId?: string;
  }>;
  /** Kontekst storefrontu (locale, market, channel) — dla memory_events. */
  locale?: string;
  market?: string;
  channel?: string;
  storefrontId?: string;
  /** Timestamp w runtime producenta — do metryk end-to-end latency. */
  enqueuedAt: number;
  reason?: 'chat_turn' | 'image_surrogate' | 'backfill' | 'manual';
};

export function isMemoryExtractMessage(value: unknown): value is MemoryExtractMessage {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    v.v === MEMORY_EXTRACT_MESSAGE_VERSION &&
    typeof v.sessionId === 'string' &&
    typeof v.shopifyCustomerId === 'string' &&
    typeof v.idempotencyKey === 'string' &&
    Array.isArray(v.turns)
  );
}

/**
 * Prosta, deterministyczna funkcja skrótu (non-crypto) dla idempotencyKey.
 * Cloudflare Workers nie ma łatwego dostępu do crypto.subtle.digest synchronicznie,
 * ale Web Crypto jest dostępne — producer może użyć sha-256, tutaj fallback.
 */
export async function makeIdempotencyKey(customerId: string, lastMessageId: string): Promise<string> {
  const input = `${customerId}:${lastMessageId}`;
  if (typeof globalThis.crypto?.subtle?.digest === 'function') {
    const bytes = new TextEncoder().encode(input);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 40);
  }
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return `fnv_${hash.toString(16)}_${input.length}`;
}
