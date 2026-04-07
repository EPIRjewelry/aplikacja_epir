const KEYS = [
  'EPIR_CHAT_SHARED_SECRET',
  'CHAT_SHARED_SECRET',
  'X-EPIR-SHARED-SECRET',
] as const;

export function getEpirChatSharedSecret(
  env: Record<string, unknown> | undefined,
): string | undefined {
  if (!env || typeof env !== 'object') return undefined;
  const raw = env as Record<string, unknown>;
  for (const key of KEYS) {
    const value = raw[key];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) return trimmed;
    }
  }
  return undefined;
}
