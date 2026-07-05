import assert from 'node:assert/strict';
import test from 'node:test';

import codenames, { DECKS } from '../src/games/codenames.js';

test('classic deck is large enough that boards vary between games', () => {
  assert.ok(DECKS.classic.length >= 200, `expected >=200 classic words, got ${DECKS.classic.length}`);
  assert.equal(new Set(DECKS.classic).size, DECKS.classic.length, 'duplicates in classic deck');
  for (const word of DECKS.classic) assert.match(word, /^[A-Z]+$/, `bad entry ${JSON.stringify(word)}`);
});

test('boards still deal 25 unique words from the deck', () => {
  const state = codenames.createInitialState({ mode: 'classic' }, 4);
  const words = state.cards.map((c) => c.word);
  assert.equal(words.length, 25);
  assert.equal(new Set(words).size, 25);
  for (const word of words) assert.ok(DECKS.classic.includes(word), `${word} not from classic deck`);
});
