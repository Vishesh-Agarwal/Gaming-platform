import test from 'node:test';
import assert from 'node:assert/strict';
import pool from '../src/games/pool.js';

const { createInitialState } = pool;
const byGroup = (s, g) => s.balls.filter((b) => b.group === g).length;

test('8-ball rack: 16 balls (cue + 8 + 7 solids + 7 stripes), 8 centered', () => {
  const s = createInitialState({ mode: 'eightball' }, 2);
  assert.equal(s.balls.length, 16);
  assert.equal(byGroup(s, 'cue'), 1);
  assert.equal(byGroup(s, 'eight'), 1);
  assert.equal(byGroup(s, 'solid'), 7);
  assert.equal(byGroup(s, 'stripe'), 7);
});

test('9-ball rack: cue + balls 1..9', () => {
  const s = createInitialState({ mode: 'nineball' }, 2);
  assert.equal(s.balls.length, 10);
  const ns = s.balls.map((b) => b.n).sort((a, b) => a - b);
  assert.deepEqual(ns, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('practice uses the 8-ball rack', () => {
  const s = createInitialState({ mode: 'practice' }, 2);
  assert.equal(s.balls.length, 16);
});

test('unknown mode falls back to eightball', () => {
  assert.equal(createInitialState({ mode: 'nope' }, 2).mode, 'eightball');
});

test('the cue ball starts in the kitchen (left half) and is on break', () => {
  const s = createInitialState({ mode: 'eightball' }, 2);
  assert.ok(s.cue.x < s.W / 2);
  assert.equal(s.onBreak, true);
  assert.equal(s.turn, 0);
});
