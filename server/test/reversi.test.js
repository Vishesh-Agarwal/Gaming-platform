import test from 'node:test';
import assert from 'node:assert/strict';
import reversi, { legalMoves } from '../src/games/reversi.js';
import { getGame, listGames } from '../src/games/registry.js';

test('is registered as an available game', () => {
  assert.equal(getGame('reversi')?.name, 'Reversi');
  assert.ok(listGames().some((g) => g.id === 'reversi'));
});

test('initial legal moves are correct for player 0', () => {
  const state = reversi.createInitialState();
  assert.deepEqual(legalMoves(state.board, 0).sort((a, b) => a - b), [19, 26, 37, 44]);
});

test('placing a disc flips bracketed enemy discs', () => {
  let state = reversi.createInitialState();
  state = reversi.applyMove(state, 0, { pos: 19 }).state;
  assert.equal(state.board[19], 0);
  assert.equal(state.board[27], 0);
  assert.deepEqual(state.scores, [4, 1]);
  assert.equal(state.turn, 1);
});

test('rejects illegal moves', () => {
  const state = reversi.createInitialState();
  assert.equal(reversi.applyMove(state, 0, { pos: 0 }).error, 'Illegal move.');
  assert.equal(reversi.applyMove(state, 1, { pos: 19 }).error, 'Not your turn.');
});

test('allows pass only when there are no legal moves', () => {
  const state = {
    ...reversi.createInitialState(),
    board: Array(64).fill(null),
    turn: 1,
    scores: [1, 1],
  };
  state.board[0] = 0;
  state.board[1] = 1;
  const next = reversi.applyMove(state, 1, { pass: true }).state;
  assert.equal(next.turn, 0);
  assert.equal(next.passes, 1);
});

test('score decides the winner when no moves remain', () => {
  const state = {
    ...reversi.createInitialState(),
    board: Array(64).fill(0).map((_, i) => (i < 40 ? 0 : 1)),
    scores: [40, 24],
  };
  assert.deepEqual(reversi.getResult(state), { over: true, winner: 0, draw: false, scores: [40, 24] });
});
