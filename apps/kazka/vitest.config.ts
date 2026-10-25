import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vitest/config';

const appRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '~': path.resolve(appRoot, 'app'),
    },
  },
  test: {
    environment: 'node',
    include: ['app/**/*.test.ts'],
  },
});
