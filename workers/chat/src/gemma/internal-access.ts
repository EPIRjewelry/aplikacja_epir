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

/** E1: tylko GE (App Proxy + allowlista). GZ/kazka w internal → false do E1b. */
export function isAllowedGemmaInternalTurn(params: {
  channelId: BuyerChannelId;
  appProxyVerified?: boolean;
  loggedInCustomerId?: string | null;
  testerIds: Set<string>;
}): boolean {
  if (params.channelId !== 'epir-online-store') return false;
  if (params.appProxyVerified !== true) return false;
  const customerId = params.loggedInCustomerId?.trim();
  if (!customerId) return false;
  return params.testerIds.has(customerId);
}
