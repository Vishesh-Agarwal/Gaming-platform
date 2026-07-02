import assert from 'node:assert/strict';
import test from 'node:test';
import { pickFeaturedGame, recentGameIds } from '../src/homeRails.js';

const ids = ['pool', 'karts', 'uno'];

test('featured game is the most-played game when stats exist', () => {
  const stats = [
    { gameId: 'uno', played: 3 },
    { gameId: 'pool', played: 9 },
  ];
  assert.equal(pickFeaturedGame(ids, stats, 5), 'pool');
});

test('featured game rotates daily (deterministic) with no stats', () => {
  assert.equal(pickFeaturedGame(ids, [], 4), ids[4 % 3]);
  assert.equal(pickFeaturedGame(ids, null, 4), ids[4 % 3]);
});

test('featured falls back to rotation when the most-played id is not in the registry', () => {
  assert.equal(pickFeaturedGame(ids, [{ gameId: 'gone', played: 5 }], 1), 'karts');
});

test('recent rail dedupes, keeps order, filters unknown ids, and caps at limit', () => {
  const recent = [
    { gameId: 'uno' }, { gameId: 'pool' }, { gameId: 'uno' },
    { gameId: 'ghost' }, { gameId: 'karts' },
  ];
  assert.deepEqual(recentGameIds(recent, ids, 2), ['uno', 'pool']);
  assert.deepEqual(recentGameIds(recent, ids), ['uno', 'pool', 'karts']);
  assert.deepEqual(recentGameIds(null, ids), []);
});
