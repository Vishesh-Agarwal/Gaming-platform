import assert from 'node:assert/strict';
import test from 'node:test';

import { BOGGLE_WORDS } from '../src/games/boggleWords.js';
import boggle from '../src/games/boggle.js';

test('boggle dictionary is a real word list, not a sample', () => {
  assert.ok(BOGGLE_WORDS.length > 20000, `expected >20k words, got ${BOGGLE_WORDS.length}`);
  assert.equal(new Set(BOGGLE_WORDS).size, BOGGLE_WORDS.length, 'duplicates found');
  for (const word of BOGGLE_WORDS) {
    assert.match(word, /^[A-Z]{3,8}$/, `bad entry: ${JSON.stringify(word)}`);
  }
  for (const common of ['PLANT', 'HOUSE', 'STONE', 'QUIET', 'MAZE', 'JOLT', 'RIVER', 'CRANE']) {
    assert.ok(BOGGLE_WORDS.includes(common), `missing common word ${common}`);
  }
});

test('boggle accepts ordinary words the old 60-word sample lacked', () => {
  const state = boggle.createInitialState({}, 2);
  state.grid = 'PLANQRSTUVWXYZAB'.split(''); // P-L-A-N across the top, T below N
  const res = boggle.applyMove(state, 0, { word: 'plant' });
  assert.ok(!res.error, res.error);
  assert.equal(res.state.found[0][0], 'PLANT');
});

test('boggle still rejects strings that are not words', () => {
  const state = boggle.createInitialState({}, 2);
  state.grid = 'XQZTABCDEFGHIJKL'.split('');
  const res = boggle.applyMove(state, 0, { word: 'xqzt' });
  assert.match(res.error, /not in the list/i);
});
