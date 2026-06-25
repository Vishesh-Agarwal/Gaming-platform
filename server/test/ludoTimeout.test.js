import test from 'node:test';
import assert from 'node:assert/strict';
import ludo, { onTimeout, MAX_MISSES, nextActiveSeat } from '../src/games/ludo.js';

const fresh = (n = 2) => ludo.createInitialState(undefined, n);

test('createInitialState seeds per-seat misses and empty out', () => {
  const st = fresh(3);
  assert.deepEqual(st.misses, [0, 0, 0]);
  assert.deepEqual(st.out, []);
});

test('game exposes turn-timeout config', () => {
  assert.equal(typeof ludo.turnTimeoutMs, 'number');
  assert.ok(ludo.turnTimeoutMs > 0);
  assert.equal(typeof ludo.onTimeout, 'function');
});

test('a timeout counts a miss for the current seat', () => {
  const st = fresh(2);
  const { state } = onTimeout(st);
  assert.equal(state.misses[0], 1);
});

test('timeout auto-plays the full turn and hands off to the next seat', () => {
  const st = fresh(2);
  st.players[0].tokens = [10, 0, 0, 0]; // a mid-board token, always movable
  const { state } = onTimeout(st);
  assert.equal(state.misses[0], 1);
  assert.equal(state.current, 1); // turn resolved and handed to seat 1
  assert.equal(state.phase, 'roll');
});

test('reaching MAX_MISSES eliminates the seat; 2p -> the other player wins', () => {
  const st = fresh(2);
  st.misses = [MAX_MISSES - 1, 0];
  const { state } = onTimeout(st);
  assert.equal(state.misses[0], MAX_MISSES);
  assert.deepEqual(state.out, [0]);
  assert.equal(state.lastEvent.type, 'eliminated');
  const r = ludo.getResult(state);
  assert.equal(r.over, true);
  assert.equal(r.winner, 1);
});

test('nextActiveSeat skips eliminated seats', () => {
  const st = fresh(3);
  st.out = [1];
  assert.equal(nextActiveSeat(st, 0), 2);
});

test('getResult ranks eliminated players last (later elimination ranks higher)', () => {
  const st = fresh(4);
  st.finishedOrder = [2];
  st.out = [0];
  assert.equal(ludo.getResult(st).over, false); // done=2, need >=3
  st.out = [0, 3];
  const r = ludo.getResult(st); // done=3 >= 3 -> over
  assert.equal(r.over, true);
  assert.deepEqual(r.ranking, [2, 1, 3, 0]); // finished, remaining, out reversed
  assert.equal(r.winner, 2);
});
