import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig } from './config.js';
import { createBait } from './app.js';

if (existsSync('.env')) process.loadEnvFile('.env');
const config = loadConfig(),
  development = !config.production && !process.argv.includes('--static'),
  bait = await createBait(config, development);
let closeVite = async () => {};
if (!development) {
  const { default: express } = await import('express');
  bait.app.use(express.static(resolve('dist/client'), {
    index: false, maxAge: '1h',
    setHeaders: (res, file) => {
      if (file.endsWith('/moonshine-worker.js')) res.setHeader('Cache-Control', 'no-store');
    },
  }));
  bait.app.get('/{*path}', (_req, res) => res.sendFile(resolve('dist/client/index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({
    server: {
      middlewareMode: true,
      hmr: {
        server: bait.server,
        path: '/__vite_hmr',
        host: new URL(config.origin).hostname,
        clientPort:
          Number(new URL(config.origin).port) || (config.origin.startsWith('https:') ? 443 : 80),
      },
    },
    appType: 'spa',
  });
  bait.app.use(vite.middlewares);
  closeVite = () => vite.close();
}
bait.server.listen(config.port, config.host, () =>
  console.log(
    `BAIT is ready at ${config.origin}\n${config.demo ? 'Local demo is enabled.' : 'Local demo is disabled.'} Twitch: ${config.twitchReady ? 'configured' : 'needs credentials'}. Speech: ${config.speechProvider === 'moonshine' ? 'Moonshine in the browser' : config.speechKey ? 'Deepgram configured' : 'needs DEEPGRAM_API_KEY'}.`,
  ),
);
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    if (closing) return;
    closing = true;
    void closeVite()
      .then(() => bait.close())
      .finally(() => process.exit(0));
  });
