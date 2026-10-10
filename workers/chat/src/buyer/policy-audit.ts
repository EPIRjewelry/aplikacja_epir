import type { Env } from '../config/bindings';
import { insertMemoryEvent } from '../memory/repo';

/** Rozstrzygnięcie 1(a): audyt policy_touch tylko dla pewnego shopify_customer_id. */
export async function recordPolicyTouchIfIdentified(
  env: Env,
  input: {
    shopifyCustomerId: string | null | undefined;
    sessionId?: string;
    toolCallId?: string;
    sources: string[];
    contentHash: string;
  },
): Promise<void> {
  const customerId = input.shopifyCustomerId?.trim();
  if (!customerId || !env.DB_CHATBOT) return;

  const refId = input.sources[0]?.trim() || 'kb_mcp';
  await insertMemoryEvent(env.DB_CHATBOT, {
    id: crypto.randomUUID(),
    shopifyCustomerId: customerId,
    kind: 'policy_touch',
    refId,
    refVersion: null,
    contentHash: input.contentHash,
    locale: 'pl',
    market: null,
    sessionId: input.sessionId ?? null,
    toolCallId: input.toolCallId ?? null,
    calledAt: Date.now(),
    meta: { sources: input.sources },
  });
}
