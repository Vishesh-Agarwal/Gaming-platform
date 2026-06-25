import test from 'node:test';
import assert from 'node:assert/strict';
import ludo, { START, SAFE, SEAT_COLORS, loopCell } from '../src/games/ludo.js';

test('seat→color mapping: 2p opposite, 3p/4p consecutive', () => {
  assert.deepEqual(SEAT_COLORS[2], [0, 2]);
  assert.deepEqual(SEAT_COLORS[3], [0, 1, 2]);
  assert.deepEqual(SEAT_COLORS[4], [0, 1, 2, 3]);
});

test('loopCell maps progress to absolute loop index from the color start', () => {
  assert.equal(loopCell(0, 1), 0);          // red start
  assert.equal(loopCell(1, 1), 13);         // green start
  assert.equal(loopCell(0, 14), 13);        // 13 steps from red start
  assert.equal(loopCell(3, 14), (39 + 13) % 52); // wraps
  assert.equal(loopCell(0, 0), -1);         // base
  assert.equal(loopCell(0, 52), -1);        // home column, not on loop
});

test('createInitialState builds a seat per player with 4 base tokens', () => {
  const st = ludo.createInitialState(undefined, 3);
  assert.equal(st.seatCount, 3);
  assert.equal(st.players.length, 3);
  assert.deepEqual(st.colors, [0, 1, 2]);
  assert.deepEqual(st.players[0].tokens, [0, 0, 0, 0]);
  assert.equal(st.current, 0);
  assert.equal(st.phase, 'roll');
  assert.equal(st.dice, null);
  assert.equal(st.sixesInRow, 0);
  assert.deepEqual(st.finishedOrder, []);
});

test('SAFE contains the four starts and four stars', () => {
  for (const c of [0, 8, 13, 21, 26, 34, 39, 47]) assert.ok(SAFE.has(c));
});
