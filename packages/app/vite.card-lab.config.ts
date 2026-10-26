import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const appRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: appRoot,
  plugins: [react()],
  base: '/card-lab/',
  publicDir: false,
  envDir: false,
  envPrefix: [],
  resolve: {
    alias: [
      { find: /^\/fonts\//, replacement: `${resolve(appRoot, 'public/fonts')}/` },
      { find: /^\/brand\//, replacement: `${resolve(appRoot, 'public/brand')}/` },
    ],
  },
  build: {
    outDir: resolve(appRoot, '../landing/dist/site-dev/card-lab'),
    emptyOutDir: true,
    assetsInlineLimit: 0,
    cssCodeSplit: false,
    sourcemap: false,
    rollupOptions: { input: resolve(appRoot, 'card-lab.html') },
  },
});
