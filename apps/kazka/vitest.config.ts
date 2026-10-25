import path from 'node:path';
import {defineConfig} from 'vitest/config';

/** `npm run test` / `tsc` uruchamiane z katalogu `apps/kazka`. */
const appRoot = process.cwd();

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
