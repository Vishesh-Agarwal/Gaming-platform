import test from 'node:test';
import assert from 'node:assert/strict';
import hangman from '../src/games/hangman.js';
import { randomWord, isCategory, CATEGORIES } from '../src/games/hangmanWords.js';

test('randomWord returns a valid 3-12 letter word and known category for each category', () => {
  for (const c of CATEGORIES) {
    const r = randomWord(c.id);
    assert.equal(r.category, c.id);
    assert.match(r.word, /^[A-Z]{3,12}$/);
    assert.ok(r.hint);
  }
});

test('randomWord with an unknown category falls back to a valid one', () => {
  const r = randomWord('bogus');
  assert.ok(isCategory(r.category));
  assert.match(r.word, /^[A-Z]{3,12}$/);
});

test('setting with random:true picks a word from the bank and enters guessing', () => {
  const s = hangman.createInitialState({ rounds: 1 });
  const { state } = hangman.applyMove(s, 0, { random: true, category: 'animals' });
  assert.equal(state.phase, 'guessing');
  assert.equal(state.category, 'animals');
  assert.ok(state.hint);
  assert.equal(state.secret.word.length, state.wordLength);
});

test('setting with a typed word keeps a valid chosen category', () => {
  const s = hangman.createInitialState({ rounds: 1 });
  const { state } = hangman.applyMove(s, 0, { word: 'PUZZLE', hint: 'a brain teaser', category: 'science' });
  assert.equal(state.category, 'science');
  assert.equal(state.wordLength, 6);
});

test('an invalid category on a typed word is dropped', () => {
  const s = hangman.createInitialState({ rounds: 1 });
  const { state } = hangman.applyMove(s, 0, { word: 'PUZZLE', hint: 'x', category: 'bogus' });
  assert.equal(state.category, null);
});
