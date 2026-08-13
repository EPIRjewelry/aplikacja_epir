import {
  createPagesFunctionHandler,
  type GetLoadContextFunction,
} from '@remix-run/cloudflare-pages';
import * as build from '@remix-run/dev/server-build';
import {HydrogenCloudflareSession} from './src/session';

/**
 * Archiwum Inspiracji — galeria read-only (snapshot JSON).
 * Storefront API nie jest wymagane w runtime; SESSION_SECRET wystarcza.
 */
const getLoadContext: GetLoadContextFunction<Env> = async ({
  context,
  request,
}) => {
  const cloudflare = context.cloudflare;
  if (!cloudflare.env.SESSION_SECRET) {
    const msg =
      '[inspiracje] Missing env: SESSION_SECRET. Set in Cloudflare Pages → Settings → Variables and Secrets.';
    console.error(msg);
    throw new Error(msg);
  }

  const session = await HydrogenCloudflareSession.init(request, [
    cloudflare.env.SESSION_SECRET,
  ]);

  return {session, env: cloudflare.env};
};

export const onRequest = createPagesFunctionHandler({
  build,
  getLoadContext,
  mode: process.env.NODE_ENV,
});
