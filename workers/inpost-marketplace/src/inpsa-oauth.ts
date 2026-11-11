import type { Env } from './env';
import {
  INPSA_DEFAULT_TOKEN_TTL_SECONDS,
  INPSA_OAUTH_SCOPES,
  INPSA_TOKEN_REFRESH_SKEW_MS,
  parseInpsaEnv,
  resolveInpsaHosts,
} from './inpsa-config';

export type FetchFn = typeof fetch;

export interface TokenCacheEntry {
  accessToken: string;
  expiresAtMs: number;
}

export interface InpsaTokenResult {
  accessToken: string;
  expiresAtMs: number;
  fromCache: boolean;
}

export class InpsaOAuthClient {
  private readonly env: Env;
  private readonly fetchFn: FetchFn;
  private cache: TokenCacheEntry | null = null;

  constructor(env: Env, fetchFn: FetchFn = fetch) {
    this.env = env;
    this.fetchFn = fetchFn;
  }

  clearCache(): void {
    this.cache = null;
  }

  async getAccessToken(): Promise<InpsaTokenResult> {
    const now = Date.now();
    if (this.cache && this.cache.expiresAtMs - now > INPSA_TOKEN_REFRESH_SKEW_MS) {
      return { accessToken: this.cache.accessToken, expiresAtMs: this.cache.expiresAtMs, fromCache: true };
    }

    const clientId = this.env.INPSA_CLIENT_ID?.trim();
    const clientSecret = this.env.INPSA_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) {
      throw new Error('INPSA_CLIENT_ID and INPSA_CLIENT_SECRET must be configured');
    }

    const deployment = parseInpsaEnv(this.env.INPSA_ENV);
    const { tokenUrl } = resolveInpsaHosts(deployment);

    const body = new URLSearchParams();
    body.set('grant_type', 'client_credentials');
    body.set('scope', INPSA_OAUTH_SCOPES);

    const basicAuth = btoa(`${clientId}:${clientSecret}`);
    const response = await this.fetchFn(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth}`,
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const detail = await safeResponseText(response);
      throw new Error(`INPSA token request failed: ${response.status} ${response.statusText}${detail ? ` — ${detail}` : ''}`);
    }

    const data = (await response.json()) as { access_token?: string; expires_in?: number };
    const accessToken = data.access_token?.trim();
    if (!accessToken) {
      throw new Error('INPSA token response missing access_token');
    }

    const expiresInSec = typeof data.expires_in === 'number' && data.expires_in > 0
      ? data.expires_in
      : INPSA_DEFAULT_TOKEN_TTL_SECONDS;
    const expiresAtMs = now + expiresInSec * 1000;

    this.cache = { accessToken, expiresAtMs };
    return { accessToken, expiresAtMs, fromCache: false };
  }
}

async function safeResponseText(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.length > 500 ? `${text.slice(0, 500)}…` : text;
  } catch {
    return '';
  }
}
