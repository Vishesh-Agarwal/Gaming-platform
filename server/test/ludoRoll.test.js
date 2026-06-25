import test from 'node:test';
import assert from 'node:assert/strict';
import ludo, { legalMoves, applyRoll, nextActiveSeat } from '../src/games/ludo.js';

const fresh = (n = 2) => ludo.createInitialState(undefined, n);

test('all tokens in base: only a 6 yields legal moves', () => {
  const st = fresh();
  assert.deepEqual(legalMoves(st, 0, 3), []);
  assert.deepEqual(legalMoves(st, 0, 6), [0, 1, 2, 3]);
});

test('roll with no legal move auto-passes to next seat', () => {
  let st = fresh();
  st = applyRoll(st, 4); // all in base, no move
  assert.equal(st.current, 1);
  assert.equal(st.phase, 'roll');
  assert.equal(st.lastEvent?.type, 'pass');
});

test('roll of 6 with a legal move enters move phase and stays on the same seat', () => {
  let st = fresh();
  st = applyRoll(st, 6);
  assert.equal(st.current, 0);
  assert.equal(st.phase, 'move');
  assert.equal(st.dice, 6);
  assert.deepEqual(st.movable, [0, 1, 2, 3]);
  assert.equal(st.sixesInRow, 1);
});

test('three 6s in a row voids the turn (no move) and passes', () => {
  let st = fresh();
  st.sixesInRow = 2;            // already rolled two 6s
  st = applyRoll(st, 6);        // third
  assert.equal(st.lastEvent?.type, 'sixes');
  assert.equal(st.current, 1);
  assert.equal(st.phase, 'roll');
  assert.equal(st.sixesInRow, 0);
});

test('overshoot is illegal: a token needing exactly N cannot move with >N', () => {
  const st = fresh();
  st.players[0].tokens[0] = 55; // needs <=2 to reach 57
  assert.deepEqual(legalMoves(st, 0, 2), [0]);
  assert.deepEqual(legalMoves(st, 0, 3), []); // 55+3=58 > 57
});

test('nextActiveSeat skips finished seats', () => {
  const st = fresh(3);
  st.finishedOrder = [1];
  assert.equal(nextActiveSeat(st, 0), 2); // 0 -> skip 1 -> 2
});
