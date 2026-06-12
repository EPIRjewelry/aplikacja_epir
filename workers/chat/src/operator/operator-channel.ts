/**
 * Operator Studio v2 — kanał Project B (nie Gemma / nie buyer-facing).
 */
export type OperatorChatContextOverride = {
  storefrontId?: string;
  channel?: string;
  brand?: string;
};

export const OPERATOR_CHANNEL = 'operator' as const;
export const LEGACY_OPERATOR_CHANNEL = 'internal-dashboard' as const;

export function isOperatorChannel(channel?: string): boolean {
  return channel === OPERATOR_CHANNEL;
}

export function isLegacyOperatorChannel(channel?: string): boolean {
  return channel === LEGACY_OPERATOR_CHANNEL;
}

/** Project B — nowy operator lub stary solo-dev HTML (wsteczna kompatybilność). */
export function isProjectBChatChannel(channel?: string): boolean {
  return isOperatorChannel(channel) || isLegacyOperatorChannel(channel);
}

export const OPERATOR_CHAT_CONTEXT: OperatorChatContextOverride = {
  storefrontId: 'operator',
  channel: OPERATOR_CHANNEL,
  brand: 'epir',
};

/** Stary ingress solo-dev-chat (deprecated UI). */
export const LEGACY_OPERATOR_CHAT_CONTEXT: OperatorChatContextOverride = {
  storefrontId: 'online-store',
  channel: LEGACY_OPERATOR_CHANNEL,
  brand: 'epir',
};
