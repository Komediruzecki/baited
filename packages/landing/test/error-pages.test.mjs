import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { installErrorPages } from '../scripts/error-pages.mjs';
import worker from '../src/worker.ts';

test('landing build installs a standalone 404 with its shared CSS and local fonts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'baited-error-build-'));
  try {
    await installErrorPages(directory);
    const html = await readFile(join(directory, '404.html'), 'utf8');
    assert.match(html, /That link was a decoy/);
    assert.match(html, /href="\/error-page.css"/);
    assert.doesNotMatch(html, /<script|<style/);
    assert.deepEqual(await readFile(join(directory, 'error-page.css')), await readFile(new URL('../../app/public/error-page.css', import.meta.url)));
    for (const font of ['inter-latin.woff2', 'russo-one.ttf']) assert.ok((await readFile(join(directory, 'fonts', font))).length > 100);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('missing landing documents are branded with 404, including production-hidden labs', async () => {
  for (const path of ['/missing-page', '/card-lab']) {
    const response = await worker.fetch(new Request(`https://baited.maff.app${path}`, { headers: { accept: 'text/html' } }), {
      ENVIRONMENT: 'prod',
      ASSETS: { fetch: async () => new Response('Raw missing response', { status: 404 }) },
    });
    assert.equal(response.status, 404);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
    assert.match(await response.text(), /That link was a decoy/);
  }
});

test('landing asset outages produce a safe 503 document and an empty HEAD', async () => {
  for (const method of ['GET', 'HEAD']) {
    const response = await worker.fetch(new Request('https://baited.maff.app/', { method, headers: { accept: 'text/html' } }), {
      ENVIRONMENT: 'prod', ASSETS: { fetch: async () => { throw new Error('sensitive-internal-failure'); } },
    });
    assert.equal(response.status, 503);
    const html = await response.text();
    if (method === 'GET') assert.match(html, /A little out of fuel/);
    else assert.equal(html, '');
    assert.doesNotMatch(html, /sensitive-internal-failure|<script|<style/);
    assert.match(response.headers.get('content-security-policy'), /style-src 'self'/);
  }
});
