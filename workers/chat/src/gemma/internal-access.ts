import type {BuyerChannelId} from '../buyer/channel-switch';

export const GEMMA_TESTERS_KV_KEY = 'gemma:testers';

export async function readGemmaTesterIds(
  env: {GEMMA_RUNTIME_KV?: KVNamespace},
): Promise<Set<string>> {
  if (!env.GEMMA_RUNTIME_KV) return new Set();
  try {
    const raw = await env.GEMMA_RUNTIME_KV.get(GEMMA_TESTERS_KV_KEY);
    if (!raw?.trim()) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    const ids = parsed
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean);
    return new Set(ids);
  } catch (err) {
    console.warn('[gemma.internal_access] testers KV parse failed', err);
    return new Set();
  }
}

/**
 * E1: GE — App Proxy + allowlista.
 * E1b: GZ — pełny GID z S2S BFF (bez appProxyVerified).
 */
export function isAllowedGemmaInternalTurn(params: {
  channelId: BuyerChannelId;
  appProxyVerified?: boolean;
  loggedInCustomerId?: string | null;
  testerIds: Set<string>;
}): boolean {
  const customerId = params.loggedInCustomerId?.trim();
  if (!customerId) return false;
  if (!params.testerIds.has(customerId)) return false;

  if (params.channelId === 'epir-online-store') {
    return params.appProxyVerified === true;
  }
  if (params.channelId === 'epir-zareczyny') {
    return true;
  }
  return false;
}
