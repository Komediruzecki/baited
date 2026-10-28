import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CardLibraryStore, CardLibraryError } from '../server/card-library.js';
import { packInputSchema, matchesCustomTarget, type PackInput } from '../shared/card-library.js';
import { fixture } from './fixtures.js';

const pack = (patch: Partial<PackInput> = {}): PackInput => ({
  name: 'Kitchen questions', status: 'published',
  cards: ['cinnamon', 'coconut', 'spatula', 'broccoli', 'kettle', 'radish'].map((target) => ({ target, difficulty: 'medium', blockedClues: ['kitchen', 'food'], acceptedSpellings: [] })),
  ...patch,
});
const editable = (p: ReturnType<CardLibraryStore['view']>['packs'][number]): PackInput => ({ id: p.id, expectedRevision: p.revision, name: p.name, status: p.status === 'archived' ? 'draft' : p.status, cards: p.cards.map(({ revision: _revision, ...card }) => card) });
async function library(t: { after: (fn: () => Promise<void>) => void }, writer?: (path: string, text: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'bait-card-library-'));
  const store = new CardLibraryStore(dir, writer);
  await store.load();
  t.after(() => rm(dir, { recursive: true, force: true }));
  return { store, dir };
}

test('card validation normalizes words and rejects ambiguity, invalid clues and unsafe text', () => {
  const valid = packInputSchema.parse(pack());
  assert.equal(valid.cards.length, 6);
  for (const target of ['two words', '<b>cat</b>', 'caf\u0000e', '12345', 'a', 'a'.repeat(25)]) {
    assert.equal(packInputSchema.safeParse(pack({ cards: [{ target, difficulty: 'easy', blockedClues: [] }], status: 'draft' })).success, false);
  }
  assert.equal(packInputSchema.safeParse(pack({ name: '<script>' })).success, false);
  assert.equal(packInputSchema.safeParse(pack({ cards: [{ target: 'treat', difficulty: 'medium', blockedClues: ['treat', 'treat'] }], status: 'draft' })).success, false);
  assert.equal(packInputSchema.safeParse(pack({ cards: [{ target: 'color', acceptedSpellings: ['colour'], difficulty: 'easy', blockedClues: [] }, { target: 'colour', difficulty: 'easy', blockedClues: [] }], status: 'draft' })).success, false);
  assert.equal(packInputSchema.safeParse(pack({ cards: [{ target: 'donut', difficulty: 'easy', blockedClues: [] }, { target: 'doughnut', difficulty: 'easy', blockedClues: [] }], status: 'draft' })).success, false);
  assert.equal(packInputSchema.safeParse(pack({ cards: [{ target: 'color', acceptedSpellings: ['colour'], difficulty: 'medium', blockedClues: ['colour', 'paint'] }], status: 'draft' })).success, false);
  const normalized = packInputSchema.parse(pack({ cards: [{ target: '  COLOR  ', difficulty: 'easy', acceptedSpellings: [' Colour '], blockedClues: [] }], status: 'draft' }));
  assert.equal(normalized.cards[0].target, 'color');
  assert.deepEqual(normalized.cards[0].acceptedSpellings, ['colour']);
  assert.equal(matchesCustomTarget('What a colour!', 'color', ['colour']), true);
  assert.equal(matchesCustomTarget('Colourful', 'color', ['colour']), false);
  assert.equal(matchesCustomTarget('doughnut', 'donut'), true);
});

test('owner library persists with revisions, is isolated and rejects stale concurrent changes', async (t) => {
  const { store, dir } = await library(t);
  const id = await store.savePack('channel-a', pack());
  const original = store.view('channel-a', 'medium');
  assert.equal(store.view('channel-b', 'medium').packs.length, 0);
  await assert.rejects(store.savePack('channel-b', editable(original.packs[0])), (e: unknown) => e instanceof CardLibraryError && e.status === 404);
  await assert.rejects(store.select('channel-b', { mode: 'custom', packId: id }, 0, 'medium'));
  const results = await Promise.allSettled([
    store.savePack('channel-a', { ...editable(original.packs[0]), name: 'First edit' }),
    store.savePack('channel-a', { ...editable(original.packs[0]), name: 'Stale edit' }),
  ]);
  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[1].status, 'rejected');
  const current = store.view('channel-a', 'medium');
  assert.equal(current.packs[0].revision, 2);
  assert.equal(current.packs[0].name, 'First edit');
  await store.select('channel-a', { mode: 'custom', packId: id }, current.revision, 'medium');
  const reloaded = new CardLibraryStore(dir); await reloaded.load();
  assert.deepEqual(reloaded.view('channel-a', 'medium'), store.view('channel-a', 'medium'));
  await store.archive('channel-a', id, 2);
  assert.deepEqual(store.view('channel-a', 'medium').selection, { mode: 'builtin', packId: null });
  await assert.rejects(store.select('channel-a', { mode: 'custom', packId: id }, store.view('channel-a', 'medium').revision, 'medium'), /published/);
  await store.deleteOwner('channel-a');
  assert.equal(store.view('channel-a', 'medium').packs.length, 0);
  const deleted = new CardLibraryStore(dir); await deleted.load();
  assert.equal(deleted.view('channel-a', 'medium').packs.length, 0);
});

test('custom art attaches only with owner approval and survives reload without changing round snapshots', async (t) => {
  const { dir } = await library(t);
  const artId = 'a3452a88-1c33-426b-a345-32e13bc7a513';
  const approved = (owner: string, id: string) => owner === 'channel-a' && id === artId;
  const store = new CardLibraryStore(dir, undefined, approved); await store.load();
  const input = pack(); input.cards[0] = { ...input.cards[0], artId };
  await assert.rejects(new CardLibraryStore(dir).savePack('channel-a', input), /approved image/);
  await assert.rejects(store.savePack('channel-b', input), /approved image/);
  const id = await store.savePack('channel-a', input);
  await store.select('channel-a', { mode: 'custom', packId: id }, 1, 'medium');
  assert.deepEqual([...store.referencedArt('channel-a')], [artId]);
  const snapshot = store.resolve('channel-a', 'medium');
  assert.equal(snapshot[0].artId, artId);
  const reloaded = new CardLibraryStore(dir, undefined, approved); await reloaded.load();
  assert.equal(reloaded.resolve('channel-a', 'medium')[0].artId, artId);
  const edit = editable(store.view('channel-a', 'medium').packs[0]);
  delete edit.cards[0].artId; await store.savePack('channel-a', edit);
  assert.equal(store.referencedArt('channel-a').size, 0);
  assert.equal(snapshot[0].artId, artId);
  assert.equal(store.resolve('channel-a', 'medium')[0].artId, undefined);
  assert.equal(packInputSchema.safeParse({ ...input, cards: [{ ...input.cards[0], artId: 'https://bad.example/image.png' }] }).success, false);
});

test('quota is bounded and archived packs can be restored without consuming another slot', async (t) => {
  const { store } = await library(t);
  const single = pack({ status: 'draft', cards: pack().cards.slice(0, 1) });
  for (let i = 0; i < 10; i++) {
    const id = await store.savePack('a', single);
    await store.archive('a', id, 1);
  }
  await assert.rejects(store.savePack('a', single), /ten packs/);
  const archived = store.view('a', 'medium').packs[0];
  await store.savePack('a', editable(archived));
  assert.equal(store.view('a', 'medium').packs.length, 10);
  assert.equal(store.view('a', 'medium').packs[0].status, 'draft');
  await assert.rejects(store.savePack('a', editable(archived)), /another tab/);
  const cards: PackInput['cards'] = Array.from({ length: 100 }, (_, i) => ({ target: `word${String.fromCharCode(97 + Math.floor(i / 26))}${String.fromCharCode(97 + i % 26)}`, difficulty: 'easy', blockedClues: [] }));
  await store.savePack('b', pack({ cards }));
  await assert.rejects(store.savePack('b', single), /100 cards/);
});

test('a corrupt or future-version card store fails closed without replacing saved data', async (t) => {
  const { dir } = await library(t);
  for (const contents of ['{', JSON.stringify({ version: 2, channels: {} }), JSON.stringify({ version: 1, channels: { a: { revision: 0 } } })]) {
    await writeFile(join(dir, 'card-library.json'), contents);
    await assert.rejects(new CardLibraryStore(dir).load());
    assert.equal(await readFile(join(dir, 'card-library.json'), 'utf8'), contents);
  }
});

test('custom spellings match private guesses and cannot repeat immediately across pack edits', () => {
  const { game, advance } = fixture();
  game.data.settings.callBait = true;
  const easy = (target: string, acceptedSpellings: string[] = []) => ({ target, acceptedSpellings, difficulty: 'easy' as const, blockedClues: [] });
  game.data.settings.difficulty = 'easy';
  game.deckFor = () => [easy('donut')];
  game.begin();
  assert.equal(game.guess(game.round!.id, game.round!.epoch, 'doughnut').correct, true);
  advance(11000);
  game.deckFor = () => [easy('doughnut'), easy('cello')];
  game.begin();
  assert.equal(game.round!.word, 'cello');
  game.end('ended'); advance(11000);
  game.deckFor = () => [easy('color', ['colour'])];
  game.begin();
  assert.equal(game.guess(game.round!.id, game.round!.epoch, 'colour').correct, true);
  assert.equal(JSON.stringify(game.view('studio')).includes('recentCardForms'), false);
  advance(11000);
  game.deckFor = () => [easy('colour'), easy('coconut')];
  game.begin();
  assert.equal(game.round!.word, 'coconut');
});

test('failed writes retain the last saved revision and retry succeeds', async (t) => {
  let fail = false;
  const { store } = await library(t, async () => { if (fail) throw new Error('disk full'); });
  await store.savePack('a', pack());
  const before = store.view('a', 'medium');
  fail = true;
  await assert.rejects(store.savePack('a', { ...editable(before.packs[0]), name: 'Not saved' }), (e: unknown) => e instanceof CardLibraryError && e.status === 503);
  assert.deepEqual(store.view('a', 'medium'), before);
  fail = false;
  await store.savePack('a', { ...editable(before.packs[0]), name: 'Saved now' });
  assert.equal(store.view('a', 'medium').packs[0].name, 'Saved now');
});

test('drafts, six-card minimum, mixed collisions and demo persistence obey boundaries', async (t) => {
  const { store, dir } = await library(t);
  const draftId = await store.savePack('a', pack({ status: 'draft', cards: pack().cards.slice(0, 1) }));
  await assert.rejects(store.select('a', { mode: 'custom', packId: draftId }, 1, 'medium'), /published/);
  const id = await store.savePack('a', pack());
  await assert.rejects(store.select('a', { mode: 'custom', packId: id }, 2, 'hard'), /six hard/);
  await store.select('a', { mode: 'mixed', packId: id }, 2, 'medium');
  const mixed = store.resolve('a', 'medium');
  assert.equal(mixed.length, new Set(mixed.map((c) => c.target)).size);
  store.markEphemeral('demo-test');
  await store.savePack('demo-test', pack());
  assert.equal(store.view('demo-test', 'medium').packs.length, 1);
  assert.equal((await readFile(join(dir, 'card-library.json'), 'utf8')).includes('demo-test'), false);
});

test('custom rounds snapshot clues, spellings and revisions, repeat small decks safely and hide private data', async (t) => {
  const { store } = await library(t);
  const input = pack();
  input.cards[0] = { target: 'color', acceptedSpellings: ['colour'], difficulty: 'medium', blockedClues: ['paint', 'shade'] };
  const id = await store.savePack('owner', input);
  await store.select('owner', { mode: 'custom', packId: id }, 1, 'medium');
  const { game, advance, transcript, now } = fixture();
  game.deckFor = (difficulty) => store.resolve('owner', difficulty);
  game.data.settings.callBait = true;
  game.begin();
  assert.equal(game.round!.word, 'color');
  const revision = game.round!.cardRevision;
  const changed = editable(store.view('owner', 'medium').packs[0]);
  changed.cards[0] = { ...changed.cards[0], target: 'cello', acceptedSpellings: [], blockedClues: ['strings', 'bow'] };
  await store.savePack('owner', changed);
  assert.equal(game.round!.word, 'color');
  assert.equal(game.round!.cardRevision, revision);
  assert.deepEqual(game.round!.clues, ['paint', 'shade']);
  assert.equal(game.chat('spoiler', 'viewer', 'Viewer', 'c0l0ur', now()), false);
  assert.equal(game.view('studio').round!.target, undefined);
  assert.equal(game.view('overlay').round!.target, undefined);
  for (const role of ['studio', 'viewer', 'overlay'] as const) {
    const value = JSON.stringify(game.view(role));
    assert.ok(!value.includes('coconut'));
    assert.ok(!value.includes('acceptedSpellings'));
    assert.ok(!value.includes('cardRevision'));
  }
  assert.equal(game.transcript(transcript('colour'), 'confirm'), true);
  assert.equal(game.score.wins, 0);
  game.decideCatch(game.round!.id, 'confirm');
  const sequence: string[] = [];
  for (let n = 0; n < 18; n++) {
    advance(11000); game.begin();
    sequence.push(game.round!.word);
    assert.notEqual(game.round!.word, undefined);
    assert.notEqual(sequence[n], sequence[n - 1]);
    game.end('ended');
  }
  assert.ok(sequence.includes('cello'));
  assert.ok(!sequence.includes('color'));
});

test('an invalid next-round difficulty halts auto play without mutating the running round', async (t) => {
  const { store } = await library(t);
  const id = await store.savePack('owner', pack());
  await store.select('owner', { mode: 'custom', packId: id }, 1, 'medium');
  const { game, advance } = fixture();
  game.deckFor = (difficulty) => store.resolve('owner', difficulty);
  game.data.settings.auto = true;
  game.begin();
  const live = game.round!.word;
  game.update({ ...game.data.settings, difficulty: 'hard' });
  assert.equal(game.round!.word, live);
  assert.equal(game.round!.difficulty, 'medium');
  game.end('ended'); advance(11000);
  assert.doesNotThrow(() => game.tick());
  assert.equal(game.phase, 'idle');
  assert.match(store.selected('owner', 'hard').problem!, /six hard/);
});
