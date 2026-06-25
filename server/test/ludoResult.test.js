import test from 'node:test';
import assert from 'node:assert/strict';
import ludo from '../src/games/ludo.js';
import { listGames } from '../src/games/registry.js';

test('scores count tokens home; not over mid-game', () => {
  const st = ludo.createInitialState(undefined, 4);
  st.players[1].tokens = [57, 57, 0, 0];
  const r = ludo.getResult(st);
  assert.deepEqual(r.scores, [0, 2, 0, 0]);
  assert.equal(r.over, false);
});

test('2p: over when the first finishes; ranking = [winner, other]', () => {
  const st = ludo.createInitialState(undefined, 2);
  st.finishedOrder = [1];
  const r = ludo.getResult(st);
  assert.equal(r.over, true);
  assert.equal(r.winner, 1);
  assert.deepEqual(r.ranking, [1, 0]);
  assert.equal(r.draw, false);
});

test('4p: over when 3 have finished; last seat appended to ranking', () => {
  const st = ludo.createInitialState(undefined, 4);
  st.finishedOrder = [2, 0, 3];
  const r = ludo.getResult(st);
  assert.equal(r.over, true);
  assert.deepEqual(r.ranking, [2, 0, 3, 1]);
  assert.equal(r.winner, 2);
});

test('ludo is registered', () => {
  assert.ok(listGames().some((g) => g.id === 'ludo'));
});
