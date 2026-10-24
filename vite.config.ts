import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist/client' },
  server: {
    host: '127.0.0.1',
    fs: {
      strict: true,
      allow: ['client', 'shared', 'public', 'node_modules', 'index.html'].map((p) => resolve(p)),
      deny: ['.env', '.env.*', '**/data/**', '**/*.pem', '**/*.key', '**/.git/**'],
    },
  },
});
