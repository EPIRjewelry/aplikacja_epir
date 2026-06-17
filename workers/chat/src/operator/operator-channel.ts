/**
 * Operator Studio v2 — kanał Project B (nie Gemma / nie buyer-facing).
 */
export type OperatorChatContextOverride = {
  storefrontId?: string;
  channel?: string;
  brand?: string;
};

export const OPERATOR_CHANNEL = 'operator' as const;

export function isOperatorChannel(channel?: string): boolean {
  return channel === OPERATOR_CHANNEL;
}

/** Project B — Operator Studio (kanał `operator`). */
export function isProjectBChatChannel(channel?: string): boolean {
  return isOperatorChannel(channel);
}

export const OPERATOR_CHAT_CONTEXT: OperatorChatContextOverride = {
  storefrontId: 'operator',
  channel: OPERATOR_CHANNEL,
  brand: 'epir',
};
