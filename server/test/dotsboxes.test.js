import test from 'node:test';
import assert from 'node:assert/strict';
import dots from '../src/games/dotsboxes.js';
import { getGame, listGames } from '../src/games/registry.js';

test('is registered as an available game', () => {
  assert.equal(getGame('dotsboxes')?.name, 'Dots & Boxes');
  assert.ok(listGames().some((g) => g.id === 'dotsboxes'));
});

test('claims edges and alternates turns', () => {
  let state = dots.createInitialState();
  state = dots.applyMove(state, 0, { dir: 'h', r: 0, c: 0 }).state;
  assert.equal(state.edges[0], 'h:0:0');
  assert.equal(state.turn, 1);
  assert.equal(dots.applyMove(state, 0, { dir: 'h', r: 0, c: 1 }).error, 'Not your turn.');
});

test('rejects duplicate and invalid edges', () => {
  let state = dots.createInitialState();
  state = dots.applyMove(state, 0, { dir: 'h', r: 0, c: 0 }).state;
  assert.equal(dots.applyMove(state, 1, { dir: 'h', r: 0, c: 0 }).error, 'Edge already taken.');
  assert.equal(dots.applyMove(state, 1, { dir: 'h', r: 9, c: 0 }).error, 'Choose a valid edge.');
});

test('completing a box scores and keeps the turn', () => {
  let state = dots.createInitialState();
  state = dots.applyMove(state, 0, { dir: 'h', r: 0, c: 0 }).state;
  state = dots.applyMove(state, 1, { dir: 'v', r: 0, c: 0 }).state;
  state = dots.applyMove(state, 0, { dir: 'v', r: 0, c: 1 }).state;
  state = dots.applyMove(state, 1, { dir: 'h', r: 1, c: 0 }).state;
  assert.equal(state.owners[0], 1);
  assert.deepEqual(state.scores, [0, 1]);
  assert.equal(state.turn, 1);
});

test('full board result uses scores', () => {
  const state = dots.createInitialState();
  state.owners = Array(16).fill(0);
  state.scores = [16, 0];
  assert.deepEqual(dots.getResult(state), { over: true, winner: 0, draw: false, scores: [16, 0] });
});

test('score race ends when a player reaches majority target', () => {
  const state = dots.createInitialState({ mode: 'race', size: 3 });
  assert.equal(state.targetScore, 5);
  state.scores = [5, 2];
  assert.deepEqual(dots.getResult(state), { over: true, winner: 0, draw: false, scores: [5, 2] });
});

test('sudden box ends on the first completed box', () => {
  const state = dots.createInitialState({ mode: 'sudden' });
  state.scores = [0, 1];
  assert.deepEqual(dots.getResult(state), { over: true, winner: 1, draw: false, scores: [0, 1] });
});
