import {
  createPagesFunctionHandler,
  type GetLoadContextFunction,
} from '@remix-run/cloudflare-pages';
import * as build from '@remix-run/dev/server-build';
import {getStoreFrontClient} from '@epir/utils';
import {
  EPIR_SESSION_BRIDGE_KEY,
  HydrogenCloudflareSession,
  type EpirZareczynySession,
} from './src/session';
import {createZareczynyCustomerAccount} from './app/lib/customer-account.server';

const getLoadContext: GetLoadContextFunction<Env> = async ({
  context,
  request,
}) => {
  const cloudflare = context.cloudflare;

  const missing: string[] = [];
  if (!cloudflare.env.SESSION_SECRET) missing.push('SESSION_SECRET');
  if (!cloudflare.env.PUBLIC_STOREFRONT_API_TOKEN)
    missing.push('PUBLIC_STOREFRONT_API_TOKEN');
  if (!cloudflare.env.PRIVATE_STOREFRONT_API_TOKEN)
    missing.push('PRIVATE_STOREFRONT_API_TOKEN');
  if (!cloudflare.env.PUBLIC_STORE_DOMAIN) missing.push('PUBLIC_STORE_DOMAIN');
  if (missing.length) {
    console.warn(
      `[zareczyny] Missing env: ${missing.join(', ')}. ` +
        `Set in Cloudflare Pages → Settings → Variables and Secrets.`,
    );
  }

  const session: EpirZareczynySession = await HydrogenCloudflareSession.init(
    request,
    cloudflare.env.SESSION_SECRET ? [cloudflare.env.SESSION_SECRET] : null,
  );

  const data = context.cloudflare.data;
  if (data === undefined || data === null || typeof data !== 'object') {
    throw new Error(
      '[zareczyny] EventContext.data is required for session bridge (__epirSession)',
    );
  }
  (data as Record<string, unknown>)[EPIR_SESSION_BRIDGE_KEY] = session;

  const storefront = (await getStoreFrontClient({...cloudflare, request})).storefront;

  const waitUntil = (promise: Promise<unknown>) => {
    cloudflare.waitUntil(promise);
  };

  const customerAccount = createZareczynyCustomerAccount({
    request,
    session,
    env: cloudflare.env,
    waitUntil,
  });

  return {
    cloudflare,
    storefront,
    session,
    customerAccount,
    env: cloudflare.env,
  };
};

const remixOnRequest = createPagesFunctionHandler({
  build,
  getLoadContext,
  mode: process.env.NODE_ENV,
});

export const onRequest = async (context: EventContext<Env, string, unknown>) => {
  const response = await remixOnRequest(context);
  const session = context.data?.[EPIR_SESSION_BRIDGE_KEY] as
    | EpirZareczynySession
    | undefined;
  if (session?.isPending) {
    const cookie = await session.commit();
    if (cookie) {
      response.headers.append('Set-Cookie', cookie);
    }
  }
  return response;
};
