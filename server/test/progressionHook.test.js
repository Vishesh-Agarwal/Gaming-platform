import assert from 'node:assert/strict';
import test from 'node:test';
import { processMatch, setProgressionNotifier } from '../src/progression.js';
import { createUser, getXp, saveMatchResult } from '../src/db.js';

function unique(prefix) {
  return `${prefix}${Date.now().toString(36).slice(-6)}${Math.random().toString(36).slice(2, 5)}`;
}

function fakePlayers(u1, u2) {
  return [
    { index: 0, user: { id: u1.id, username: u1.username } },
    { index: 1, user: { id: u2.id, username: u2.username } },
  ];
}

test('processMatch awards XP to every human and reports level info', () => {
  const a = createUser(unique('ph_'), 'hash');
  const b = createUser(unique('ph_'), 'hash');
  const players = fakePlayers(a, b);
  const result = { winner: 0, draw: false, forfeit: false };
  const matchId = saveMatchResult({ roomId: 'r1', gameId: 'pool', gameName: 'Pool', players, result });
  const out = processMatch({ matchId, gameId: 'pool', playerCount: 2, players, result });
  const winner = out.get(a.id);
  const loser = out.get(b.id);
  assert.ok(winner.xpGained >= 60, 'winner gets play+win');
  assert.ok(loser.xpGained >= 20, 'loser gets play xp');
  assert.ok(winner.level.level >= 1);
  assert.ok(winner.achievements.some((x) => x.id === 'first-win'));
  assert.ok(winner.achievements.every((x) => !('check' in x)), 'summary achievements are serializable');
  assert.equal(getXp(a.id), winner.xp);
  assert.ok(getXp(a.id) >= winner.xpGained, 'achievement XP also lands in the total');
});

test('bots are skipped', () => {
  const a = createUser(unique('ph_'), 'hash');
  const players = [
    { index: 0, user: { id: a.id, username: a.username } },
    { index: 1, user: { id: -5, username: 'Bot Nova', bot: true } },
  ];
  const result = { winner: 1, draw: false, forfeit: false };
  const matchId = saveMatchResult({ roomId: 'r2', gameId: 'pool', gameName: 'Pool', players, result });
  const out = processMatch({ matchId, gameId: 'pool', playerCount: 2, players, result });
  assert.ok(out.has(a.id));
  assert.ok(!out.has(-5));
});

test('notifier receives one call per human and its failures stay contained', () => {
  const a = createUser(unique('ph_'), 'hash');
  const b = createUser(unique('ph_'), 'hash');
  const calls = [];
  setProgressionNotifier((userId, summary) => {
    calls.push([userId, summary.xpGained]);
    throw new Error('notifier boom');
  });
  const players = fakePlayers(a, b);
  const result = { winner: null, draw: true, forfeit: false };
  const matchId = saveMatchResult({ roomId: 'r3', gameId: 'uno', gameName: 'Uno', players, result });
  const out = processMatch({ matchId, gameId: 'uno', playerCount: 2, players, result });
  setProgressionNotifier(null);
  assert.deepEqual(calls.map(([id]) => id).sort((x, y) => x - y), [a.id, b.id].sort((x, y) => x - y));
  assert.equal(out.size, 2);
});
