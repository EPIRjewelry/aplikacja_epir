import type { Env } from './env';
import {
  INPSA_ORDERS_EVENTS_PATH,
  joinInpsaApiUrl,
  parseInpsaEnv,
  resolveInpsaHosts,
} from './inpsa-config';
import { InpsaOAuthClient, type FetchFn } from './inpsa-oauth';

/** Opaque event envelope — field names confirmed against portal at Shopify mapping time. */
export type InpsaOrderEventRecord = Record<string, unknown>;

export interface InpsaOrdersEventsResponse {
  events?: InpsaOrderEventRecord[];
  items?: InpsaOrderEventRecord[];
  data?: InpsaOrderEventRecord[];
  next?: string | null;
  cursor?: string | null;
}

export interface FetchOrdersEventsOptions {
  limit?: number;
  cursor?: string;
}

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

  async fetchOrdersEvents(options: FetchOrdersEventsOptions = {}): Promise<{
    url: string;
    status: number;
    body: InpsaOrdersEventsResponse | null;
  }> {
    const { accessToken } = await this.oauth.getAccessToken();
    const url = new URL(joinInpsaApiUrl(this.apiBase(), INPSA_ORDERS_EVENTS_PATH));
    if (options.limit != null) url.searchParams.set('limit', String(options.limit));
    if (options.cursor) url.searchParams.set('cursor', options.cursor);

    const response = await this.fetchFn(url.toString(), {
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

  /** Stage smoke: Client Credentials + one authenticated GET (orders events poll path). */
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

export function countOrderEvents(payload: InpsaOrdersEventsResponse): number {
  const list = payload.events ?? payload.items ?? payload.data ?? [];
  return Array.isArray(list) ? list.length : 0;
}
