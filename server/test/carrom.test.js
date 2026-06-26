// server/test/carrom.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import carrom from '../src/games/carrom.js';

const { createInitialState } = carrom;

test('classic layout has 19 coins: 1 queen, 9 white, 9 black', () => {
  const s = createInitialState({ mode: 'classic' }, 2);
  assert.equal(s.coins.length, 19);
  assert.equal(s.coins.filter((c) => c.color === 'queen').length, 1);
  assert.equal(s.coins.filter((c) => c.color === 'white').length, 9);
  assert.equal(s.coins.filter((c) => c.color === 'black').length, 9);
  assert.equal(s.coinsPerColor, 9);
  assert.equal(s.mode, 'classic');
});

test('quick layout has 7 coins: 1 queen, 3 white, 3 black', () => {
  const s = createInitialState({ mode: 'quick' }, 2);
  assert.equal(s.coins.length, 7);
  assert.equal(s.coinsPerColor, 3);
});

test('points mode carries a target and starts scores at zero', () => {
  const s = createInitialState({ mode: 'points' }, 2);
  assert.equal(s.mode, 'points');
  assert.equal(s.target, 7);
  assert.deepEqual(s.scores, [0, 0]);
});

test('unknown mode falls back to classic', () => {
  const s = createInitialState({ mode: 'nope' }, 2);
  assert.equal(s.mode, 'classic');
});
