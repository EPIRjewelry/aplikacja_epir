/** OAuth scopes exactly as INPSA portal / ADR 0002. */
export const INPSA_OAUTH_SCOPES =
  'openid api:categories:read api:offers:read api:offers:write api:orders:read api:orders:write';

export type InpsaDeploymentEnv = 'stage' | 'production';

export interface InpsaHosts {
  tokenUrl: string;
  apiBase: string;
}

const STAGE_HOSTS: InpsaHosts = {
  tokenUrl: 'https://stage-account.inpost-group.com/oauth2/token',
  apiBase: 'https://stage-api.inpost-group.com/inpsa/',
};

const PRODUCTION_HOSTS: InpsaHosts = {
  tokenUrl: 'https://account.inpost-group.com/oauth2/token',
  apiBase: 'https://api.inpost-group.com/inpsa/',
};

/** ~5 minutes per ADR; used when `expires_in` is missing from token response. */
export const INPSA_DEFAULT_TOKEN_TTL_SECONDS = 300;

/** Refresh before expiry — shorter skew than ShipX (+1h) in workers/inpost. */
export const INPSA_TOKEN_REFRESH_SKEW_MS = 30_000;

export function parseInpsaEnv(raw: string | undefined): InpsaDeploymentEnv {
  const normalized = (raw ?? 'stage').trim().toLowerCase();
  if (normalized === 'production' || normalized === 'prod') return 'production';
  if (normalized === 'stage' || normalized === 'staging') return 'stage';
  throw new Error(`Unsupported INPSA_ENV: ${raw}`);
}

export function resolveInpsaHosts(deployment: InpsaDeploymentEnv): InpsaHosts {
  return deployment === 'production' ? PRODUCTION_HOSTS : STAGE_HOSTS;
}

/**
 * Relative path after `apiBase` for order event poll (UC v1).
 * Confirm segment against INPSA portal before first live smoke.
 */
export const INPSA_ORDERS_EVENTS_PATH = 'orders/events';

export function joinInpsaApiUrl(apiBase: string, relativePath: string): string {
  const base = apiBase.endsWith('/') ? apiBase : `${apiBase}/`;
  const path = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
  return `${base}${path}`;
}
