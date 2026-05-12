import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        main: './src/index.ts',
        miniflare: {
          compatibilityDate: '2025-09-30',
          compatibilityFlags: ['nodejs_compat'],
          d1Databases: ['DB'],
          kvNamespaces: ['CHART_EDGE_CACHE'],
          bindings: {
            SHOPIFY_WEBHOOK_SECRET: 'dev-placeholder-override-with-wrangler-secret-put',
          },
        },
      },
    },
  },
});