import type { Env } from './env';
import {
  buildOrderRelativePath,
  buildOrdersEventsRelativePath,
  buildOrdersListRelativePath,
  clampOrdersListLimit,
  joinInpsaApiUrl,
  parseInpsaEnv,
  resolveInpsaHosts,
  resolveInpsaOrganizationId,
} from './inpsa-config';
import type {
  InpsaOrder,
  InpsaOrderEvent,
  InpsaOrdersEventsResponse,
  InpsaOrdersListResponse,
} from './inpsa-types';
import { InpsaOAuthClient, type FetchFn } from './inpsa-oauth';

export type { InpsaOrderEvent, InpsaOrdersEventsResponse, InpsaOrder };
/** @deprecated use InpsaOrderEvent — kept for older test imports */
export type InpsaOrderEventRecord = InpsaOrderEvent;

export interface FetchOrdersEventsOptions {
  limit?: number;
  /** OpenAPI query: events older than this id. Do not pass the saved watermark here. */
  untilId?: string;
}

export interface FetchOrdersListOptions {
  updatedAtGte: string;
  limit?: number;
  offset?: number;
}

const RATE_LIMIT_ATTEMPTS = 3;

export interface InpsaSmokeResult {
  deployment: string;
  tokenFromCache: boolean;
  tokenExpiresAtMs: number;
  ordersEvents: {
    url: string;
    httpStatus: number;
    eventCount: number | null;
  };
}

export class InpsaApiClient {
  private readonly env: Env;
  private readonly oauth: InpsaOAuthClient;
  private readonly fetchFn: FetchFn;

  constructor(env: Env, fetchFn: FetchFn = fetch) {
    this.env = env;
    this.fetchFn = fetchFn;
    this.oauth = new InpsaOAuthClient(env, fetchFn);
  }

  get oauthClient(): InpsaOAuthClient {
    return this.oauth;
  }

  private apiBase(): string {
    const deployment = parseInpsaEnv(this.env.INPSA_ENV);
    return resolveInpsaHosts(deployment).apiBase;
  }

  /**
   * 429: honor Retry-After when present, else capped exponential backoff.
   * `X-RateLimit-*` names are not in the Redoc text extract; if Remaining is 0, only one retry.
   */
  private async fetchWithRateLimit(url: string, init: RequestInit): Promise<Response> {
    let last: Response | null = null;
    for (let attempt = 0; attempt < RATE_LIMIT_ATTEMPTS; attempt++) {
      const response = await this.fetchFn(url, init);
      last = response;
      if (response.status !== 429) return response;
      const remaining = response.headers.get('X-RateLimit-Remaining');
      const retryAfterSec = Number(response.headers.get('Retry-After'));
      const waitMs = Number.isFinite(retryAfterSec) && retryAfterSec >= 0
        ? retryAfterSec * 1000
        : Math.min(1000 * 2 ** attempt, 8000);
      const exhausted = attempt === RATE_LIMIT_ATTEMPTS - 1;
      const stopEarly = remaining === '0' && attempt >= 1;
      if (exhausted || stopEarly) return response;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    return last ?? new Response('INPSA rate limit', { status: 429 });
  }

  async fetchOrdersEvents(options: FetchOrdersEventsOptions = {}): Promise<{
    url: string;
    status: number;
    body: InpsaOrdersEventsResponse | null;
  }> {
    const organizationId = resolveInpsaOrganizationId(this.env.INPSA_ORGANIZATION_ID);
    const eventsPath = buildOrdersEventsRelativePath(organizationId);
    const { accessToken } = await this.oauth.getAccessToken();
    const url = new URL(joinInpsaApiUrl(this.apiBase(), eventsPath));
    if (options.limit != null) url.searchParams.set('limit', String(options.limit));
    if (options.untilId) url.searchParams.set('untilId', options.untilId);

    const response = await this.fetchWithRateLimit(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    let body: InpsaOrdersEventsResponse | null = null;
    if (response.ok) {
      body = (await response.json()) as InpsaOrdersEventsResponse;
    }

    return { url: url.toString(), status: response.status, body };
  }

  async fetchOrder(orderId: string): Promise<{
    url: string;
    status: number;
    body: InpsaOrder | null;
  }> {
    const organizationId = resolveInpsaOrganizationId(this.env.INPSA_ORGANIZATION_ID);
    const path = buildOrderRelativePath(organizationId, orderId);
    const { accessToken } = await this.oauth.getAccessToken();
    const url = joinInpsaApiUrl(this.apiBase(), path);

    const response = await this.fetchWithRateLimit(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    let body: InpsaOrder | null = null;
    if (response.ok) {
      body = (await response.json()) as InpsaOrder;
    }

    return { url, status: response.status, body };
  }

  async fetchOrders(options: FetchOrdersListOptions): Promise<{
    url: string;
    status: number;
    body: InpsaOrdersListResponse | null;
  }> {
    const organizationId = resolveInpsaOrganizationId(this.env.INPSA_ORGANIZATION_ID);
    const path = buildOrdersListRelativePath(organizationId);
    const { accessToken } = await this.oauth.getAccessToken();
    const url = new URL(joinInpsaApiUrl(this.apiBase(), path));
    url.searchParams.set('updatedAtGte', options.updatedAtGte);
    url.searchParams.set('limit', String(clampOrdersListLimit(options.limit)));
    url.searchParams.set('offset', String(Math.max(0, options.offset ?? 0)));

    const response = await this.fetchWithRateLimit(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    let body: InpsaOrdersListResponse | null = null;
    if (response.ok) {
      body = (await response.json()) as InpsaOrdersListResponse;
    }
    return { url: url.toString(), status: response.status, body };
  }

  async runStageSmoke(options: FetchOrdersEventsOptions = { limit: 1 }): Promise<InpsaSmokeResult> {
    const deployment = parseInpsaEnv(this.env.INPSA_ENV);
    const token = await this.oauth.getAccessToken();
    const poll = await this.fetchOrdersEvents(options);

    return {
      deployment,
      tokenFromCache: token.fromCache,
      tokenExpiresAtMs: token.expiresAtMs,
      ordersEvents: {
        url: poll.url,
        httpStatus: poll.status,
        eventCount: poll.body ? countOrderEvents(poll.body) : null,
      },
    };
  }
}

export function extractOrderEvents(body: InpsaOrdersEventsResponse | null): InpsaOrderEvent[] {
  if (!body) return [];
  const list = body.data ?? body.events ?? body.items ?? [];
  return Array.isArray(list) ? list : [];
}

export function countOrderEvents(payload: InpsaOrdersEventsResponse): number {
  return extractOrderEvents(payload).length;
}
