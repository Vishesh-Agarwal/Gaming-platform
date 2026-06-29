import test from 'node:test';
import assert from 'node:assert/strict';
import checkers from '../src/games/checkers.js';
import { getGame, listGames } from '../src/games/registry.js';

test('is registered as an available game', () => {
  assert.equal(getGame('checkers')?.name, 'Checkers');
  assert.ok(listGames().some((g) => g.id === 'checkers'));
});

test('creates the initial 12-piece setup', () => {
  const state = checkers.createInitialState();
  assert.equal(state.board.filter((p) => p?.owner === 0).length, 12);
  assert.equal(state.board.filter((p) => p?.owner === 1).length, 12);
  assert.equal(state.turn, 0);
});

test('moves a normal piece diagonally forward', () => {
  let state = checkers.createInitialState();
  state = checkers.applyMove(state, 0, { from: 40, to: 33 }).state;
  assert.equal(state.board[40], null);
  assert.deepEqual(state.board[33], { owner: 0, king: false });
  assert.equal(state.turn, 1);
});

test('mandatory capture removes an opponent piece', () => {
  const state = {
    ...checkers.createInitialState(),
    board: Array(64).fill(null),
    turn: 0,
  };
  state.board[42] = { owner: 0, king: false };
  state.board[33] = { owner: 1, king: false };
  assert.equal(checkers.applyMove(state, 0, { from: 42, to: 35 }).error, 'You must capture.');
  const next = checkers.applyMove(state, 0, { from: 42, to: 24 }).state;
  assert.equal(next.board[33], null);
  assert.deepEqual(next.board[24], { owner: 0, king: false });
  assert.deepEqual(next.captured, [1, 0]);
});

test('promotes pieces to kings', () => {
  const state = {
    ...checkers.createInitialState(),
    board: Array(64).fill(null),
    turn: 0,
  };
  state.board[9] = { owner: 0, king: false };
  state.board[62] = { owner: 1, king: false };
  const next = checkers.applyMove(state, 0, { from: 9, to: 0 }).state;
  assert.deepEqual(next.board[0], { owner: 0, king: true });
});

test('player with no pieces loses', () => {
  const state = { ...checkers.createInitialState(), board: Array(64).fill(null), captured: [12, 0] };
  state.board[10] = { owner: 0, king: false };
  assert.deepEqual(checkers.getResult(state), { over: true, winner: 0, draw: false, scores: [12, 0] });
});
