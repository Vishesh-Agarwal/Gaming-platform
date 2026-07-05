import assert from 'node:assert/strict';
import test from 'node:test';

import { WORDS, PACKS } from '../src/games/skribble.js';

const countOf = (n) => WORDS.filter((w) => w.trim().split(/\s+/).length === n).length;

test('skribble pool is big enough to avoid repeats across sessions', () => {
  assert.ok(WORDS.length >= 240, `expected >=240 words, got ${WORDS.length}`);
  assert.equal(new Set(WORDS).size, WORDS.length, 'duplicates in WORDS');
  for (const word of WORDS) assert.match(word, /^[a-z]+( [a-z]+){0,3}$/, `bad entry ${JSON.stringify(word)}`);
});

test('every words-per-prompt setting has a healthy bucket', () => {
  assert.ok(countOf(1) >= 150, `1-word bucket too small: ${countOf(1)}`);
  assert.ok(countOf(2) >= 50, `2-word bucket too small: ${countOf(2)}`);
  assert.ok(countOf(3) >= 25, `3-word bucket too small: ${countOf(3)}`);
});

test('packs stay consistent with the main pool', () => {
  assert.ok(PACKS.simple.every((w) => !w.includes(' ')), 'simple pack has phrases');
  assert.ok(PACKS.simple.length >= 150, `simple pack too small: ${PACKS.simple.length}`);
  assert.ok(PACKS.party.length >= 15, 'party pack shrank');
  assert.equal(new Set(PACKS.party).size, PACKS.party.length, 'duplicates in party pack');
});
