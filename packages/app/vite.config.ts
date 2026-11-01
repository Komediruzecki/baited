import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { localSpeechBenchAssets } from './scripts/speech-bench/assets';
export default defineConfig({
  plugins: [react(), localSpeechBenchAssets()],
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
