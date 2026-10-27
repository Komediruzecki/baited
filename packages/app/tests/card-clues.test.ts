import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ClueRow } from '../client/CardClues';
import { clueTreatments } from '../client/card-clue-catalogue';
import { exactClues, reviewDeck } from '../client/card-lab-model';

for (const word of ['marshmallow', 'alchemy', 'ghost']) for (const { id } of clueTreatments) {
  test(`${word}, ${id}: keeps the exact rule in reading order without controls`, () => {
    const clues = exactClues(reviewDeck.find(entry => entry.word === word)!);
    const html = renderToStaticMarkup(React.createElement(ClueRow, { clues, treatment: id }));
    const rendered = [...html.matchAll(/data-clue-word="[^"]*">([^<]+)<\/span>/g)].map(match => match[1]);
    assert.deepEqual(rendered, clues.map(clue => clue.toLowerCase()));
    assert.doesNotMatch(html, /<(?:button|input|a)\b|\s(?:tabindex|role|title|onclick|aria-label)=/i);
    if (!clues.length) {
      assert.equal(html, '<p class="cl-card__easy">Only this word is off limits.</p>');
    } else if (id === 'quiet') {
      assert.doesNotMatch(html, /<ul|Keep out of chat/);
      const plain = html.replace(/<[^>]*>/g, '');
      const expected = clues.map(clue => clue.toLowerCase());
      assert.equal(plain, `Keep ${expected.slice(0, -1).join(', ')} and ${expected.at(-1)} out of chat.`);
    } else {
      const label = /<p class="cl-card__clue-label" id="([^"]+)">Keep out of chat<\/p>/.exec(html);
      assert.ok(label);
      assert.ok(html.includes(`aria-labelledby="${label[1]}"`));
      assert.equal((html.match(/Keep out of chat/g) || []).length, 1);
      assert.equal((html.match(/<li>/g) || []).length, clues.length);
    }
  });
}
