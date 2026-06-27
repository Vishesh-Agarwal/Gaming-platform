import test from 'node:test';
import assert from 'node:assert/strict';
import { getGame, listGames } from '../src/games/registry.js';

test('carrom is registered with the right metadata', () => {
  const ids = listGames().map((g) => g.id);
  assert.ok(ids.includes('carrom'));
  const g = getGame('carrom');
  assert.equal(g.minPlayers, 2);
  assert.equal(g.maxPlayers, 2);
  assert.equal(typeof g.createInitialState, 'function');
  assert.equal(typeof g.applyMove, 'function');
  assert.equal(typeof g.getResult, 'function');
});
