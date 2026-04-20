import {createPagesFunctionHandler} from '@remix-run/cloudflare-pages';
import * as build from '@remix-run/dev/server-build';
import {HydrogenCloudflareSession} from './src/session';
import {getStoreFrontClient} from '@epir/utils';

type Context = EventContext<Env, string, unknown>;

export const onRequest = createPagesFunctionHandler({
  build,
  getLoadContext: async (context: Context) => ({
    cloudflare: context,
    storefront: (await getStoreFrontClient(context)).storefront,
    session: await HydrogenCloudflareSession.init(context.request, [
      context.env.SESSION_SECRET,
    ]),
    env: context.env,
  }),
  mode: process.env.NODE_ENV,
} as any);
