import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineWorkersConfig({
  resolve: {
    alias: {
      '@epir/ham-core': path.resolve(root, '../../packages/ham-core/src/index.ts'),
    },
  },
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