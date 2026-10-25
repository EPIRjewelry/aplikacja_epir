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
 * Portal OpenAPI (`gokart-api.html`): `GET /v1/organizations/{organizationId}/orders/events`
 * (relative to `…/inpsa/` API base).
 */
export function buildOrdersEventsRelativePath(organizationId: string): string {
  const id = organizationId.trim();
  if (!id) {
    throw new Error('INPSA_ORGANIZATION_ID must be a non-empty organization id');
  }
  return `v1/organizations/${id}/orders/events`;
}

/**
 * Portal OpenAPI: `GET /v1/organizations/{organizationId}/orders`
 * Query: `updatedAtGte`, `limit` 0–30, `offset`.
 */
export function buildOrdersListRelativePath(organizationId: string): string {
  const org = organizationId.trim();
  if (!org) {
    throw new Error('INPSA_ORGANIZATION_ID must be a non-empty organization id');
  }
  return `v1/organizations/${org}/orders`;
}

/** OpenAPI list limit is an integer in [0, 30], default 10. */
export function clampOrdersListLimit(raw: number | undefined): number {
  if (raw == null || !Number.isFinite(raw)) return 10;
  return Math.min(30, Math.max(0, Math.floor(raw)));
}

export function buildOrderRelativePath(organizationId: string, orderId: string): string {
  const org = organizationId.trim();
  const oid = orderId.trim();
  if (!org) {
    throw new Error('INPSA_ORGANIZATION_ID must be a non-empty organization id');
  }
  if (!oid) {
    throw new Error('orderId must be a non-empty marketplace order id');
  }
  return `v1/organizations/${org}/orders/${encodeURIComponent(oid)}`;
}

/** Plain var (or local `.dev.vars`) — not a long-lived secret. */
export function resolveInpsaOrganizationId(raw: string | undefined): string {
  const id = raw?.trim();
  if (!id) {
    throw new Error(
      'INPSA_ORGANIZATION_ID is required to call order events (GET /v1/organizations/{organizationId}/orders/events per INPSA portal OpenAPI)',
    );
  }
  return id;
}

export function joinInpsaApiUrl(apiBase: string, relativePath: string): string {
  const base = apiBase.endsWith('/') ? apiBase : `${apiBase}/`;
  const path = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
  return `${base}${path}`;
}
