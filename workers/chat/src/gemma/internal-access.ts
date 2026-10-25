import type {BuyerChannelId} from '../buyer/channel-switch';

export const GEMMA_TESTERS_KV_KEY = 'gemma:testers';

const CUSTOMER_GID_RE = /^gid:\/\/shopify\/Customer\/(\d+)$/i;
const CUSTOMER_NUMERIC_RE = /^\d+$/;

/**
 * Wspólny klucz allowlisty `gemma:testers`: numeric albo suffix GID.
 * Inne stringi (hint, email, obcięty GID) nie są ID.
 */
export function shopifyCustomerNumericId(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim() ?? '';
  if (!trimmed) return null;
  const gid = CUSTOMER_GID_RE.exec(trimmed);
  if (gid?.[1]) return gid[1];
  if (CUSTOMER_NUMERIC_RE.test(trimmed)) return trimmed;
  return null;
}

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
      .map((entry) => shopifyCustomerNumericId(entry))
      .filter((entry): entry is string => Boolean(entry));
    return new Set(ids);
  } catch (err) {
    console.warn('[gemma.internal_access] testers KV parse failed', err);
    return new Set();
  }
}

/**
 * E1: GE — App Proxy + allowlista (numeric).
 * GZ i GK — ID z S2S BFF (GID lub numeric), bez appProxyVerified.
 */
export function isAllowedGemmaInternalTurn(params: {
  channelId: BuyerChannelId;
  appProxyVerified?: boolean;
  loggedInCustomerId?: string | null;
  testerIds: Set<string>;
}): boolean {
  const customerId = shopifyCustomerNumericId(params.loggedInCustomerId);
  if (!customerId) return false;
  if (!params.testerIds.has(customerId)) return false;

  if (params.channelId === 'epir-online-store') {
    return params.appProxyVerified === true;
  }
  if (params.channelId === 'epir-zareczyny' || params.channelId === 'kazka-hydrogen') {
    return true;
  }
  return false;
}
