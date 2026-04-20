import {
  createPagesFunctionHandler,
  type GetLoadContextFunction,
} from '@remix-run/cloudflare-pages';
import * as build from '@remix-run/dev/server-build';
import {HydrogenCloudflareSession} from './src/session';
import {getStoreFrontClient} from '@epir/utils';

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
    const msg = `[kazka] Missing env: ${missing.join(', ')}. Set in Cloudflare Pages → Settings → Variables and Secrets.`;
    console.error(msg);
    throw new Error(msg);
  }

  const storefront = (await getStoreFrontClient(cloudflare)).storefront;
  const session = await HydrogenCloudflareSession.init(request, [
    cloudflare.env.SESSION_SECRET,
  ]);

  return {storefront, session, env: cloudflare.env};
};

export const onRequest = createPagesFunctionHandler({
  build,
  getLoadContext,
  mode: process.env.NODE_ENV,
});
