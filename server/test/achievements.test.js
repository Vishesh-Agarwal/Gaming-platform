import assert from 'node:assert/strict';
import test from 'node:test';
import { ACHIEVEMENTS, evaluateAchievements } from '../src/achievements.js';
import { createUser } from '../src/db.js';

function unique(prefix) {
  return `${prefix}${Date.now().toString(36).slice(-6)}${Math.random().toString(36).slice(2, 5)}`;
}

const baseCtx = (userId, over = {}) => ({
  userId, gameId: 'pool', won: true, draw: false, playerCount: 2, streak: 1,
  stats: [{ gameId: 'pool', played: 1, wins: 1, losses: 0, draws: 0 }],
  ...over,
});

test('catalog: 20+ unique, fully described achievements', () => {
  assert.ok(ACHIEVEMENTS.length >= 20);
  const ids = new Set(ACHIEVEMENTS.map((a) => a.id));
  assert.equal(ids.size, ACHIEVEMENTS.length);
  for (const a of ACHIEVEMENTS) {
    assert.ok(a.name && a.desc && a.icon && a.xp > 0 && typeof a.check === 'function', a.id);
  }
});

test('first win unlocks once and only once', () => {
  const u = createUser(unique('ach_'), 'hash');
  const first = evaluateAchievements(baseCtx(u.id));
  assert.ok(first.some((a) => a.id === 'first-win'));
  const again = evaluateAchievements(baseCtx(u.id));
  assert.ok(!again.some((a) => a.id === 'first-win'));
});

test('losing does not unlock win achievements', () => {
  const u = createUser(unique('ach_'), 'hash');
  const got = evaluateAchievements(baseCtx(u.id, { won: false, stats: [{ gameId: 'pool', played: 1, wins: 0 }] }));
  assert.ok(!got.some((a) => a.id === 'first-win'));
});

test('streak and explorer achievements trigger on their conditions', () => {
  const u = createUser(unique('ach_'), 'hash');
  const got = evaluateAchievements(baseCtx(u.id, { streak: 5 }));
  assert.ok(got.some((a) => a.id === 'streak-5'));
  const explorer = evaluateAchievements(baseCtx(u.id, {
    stats: Array.from({ length: 10 }, (_, i) => ({ gameId: `g${i}`, played: 1, wins: 0 })),
  }));
  assert.ok(explorer.some((a) => a.id === 'explorer-10'));
});

test('a throwing check never blocks other achievements', () => {
  const u = createUser(unique('ach_'), 'hash');
  // stats: null makes sum() style checks throw; evaluation must still return.
  const got = evaluateAchievements(baseCtx(u.id, { stats: null }));
  assert.ok(Array.isArray(got));
});
