import {createStorefrontClient} from '@shopify/hydrogen';
import {createPagesFunctionHandler} from '@remix-run/cloudflare-pages';
import * as build from '@remix-run/dev/server-build';
import {HydrogenCloudflareSession} from './src/session';

type Context = EventContext<Env, string, unknown>;

const getStoreFrontClient = async (context: Context) => {
  return createStorefrontClient({
    /* Cache API instance */
    cache: await caches.open('hydrogen'),
    /* Runtime utility in serverless environments */
    waitUntil: (p: Promise<unknown>) => context.waitUntil(p),
    /* Private Storefront API token for your store */
    privateStorefrontToken: context.env.PRIVATE_STOREFRONT_API_TOKEN,
    /* Public Storefront API token for your store */
    publicStorefrontToken: context.env.PUBLIC_STOREFRONT_API_TOKEN,
    /* Desired Storefront API version to use */
    // storefrontApiVersion: env.PUBLIC_STOREFRONT_API_VERSION,
    /* Your store domain: "https://{shop}.myshopify.com" */
    storeDomain: `https://${context.env.PUBLIC_STORE_DOMAIN}`,
    /**
     * Storefront API headers containing:
     * - buyerIp: The IP address of the customer.
     * - requestGroupId: A unique ID to group all the logs for this request.
     * - cookie: The 'cookie' header from the request.
     */
    // storefrontHeaders: getStorefrontHeaders(request),
  });
};

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
