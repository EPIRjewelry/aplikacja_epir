import {defineWorkersConfig} from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: {configPath: './wrangler.toml'},
        miniflare: {
          kvNamespaces: ['CAMPAIGN_CACHE'],
          bindings: {
            SHOPIFY_STOREFRONT_DOMAIN: 'epir-art-silver-jewellery.myshopify.com',
            SHOPIFY_PUBLIC_DOMAIN: 'epirbizuteria.pl',
            SHOPIFY_STOREFRONT_API_VERSION: '2024-10',
            CAMPAIGN_LANDING_TYPE: 'app--280344821761--campaign_landing',
            SHOPIFY_STOREFRONT_TOKEN: 'test-storefront-token',
            LANDINGS_ENABLED: 'true',
          },
        },
      },
    },
  },
});
