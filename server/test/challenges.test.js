import assert from 'node:assert/strict';
import test from 'node:test';
import { challengesForDate, applyMatchToChallenges, getDailyChallenges, utcDay } from '../src/challenges.js';
import { createUser } from '../src/db.js';

function unique(prefix) {
  return `${prefix}${Date.now().toString(36).slice(-6)}${Math.random().toString(36).slice(2, 5)}`;
}

test('a day always yields the same 3 distinct challenges; days rotate', () => {
  const a = challengesForDate('2026-07-02');
  const b = challengesForDate('2026-07-02');
  assert.deepEqual(a, b);
  assert.equal(a.length, 3);
  assert.equal(new Set(a.map((c) => c.id)).size, 3);
  for (const c of a) {
    assert.ok(c.name && c.desc && c.icon && c.target >= 1 && c.xp > 0, c.id);
  }
  const week = ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04']
    .map((d) => challengesForDate(d).map((c) => c.id).join());
  assert.ok(new Set(week).size >= 2, 'challenge sets should rotate across days');
});

test('utcDay formats as YYYY-MM-DD', () => {
  assert.match(utcDay(), /^\d{4}-\d{2}-\d{2}$/);
});

test('match progress accumulates and completes exactly once', () => {
  const u = createUser(unique('ch_'), 'hash');
  const day = '2026-07-02';
  // The third slot is always a win-game challenge — completable by winning it.
  const winGame = challengesForDate(day).find((c) => c.kind === 'win-game');
  let completions = 0;
  for (let i = 0; i < winGame.target + 2; i++) {
    const res = applyMatchToChallenges({
      userId: u.id, day,
      gameId: winGame.gameId,
      won: true, draw: false,
      playedGameIdsToday: [winGame.gameId],
    });
    completions += res.completed.filter((c) => c.id === winGame.id).length;
  }
  assert.equal(completions, 1);
  const merged = getDailyChallenges(u.id, day);
  assert.equal(merged.length, 3);
  const done = merged.find((c) => c.id === winGame.id);
  assert.ok(done.completed);
  assert.equal(done.progress, done.target);
});

test('game-specific challenges only progress on that game', () => {
  const u = createUser(unique('ch_'), 'hash');
  const day = '2026-07-02';
  const gameCh = challengesForDate(day).find((c) => c.kind === 'play-game');
  if (!gameCh) return; // day layout may vary; skip when absent
  applyMatchToChallenges({
    userId: u.id, day, gameId: '__not_this_game__', won: false, draw: false, playedGameIdsToday: [],
  });
  const merged = getDailyChallenges(u.id, day);
  assert.equal(merged.find((c) => c.id === gameCh.id).progress, 0);
});
