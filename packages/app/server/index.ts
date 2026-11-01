import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadConfig } from './config.js';
import { createBait } from './app.js';
import { appDocumentFallback, terminalError, unknownDocument } from './error-pages.js';
import { isKnownAppPath } from '../shared/error-pages.js';

if (existsSync('.env')) process.loadEnvFile('.env');
const config = loadConfig(),
  development = !config.production && !process.argv.includes('--static'),
  bait = await createBait(config, development);
let closeVite = async () => {};
bait.app.use(unknownDocument);
if (!development) {
  const { default: express } = await import('express');
  bait.app.use(express.static(resolve('dist/client'), {
    index: false, maxAge: '1h',
    setHeaders: (res, file) => {
      if (file.endsWith('/moonshine-worker.js')) res.setHeader('Cache-Control', 'no-store');
    },
  }));
  bait.app.get('/{*path}', (req, res) => {
    if (isKnownAppPath(req.path)) res.sendFile(resolve('dist/client/index.html'));
    else res.status(404).json({ error: 'Route not found.' });
  });
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
    appType: 'custom',
  });
  bait.app.use(vite.middlewares);
  bait.app.use(appDocumentFallback({
    template: () => readFile(resolve('index.html'), 'utf8'),
    transform: (url, html) => vite.transformIndexHtml(url, html),
  }));
  closeVite = () => vite.close();
}
bait.app.use(terminalError);
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
