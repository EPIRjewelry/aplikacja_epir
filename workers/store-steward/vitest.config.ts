import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@epir/ham-core': path.resolve(root, '../../packages/ham-core/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
  },
});
