import path from 'path';
import {defineConfig} from 'vitest/config';
import {defineWorkersConfig} from '@cloudflare/vitest-pool-workers/config';

const rootDir = path.dirname(new URL(import.meta.url).pathname);

const nodeProject = defineConfig({
  resolve: {
    alias: {
      'cloudflare:workers': path.resolve(rootDir, 'test/__mocks__/cloudflare-workers.ts'),
    },
  },
  test: {
    name: 'chat-node',
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    exclude: ['test/gemma-v2/boundary-d1-gemma-customer-sql.test.ts'],
    testTimeout: 10000,
    env: {
      SHOP_DOMAIN: 'test-shop.myshopify.com',
      SHOPIFY_STOREFRONT_TOKEN: 'mock-storefront-token-12345',
      SHOPIFY_ACCESS_TOKEN: 'mock-admin-token-12345',
      SHOPIFY_ADMIN_TOKEN: 'mock-admin-token-12345',
      SHOPIFY_APP_SECRET: 'mock-app-secret-12345',
      WORKER_ORIGIN: 'https://test-worker.workers.dev',
    },
  },
});

const workersD1Project = defineWorkersConfig({
  test: {
    name: 'chat-d1-workers',
    include: ['test/gemma-v2/boundary-d1-gemma-customer-sql.test.ts'],
    testTimeout: 10000,
    poolOptions: {
      workers: {
        main: './test/gemma-v2/workers-d1-stub.ts',
        miniflare: {
          compatibilityDate: '2025-09-30',
          compatibilityFlags: ['nodejs_compat'],
          d1Databases: ['DB_CHATBOT'],
        },
      },
    },
  },
});

export default defineConfig({
  test: {
    projects: [nodeProject, workersD1Project],
  },
});
