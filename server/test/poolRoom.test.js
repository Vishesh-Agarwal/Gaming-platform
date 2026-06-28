import test from 'node:test';
import assert from 'node:assert/strict';
import { getGame, listGames } from '../src/games/registry.js';

test('pool is registered with the right metadata', () => {
  assert.ok(listGames().map((g) => g.id).includes('pool'));
  const g = getGame('pool');
  assert.equal(g.minPlayers, 2);
  assert.equal(g.maxPlayers, 2);
  assert.equal(typeof g.createInitialState, 'function');
  assert.equal(typeof g.applyMove, 'function');
  assert.equal(typeof g.getResult, 'function');
  assert.equal(g.modes.length, 4);
});
