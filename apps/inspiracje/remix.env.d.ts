/// <reference types="@remix-run/dev" />
/// <reference types="@remix-run/cloudflare" />

import {HydrogenCloudflareSession} from './src/session';

declare global {
  const process: {env: {NODE_ENV: 'production' | 'development'}};

  interface Env {
    SESSION_SECRET: string;
    BRAND?: string;
    PUBLIC_STORE_DOMAIN?: string;
    PUBLIC_STOREFRONT_URL?: string;
    PUBLIC_STOREFRONT_API_VERSION?: string;
    PUBLIC_CHECKOUT_DOMAIN?: string;
    PUBLIC_STOREFRONT_ID?: string;
    PUBLIC_CTA_URL?: string;
    PUBLIC_MAIN_SHOP_URL?: string;
  }
}

declare module '@remix-run/cloudflare' {
  export interface AppLoadContext {
    session: HydrogenCloudflareSession;
    env: Env;
  }
}
