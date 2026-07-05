import assert from 'node:assert/strict';
import test from 'node:test';

import { ANSWERS, GUESS_WORDS } from '../src/games/wordduelWords.js';
import wordduel from '../src/games/wordduel.js';

test('guess dictionary is a full 5-letter word list', () => {
  assert.ok(GUESS_WORDS.length > 4000, `expected >4k guess words, got ${GUESS_WORDS.length}`);
  assert.equal(new Set(GUESS_WORDS).size, GUESS_WORDS.length, 'duplicates in GUESS_WORDS');
  for (const word of GUESS_WORDS) assert.match(word, /^[A-Z]{5}$/, `bad guess entry ${JSON.stringify(word)}`);
});

test('answers are a large curated pool of real words', () => {
  assert.ok(ANSWERS.length >= 300, `expected >=300 answers, got ${ANSWERS.length}`);
  assert.equal(new Set(ANSWERS).size, ANSWERS.length, 'duplicates in ANSWERS');
  const guessable = new Set(GUESS_WORDS);
  for (const word of ANSWERS) {
    assert.ok(guessable.has(word), `answer ${word} is not in the guess dictionary (typo?)`);
  }
});

test('answers come from the curated pool for any seed', () => {
  const pool = new Set(ANSWERS);
  for (const seed of [1, 2, 3, 99, 12345, 0xfffffffe]) {
    const state = wordduel.createInitialState({ seed });
    assert.ok(pool.has(state.secret.answer), `seed ${seed} picked ${state.secret.answer}`);
  }
});

test('junk 5-letter strings are rejected; real words are accepted', () => {
  const state = wordduel.createInitialState({ seed: 7 });
  assert.match(wordduel.applyMove(state, 0, { guess: 'QQQQQ' }).error, /word list/i);
  assert.match(wordduel.applyMove(state, 0, { guess: 'AEIOU' }).error, /word list/i);
  const ok = wordduel.applyMove(state, 0, { guess: 'CRANE' });
  assert.ok(!ok.error, ok.error);
});
