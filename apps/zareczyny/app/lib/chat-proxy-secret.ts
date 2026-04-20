const KEYS = [
  'EPIR_CHAT_SHARED_SECRET',
  'CHAT_SHARED_SECRET',
  'X-EPIR-SHARED-SECRET',
] as const;

/**
 * Odczyt sekretu S2S z `context.env` — dynamiczne klucze, żeby minifikator nie „uciął” dostępu.
 * Używany wyłącznie po stronie serwera (Pages Functions).
 */
export function getEpirChatSharedSecret(
  env: Record<string, unknown> | undefined,
): string | undefined {
  if (!env || typeof env !== 'object') return undefined;
  const raw = env as Record<string, unknown>;
  for (const k of KEYS) {
    const v = raw[k];
    if (typeof v === 'string') {
      const t = v.trim();
      if (t.length > 0) return t;
    }
  }
  return undefined;
}
