import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptedSpellings, blankCard, packFormIssues, packPayload, readyCounts, type EditablePack } from '../client/card-library-model';

const pack = (words = ['anchor', 'pillow', 'button', 'raven', 'planet', 'tulip']): EditablePack => ({
  name: 'Friday regulars', status: 'draft',
  cards: words.map((target) => ({ ...blankCard(), target })),
});
test('editor payload normalizes typing and preserves revision for concurrency control', () => {
  const draft = pack([' DONUT ']);
  draft.id = '2e9bd806-2d69-4eba-8d88-d3652f126fb8'; draft.revision = 7;
  draft.name = ' Friday regulars ';
  draft.cards[0].aliasesText = ' Doughnut,  '; draft.cards[0].difficulty = 'medium';
  draft.cards[0].blockedClues = [' SUGAR ', ' GLAZE'];
  assert.deepEqual(acceptedSpellings(draft.cards[0]), ['doughnut']);
  assert.deepEqual(packPayload(draft), {
    id: draft.id, expectedRevision: 7, name: 'Friday regulars', status: 'draft',
    cards: [{ target: 'donut', difficulty: 'medium', blockedClues: ['sugar', 'glaze'], acceptedSpellings: ['doughnut'] }],
  });
});
test('a partial valid draft saves, but playable packs need six at one difficulty', () => {
  assert.deepEqual(packFormIssues(pack(['anchor'])), []);
  assert.ok(packFormIssues({ ...pack(['anchor']), status: 'published' }).some((issue) => issue.path === 'cards'));
  assert.deepEqual(packFormIssues({ ...pack(), status: 'published' }), []);
  const split = pack();
  split.cards.slice(3).forEach((card) => { card.difficulty = 'medium'; card.blockedClues = ['first', 'second']; });
  assert.deepEqual(readyCounts(split.cards), { easy: 3, medium: 3, hard: 0 });
  assert.ok(packFormIssues({ ...split, status: 'published' }).some((issue) => issue.path === 'cards'));
});
test('readiness ignores invalid clue fields and duplicate accepted spellings', () => {
  const draft = pack(['donut', 'doughnut', 'planet', 'anchor']);
  draft.cards[2].difficulty = 'hard'; draft.cards[2].blockedClues = ['earth', '', 'world', 'space'];
  draft.cards[3].difficulty = 'medium'; draft.cards[3].blockedClues = ['ship', 'rope'];
  assert.deepEqual(readyCounts(draft.cards), { easy: 1, medium: 1, hard: 0 });
  assert.ok(packFormIssues(draft).some((issue) => issue.path === 'cards.1.target'));
  assert.ok(packFormIssues(draft).some((issue) => issue.path === 'cards.2.blockedClues.1'));
});
test('blank rows stay in the editor and cannot silently become playable cards', () => {
  assert.deepEqual(blankCard('medium').blockedClues, ['', '']);
  assert.deepEqual(blankCard('hard').blockedClues, ['', '', '', '']);
  const draft = pack(); draft.cards.push(blankCard());
  assert.deepEqual(readyCounts(draft.cards), { easy: 6, medium: 0, hard: 0 });
  assert.ok(packFormIssues(draft).some((issue) => issue.path === 'cards.6.target'));
});
test('target, clues and aliases use the same constraints as saved game rules', () => {
  const draft = pack(['moon cake']);
  assert.ok(packFormIssues(draft).some((issue) => issue.path === 'cards.0.target'));
  draft.cards[0] = { ...blankCard('medium'), target: 'donut', blockedClues: ['doughnut', 'sugar'], aliasesText: '' };
  assert.ok(packFormIssues(draft).some((issue) => issue.path === 'cards.0.blockedClues'));
  draft.cards[0] = { ...blankCard(), target: 'donut', aliasesText: 'cake, bun, bread, roll' };
  assert.ok(packFormIssues(draft).some((issue) => issue.path === 'cards.0.acceptedSpellings'));
});
