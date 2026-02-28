import {createPagesFunctionHandler} from '@remix-run/cloudflare-pages';
import * as build from '@remix-run/dev/server-build';
import {HydrogenCloudflareSession} from './src/session';
import {getStoreFrontClient} from '@epir/utils';

type Context = EventContext<Env, string, unknown>;

export const onRequest = createPagesFunctionHandler({
  build,
  getLoadContext: async (context: Context) => {
    const missing: string[] = [];
    if (!context.env.SESSION_SECRET) missing.push('SESSION_SECRET');
    if (!context.env.PUBLIC_STOREFRONT_API_TOKEN) missing.push('PUBLIC_STOREFRONT_API_TOKEN');
    if (!context.env.PRIVATE_STOREFRONT_API_TOKEN) missing.push('PRIVATE_STOREFRONT_API_TOKEN');
    if (!context.env.PUBLIC_STORE_DOMAIN) missing.push('PUBLIC_STORE_DOMAIN');
    if (missing.length) {
      const msg = `[kazka] Missing env: ${missing.join(', ')}. Set in Cloudflare Pages → Settings → Variables and Secrets.`;
      console.error(msg);
      throw new Error(msg);
    }

    const storefront = (await getStoreFrontClient(context)).storefront;
    const session = await HydrogenCloudflareSession.init(context.request, [
      context.env.SESSION_SECRET,
    ]);
    return { storefront, session, env: context.env };
  },
  mode: process.env.NODE_ENV,
});
