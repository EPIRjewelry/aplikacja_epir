/// <reference types="@remix-run/dev" />
/// <reference types="@remix-run/cloudflare" />

import type {Storefront} from '@shopify/hydrogen';
import {HydrogenCloudflareSession} from './src/session';

declare global {
  /**
   * A global `process` object is only available during build to access NODE_ENV.
   */
  const process: {env: {NODE_ENV: 'production' | 'development'}};

  /**
   * Declare expected Env parameter in fetch handler.
   */
  interface Env {
    SESSION_SECRET: string;
    BRAND?: string;
    COLLECTION_FILTER?: string;
    PUBLIC_STOREFRONT_API_TOKEN: string;
    PRIVATE_STOREFRONT_API_TOKEN: string;
    PUBLIC_STORE_DOMAIN: string;
    PUBLIC_STOREFRONT_ID: string;
    /** @deprecated — Hydrogen używa `/api/chat` (BFF). Zostawione dla starych env. */
    CHAT_API_URL?: string;
    /** Ten sam sekret co `EPIR_CHAT_SHARED_SECRET` na workerze czatu — proxy S2S `/chat`. */
    EPIR_CHAT_SHARED_SECRET?: string;
    CHAT_SHARED_SECRET?: string;
    'X-EPIR-SHARED-SECRET'?: string;
  }
}

/**
 * Declare local additions to `AppLoadContext` to include the session utilities we injected in `server.ts`.
 */
declare module '@remix-run/cloudflare' {
  export interface AppLoadContext {
    cloudflare: EventContext<Env, string, unknown>;
    session: HydrogenCloudflareSession;
    storefront: Storefront;
    env: Env;
  }
}
