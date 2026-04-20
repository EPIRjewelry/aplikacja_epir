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
  const storefront = (await getStoreFrontClient(cloudflare)).storefront;
  const session = await HydrogenCloudflareSession.init(request, [
    cloudflare.env.SESSION_SECRET,
  ]);

  return {
    cloudflare,
    storefront,
    session,
    env: cloudflare.env,
  };
};

export const onRequest = createPagesFunctionHandler({
  build,
  getLoadContext,
  mode: process.env.NODE_ENV,
});
