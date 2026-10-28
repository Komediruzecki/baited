import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CardArt } from '../client/CardArt';
import { CutCard } from '../client/CutCard';
import { ResultCard } from '../client/ResultCard';
import { cardArtPath, cardArtSource } from '../extension/presentation.js';

const id = '4891561a-8bad-459d-8e08-7f698910a72b';
const art = '31ab82b5-809d-4bc4-8272-ac914b3bcc3f';
const path = `/api/card-art/round/fixture-room/${id}/${art}/${'c'.repeat(43)}.png`;
const ownerPath = `/api/studio/card-art/${art}.png`;

test('artwork accepts only canonical round capabilities or explicit owner previews', () => {
  assert.equal(cardArtPath(path), path);
  assert.equal(cardArtPath(ownerPath), null);
  assert.equal(cardArtPath(ownerPath, true), ownerPath);
  for (const bad of [undefined, null, 1, `https://other.example${path}`, `//other.example${path}`, `data:image/png;base64,AA==`,
    'blob:https://game.example/fixture', `${path}?token=x`, `${path}#x`, `${path}\n`, path.replace('/round/', '/round/../'),
    path.replace('/fixture-room/', '/%66ixture-room/'), path.replace('.png', '.svg'), path.replace(art, art.toUpperCase()),
    path.replace('c'.repeat(43), 'c'.repeat(42)), ownerPath.replace('/studio/', '/studio/../studio/')]) {
    assert.equal(cardArtPath(bad, true), null, String(bad));
  }
});

test('native image destinations come from explicit runtime origin, never an uploaded URL', () => {
  assert.equal(cardArtSource(path), path);
  assert.equal(cardArtSource(path, 'https://play-baited.maff.app'), `https://play-baited.maff.app${path}`);
  assert.equal(cardArtSource(path, 'http://127.0.0.1:3330'), `http://127.0.0.1:3330${path}`);
  for (const origin of ['javascript:alert(1)', 'file:///tmp', 'https://user:pass@example.test', 'https://example.test/path',
    'https://example.test?query=x', 'https://example.test#x', '//other.example']) assert.equal(cardArtSource(path, origin), null);
  assert.equal(cardArtSource(`https://other.example${path}`, 'https://play-baited.maff.app'), null);
});

test('shared card renders uploaded art without altering its layout or accepting remote sources', () => {
  const render = (artUrl?: string, artPreview = false) => renderToStaticMarkup(React.createElement(CutCard, {
    word: 'radish', artUrl, artPreview, clues: ['root', 'salad'],
  }));
  const uploaded = render(path);
  assert.match(uploaded, /data-edition="cut-open"/);
  assert.match(uploaded, /data-art="art"/);
  assert.ok(uploaded.includes(`src="${path}"`));
  assert.match(uploaded, /referrerPolicy="no-referrer"/i);
  for (const rejected of [`https://other.example${path}`, ownerPath, 'data:image/svg+xml,<svg/>']) {
    const markup = render(rejected);
    assert.match(markup, /data-art="word"/);
    assert.doesNotMatch(markup, /<img\b/);
  }
  assert.ok(render(ownerPath, true).includes(`src="${ownerPath}"`));
  const fallback = renderToStaticMarkup(React.createElement(CardArt, { word: 'volcano', artUrl: 'https://other.example/a.png' }));
  assert.match(fallback, /cards\/proofs\/volcano\.png/);
  assert.doesNotMatch(fallback, /other\.example/);
});

test('pending or rejected results cannot expose an upload URL in Studio or OBS', () => {
  const result = { id, number: 1, word: 'radish', outcome: 'caught' as const,
    elapsed: 4, participants: 2, at: 1000, artUrl: path };
  for (const outcome of ['review', 'ended', 'skipped', 'overturned'] as const) {
    for (const broadcast of [false, true]) {
      const markup = renderToStaticMarkup(React.createElement(ResultCard, { result: { ...result, outcome }, broadcast }));
      assert.equal(markup.includes(path), false, `${outcome} / ${broadcast}`);
      assert.doesNotMatch(markup, /<img\b/);
    }
  }
  for (const outcome of ['caught', 'escaped'] as const) {
    for (const broadcast of [false, true]) assert.ok(renderToStaticMarkup(React.createElement(ResultCard, {
      result: { ...result, outcome }, broadcast,
    })).includes(path));
  }
});
