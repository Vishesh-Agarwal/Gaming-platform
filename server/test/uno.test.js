import test from 'node:test';
import assert from 'node:assert/strict';
import uno from '../src/games/uno.js';
import { getGame, listGames } from '../src/games/registry.js';

test('is registered as a multiplayer game', () => {
  assert.equal(getGame('uno')?.name, 'Color Cards');
  assert.ok(listGames().some((g) => g.id === 'uno'));
});

test('publicState exposes only viewer hand', () => {
  const state = uno.createInitialState(undefined, 3);
  const view = uno.publicState(state, 1);
  assert.equal(view.myHand.length, 7);
  assert.equal('secret' in view, false);
  assert.deepEqual(view.handCounts, [7, 7, 7]);
});

test('rejects nonmatching cards and allows drawing', () => {
  let state = uno.createInitialState(undefined, 2);
  state.top = { color: 'red', value: '1' };
  state.secret.hands[0] = [{ color: 'blue', value: '2' }];
  assert.equal(uno.applyMove(state, 0, { index: 0 }).error, 'Card does not match color or value.');
  state = uno.applyMove(state, 0, { type: 'draw' }).state;
  assert.equal(state.handCounts[0], 2);
  assert.equal(state.turn, 1);
});

test('matching color can be played and empty hand wins', () => {
  let state = uno.createInitialState(undefined, 2);
  state.top = { color: 'red', value: '1' };
  state.secret.hands[0] = [{ color: 'red', value: '9' }];
  state.handCounts = [1, 7];
  state = uno.applyMove(state, 0, { index: 0 }).state;
  assert.deepEqual(uno.getResult(state), { over: true, winner: 0, draw: false, scores: [7, 0] });
});

test('draw2 stacks until a player draws the penalty', () => {
  let state = uno.createInitialState(undefined, 3);
  state.top = { color: 'red', value: '1' };
  state.secret.hands[0] = [{ color: 'red', value: 'draw2' }, { color: 'blue', value: '3' }];
  state.secret.hands[1] = [{ color: 'blue', value: 'draw2' }, { color: 'green', value: '4' }];
  state.handCounts = [2, 7, 7];
  state = uno.applyMove(state, 0, { index: 0 }).state;
  assert.equal(state.pendingDraw, 2);
  assert.equal(state.turn, 1);
  state = uno.applyMove(state, 1, { index: 0 }).state;
  assert.equal(state.pendingDraw, 4);
  assert.equal(state.turn, 2);
  state = uno.applyMove(state, 2, { type: 'draw' }).state;
  assert.equal(state.handCounts[2], 11);
  assert.equal(state.pendingDraw, 0);
});

test('wild cards require and set a color', () => {
  let state = uno.createInitialState(undefined, 2);
  state.top = { color: 'red', value: '1' };
  state.secret.hands[0] = [{ color: 'wild', value: 'wild' }, { color: 'blue', value: '3' }];
  assert.equal(uno.applyMove(state, 0, { index: 0 }).error, 'Choose a wild color.');
  state = uno.applyMove(state, 0, { index: 0, color: 'green' }).state;
  assert.deepEqual(state.top, { color: 'green', value: 'wild', wild: true });
});

test('wild draw 4 requires a color and stacks draw penalties', () => {
  let state = uno.createInitialState(undefined, 3);
  state.top = { color: 'red', value: '1' };
  state.secret.hands[0] = [{ color: 'wild', value: 'wildDraw4' }, { color: 'blue', value: '3' }];
  state.secret.hands[1] = [{ color: 'red', value: 'draw2' }, { color: 'green', value: '4' }];
  state.handCounts = [2, 2, 7];

  assert.equal(uno.applyMove(state, 0, { index: 0 }).error, 'Choose a wild color.');
  state = uno.applyMove(state, 0, { index: 0, color: 'blue' }).state;
  assert.equal(state.pendingDraw, 4);
  assert.deepEqual(state.top, { color: 'blue', value: 'wildDraw4', wild: true });

  state = uno.applyMove(state, 1, { index: 0 }).state;
  assert.equal(state.pendingDraw, 6);

  state = uno.applyMove(state, 2, { type: 'draw' }).state;
  assert.equal(state.handCounts[2], 13);
  assert.equal(state.pendingDraw, 0);
});
