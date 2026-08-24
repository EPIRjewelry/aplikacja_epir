/// <reference types="@cloudflare/workers-types" />

export interface Env {
  /** InPost access token (JWT from login.inpost.pl). Preferred over client_id/secret for MVP. */
  INPOST_ACCESS_TOKEN?: string;
  /** InPost API client_id (used for OAuth2 client_credentials flow if ACCESS_TOKEN is not set). */
  INPOST_CLIENT_ID?: string;
  /** InPost API client_secret (used for OAuth2 client_credentials flow if ACCESS_TOKEN is not set). */
  INPOST_CLIENT_SECRET?: string;
  /** 'sandbox' | 'production' — also selects base URL. */
  INPOST_ENV: string;
  /** KV cache for points list and token persistence. */
  INPOST_POINTS_CACHE: KVNamespace;
  /** Allowed origins for CORS. */
  ALLOWED_ORIGINS?: string;
}
