import test from 'node:test';
import assert from 'node:assert/strict';
import boggle, { canSpell } from '../src/games/boggle.js';
import { getGame, listGames } from '../src/games/registry.js';

test('is registered as a multiplayer game', () => {
  assert.equal(getGame('boggle')?.name, 'Boggle Race');
  assert.ok(listGames().some((g) => g.id === 'boggle'));
});

test('canSpell follows adjacent paths without reusing cells', () => {
  const grid = 'CARTDOGSABCDEFGHI'.slice(0, 16).split('');
  assert.equal(canSpell(grid, 'CAR'), true);
  assert.equal(canSpell(grid, 'CCCC'), false);
});

test('accepts and scores valid submitted words', () => {
  let state = boggle.createInitialState(undefined, 2);
  state.grid = 'CARTDOGSABCDEFGHI'.slice(0, 16).split('');
  state = boggle.applyMove(state, 0, { word: 'car' }).state;
  assert.deepEqual(state.scores, [1, 0]);
  assert.equal(state.found[0][0], 'CAR');
});

test('rejects duplicate, short, unknown, and off-board words', () => {
  let state = boggle.createInitialState(undefined, 2);
  state.grid = 'CARTDOGSABCDEFGHI'.slice(0, 16).split('');
  state = boggle.applyMove(state, 0, { word: 'car' }).state;
  assert.equal(boggle.applyMove(state, 0, { word: 'car' }).error, 'You already found that word.');
  assert.equal(boggle.applyMove(state, 0, { word: 'at' }).error, 'Words need at least 3 letters.');
  assert.equal(boggle.applyMove(state, 0, { word: 'xyz' }).error, 'Word is not in the list.');
  assert.equal(boggle.applyMove(state, 0, { word: 'water' }).error, 'Word is not on the board.');
});

test('timeout ends the round and result uses scores', () => {
  let state = boggle.createInitialState(undefined, 2);
  state.scores = [3, 1];
  state = boggle.onTimeout(state).state;
  assert.deepEqual(boggle.getResult(state), { over: true, winner: 0, draw: false, scores: [3, 1] });
});
