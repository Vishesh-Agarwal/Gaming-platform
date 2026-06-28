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

const { applyMove } = pool;

// A controlled 8-ball state (post-break): you supply the object balls + cue pos.
// A straight-up shot from (500,400) at a ball on (500,100) sinks it in the top
// side pocket while the (equal-mass) cue stops dead — never follows in.
function eightState(objects, cue) {
  const s = createInitialState({ mode: 'eightball' }, 2);
  s.onBreak = false;
  s.balls = objects;
  s.cue = cue;
  return s;
}
const UP = { dx: 0, dy: -1, power: 100 };

test('potting a solid on an open table assigns groups', () => {
  const s = eightState([{ id: 1, n: 1, group: 'solid', x: 500, y: 100 }], { x: 500, y: 400 });
  const { state, error } = applyMove(s, 0, UP);
  assert.equal(error, undefined);
  assert.equal(state.groups[0], 'solid');
  assert.equal(state.groups[1], 'stripe');
  assert.equal(state.turn, 0, 'potting your ball keeps the turn');
});

test('potting your own group keeps the turn', () => {
  const s = eightState([{ id: 3, n: 3, group: 'solid', x: 500, y: 100 }], { x: 500, y: 400 });
  s.groups = { 0: 'solid', 1: 'stripe' };
  const { state } = applyMove(s, 0, UP);
  assert.equal(state.turn, 0);
  assert.equal(state.balls.filter((b) => b.group === 'solid').length, 0, 'the solid was pocketed');
});

test('a legal shot that pockets nothing passes the turn (no foul)', () => {
  const s = eightState([{ id: 3, n: 3, group: 'solid', x: 500, y: 250 }], { x: 200, y: 250 });
  s.groups = { 0: 'solid', 1: 'stripe' };
  const { state } = applyMove(s, 0, { dx: 1, dy: 0, power: 40 });
  assert.equal(state.turn, 1);
  assert.equal(state.lastShot.foul, false);
  assert.equal(state.ballInHand, false);
});

test('rejects a move out of turn', () => {
  const s = eightState([{ id: 1, n: 1, group: 'solid', x: 500, y: 100 }], { x: 500, y: 400 });
  assert.ok(applyMove(s, 1, UP).error);
});

test('rejects a zero-aim shot', () => {
  const s = eightState([{ id: 1, n: 1, group: 'solid', x: 500, y: 100 }], { x: 500, y: 400 });
  assert.ok(applyMove(s, 0, { dx: 0, dy: 0, power: 50 }).error);
});
