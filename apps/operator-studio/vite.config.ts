import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  base: '/internal/operator-studio/',
  build: {
    outDir: path.resolve(__dirname, '../../workers/chat/operator-studio-dist'),
    emptyOutDir: true,
  },
});
