import assert from 'node:assert/strict';
import test from 'node:test';
import { createUser, addXp, saveMatchResult, topByXp, topByGameWins, topByWeeklyWins } from '../src/db.js';

function unique(prefix) {
  return `${prefix}${Date.now().toString(36).slice(-6)}${Math.random().toString(36).slice(2, 5)}`;
}

test('XP leaderboard ranks by xp desc and includes profile fields', () => {
  const a = createUser(unique('lb_'), 'hash');
  // Strictly above the current leader so this user must land at rank 1,
  // even with leftovers from previous runs in the dev database.
  const currentTop = topByXp(1)[0]?.xp ?? 0;
  addXp(a.id, currentTop + 1000, 'test', null);
  const rows = topByXp(5);
  assert.equal(rows[0].id, a.id);
  assert.ok('username' in rows[0] && 'avatar' in rows[0] && 'xp' in rows[0]);
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i - 1].xp >= rows[i].xp, 'sorted descending');
  }
});

test('per-game and weekly leaderboards count wins', () => {
  const a = createUser(unique('lb_'), 'hash');
  const b = createUser(unique('lb_'), 'hash');
  const players = [
    { index: 0, user: { id: a.id, username: a.username } },
    { index: 1, user: { id: b.id, username: b.username } },
  ];
  for (let i = 0; i < 3; i++) {
    saveMatchResult({ roomId: `lb${i}`, gameId: 'boggle', gameName: 'Boggle', players, result: { winner: 0, draw: false, forfeit: false } });
  }
  const game = topByGameWins('boggle', 50);
  const rowA = game.find((r) => r.id === a.id);
  assert.ok(rowA && rowA.wins >= 3);
  assert.ok(!game.some((r) => r.id === b.id && r.wins > 0));
  const weekly = topByWeeklyWins(100);
  assert.ok(weekly.some((r) => r.id === a.id));
});
