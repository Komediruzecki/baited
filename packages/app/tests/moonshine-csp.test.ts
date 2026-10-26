import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createBait } from '../server/app.js';
import { loadConfig } from '../server/config.js';

for (const provider of ['moonshine', 'deepgram']) {
  test(`production ${provider} CSP limits JS evaluation to Moonshine worker entrypoints`, async (t) => {
    const dir = await mkdtemp(join(tmpdir(), 'bait-worker-csp-'));
    const app = await createBait(loadConfig({ PORT: '0', NODE_ENV: 'production',
      PUBLIC_URL: 'https://bait.example', DATA_DIR: dir, SPEECH_PROVIDER: provider }));
    await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
    t.after(async () => { await app.close(); await rm(dir, { recursive: true, force: true }); });
    const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
    const entrypoints = ['/moonshine-worker.js?v=0.1.5-csp1', '/moonshine/runtime-0.1.5-csp1/moonshine.mjs'];
    const strict = ['/', '/studio', '/api/health', '/assets/studio.js', '/pcm-worklet.js',
      '/moonshine/runtime-0.1.5-csp1/index.js', '/moonshine/runtime/moonshine.mjs',
      '/moonshine-worker.js/other', '/moonshine/runtime-0.1.5-csp1/moonshine.mjs/other'];
    for (const method of ['GET', 'HEAD']) {
      for (const path of [...entrypoints, ...strict]) {
        const response = await fetch(base + path, { method, headers: { Host: 'bait.example' } });
        const csp = response.headers.get('content-security-policy')!;
        const directives = new Map(csp.split(';').map(d => { const [key, ...values] = d.trim().split(/\s+/); return [key, values]; }));
        assert.equal(directives.get('script-src')?.includes("'unsafe-eval'"),
          provider === 'moonshine' && entrypoints.includes(path), `${method} ${path}`);
        assert.deepEqual(directives.get('worker-src'), ["'self'"]);
        assert.deepEqual(directives.get('object-src'), ["'none'"]);
        if (provider === 'moonshine') {
          assert.equal(response.headers.get('cross-origin-embedder-policy'), 'require-corp');
          assert.equal(response.headers.get('cross-origin-opener-policy'), 'same-origin');
          assert.deepEqual(directives.get('connect-src'), ["'self'", 'https://download.moonshine.ai']);
          if (path === entrypoints[1]) {
            assert.equal(response.status, 200);
            assert.equal(response.headers.get('cache-control'), 'no-store');
          }
        }
        await response.arrayBuffer();
      }
    }
  });
}
