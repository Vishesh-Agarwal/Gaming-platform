import test from 'node:test';
import assert from 'node:assert/strict';
import microchess from '../src/games/microchess.js';
import { getGame, listGames } from '../src/games/registry.js';

const idx = (r, c) => r * 5 + c;

test('is registered as a two player game', () => {
  assert.equal(getGame('microchess')?.name, 'Micro Chess');
  assert.ok(listGames().some((g) => g.id === 'microchess'));
});

test('allows a pawn to advance one square', () => {
  let state = microchess.createInitialState();
  state = microchess.applyMove(state, 0, { from: idx(3, 0), to: idx(2, 0) }).state;
  assert.deepEqual(state.board[idx(2, 0)], { owner: 0, type: 'pawn' });
  assert.equal(state.board[idx(3, 0)], null);
  assert.equal(state.turn, 1);
});

test('allows knights to jump over occupied rows', () => {
  let state = microchess.createInitialState();
  state = microchess.applyMove(state, 0, { from: idx(4, 1), to: idx(2, 0) }).state;
  assert.deepEqual(state.board[idx(2, 0)], { owner: 0, type: 'knight' });
});

test('rejects moving onto your own piece', () => {
  const state = microchess.createInitialState();
  assert.equal(microchess.applyMove(state, 0, { from: idx(4, 0), to: idx(3, 0) }).error, 'Illegal move.');
});

test('promotes pawns on the back rank', () => {
  let state = microchess.createInitialState();
  state.board = Array(25).fill(null);
  state.board[idx(1, 2)] = { owner: 0, type: 'pawn' };
  state.board[idx(4, 4)] = { owner: 0, type: 'king' };
  state.board[idx(0, 4)] = { owner: 1, type: 'king' };
  state = microchess.applyMove(state, 0, { from: idx(1, 2), to: idx(0, 2) }).state;
  assert.deepEqual(state.board[idx(0, 2)], { owner: 0, type: 'queen' });
});

test('capturing the king ends the game', () => {
  let state = microchess.createInitialState();
  state.board = Array(25).fill(null);
  state.board[idx(2, 0)] = { owner: 0, type: 'queen' };
  state.board[idx(4, 4)] = { owner: 0, type: 'king' };
  state.board[idx(2, 4)] = { owner: 1, type: 'king' };
  state = microchess.applyMove(state, 0, { from: idx(2, 0), to: idx(2, 4) }).state;
  assert.equal(state.winner, 0);
  assert.deepEqual(microchess.getResult(state), { over: true, winner: 0, draw: false });
});
