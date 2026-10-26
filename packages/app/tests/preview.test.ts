import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import WebSocket, { WebSocketServer } from 'ws';
import { createBait } from '../server/app.js';
import { loadConfig } from '../server/config.js';

test('development preview upgrades coexist with speech and stay closed in static/production mode', async () => {
  for (const mode of ['development', 'static', 'production'] as const) {
    const dir = await mkdtemp(join(tmpdir(), 'bait-preview-'));
    const config = loadConfig({
      DATA_DIR: dir,
      ...(mode === 'production'
        ? { NODE_ENV: 'production', PUBLIC_URL: 'https://localhost:3000' }
        : {}),
    });
    const b = await createBait(config, mode !== 'static');
    const preview = new WebSocketServer({ noServer: true });
    b.server.on('upgrade', (req, socket, head) => {
      if (socket.destroyed || new URL(req.url!, config.origin).pathname !== '/__vite_hmr') return;
      preview.handleUpgrade(req, socket, head, (ws) => ws.send('preview-ready'));
    });
    await new Promise<void>((resolve) => b.server.listen(0, '127.0.0.1', resolve));
    const base = `ws://127.0.0.1:${(b.server.address() as AddressInfo).port}`;
    const connect = (path: string, origin = config.origin, protocol = 'vite-hmr') =>
      new Promise<number>((resolve, reject) => {
        let settled = false;
        const ws = new WebSocket(base + path, protocol, {
          headers: { Origin: origin, Host: new URL(config.origin).host },
          handshakeTimeout: 2000,
        });
        const done = (status: number) => {
          settled = true;
          ws.terminate();
          resolve(status);
        };
        ws.once('message', (data) => {
          assert.equal(data.toString(), 'preview-ready');
          done(101);
        });
        ws.once('unexpected-response', (_req, response) => {
          response.resume();
          done(response.statusCode!);
        });
        ws.on('error', (error) => {
          if (!settled) reject(error);
        });
      });
    try {
      assert.equal(await connect('/__vite_hmr'), mode === 'development' ? 101 : 403, mode);
      assert.equal(await connect('/__vite_hmr', 'https://unrelated.example'), 403);
      assert.equal(await connect('/__vite_hmr', config.origin, 'unrelated'), 403);
      assert.equal(await connect('/api/speech'), 403);
      assert.equal(await connect('/unknown'), 403);
    } finally {
      for (const ws of preview.clients) ws.terminate();
      await new Promise<void>((resolve) => preview.close(() => resolve()));
      await b.close();
      await rm(dir, { recursive: true, force: true });
    }
  }
});
