import assert from 'node:assert/strict';
import test from 'node:test';
import { levelForXp, xpForMatch } from '../src/progression.js';
import { addXp, getXp, createUser } from '../src/db.js';

function unique(prefix) {
  return `${prefix}${Date.now().toString(36).slice(-6)}${Math.random().toString(36).slice(2, 5)}`;
}

test('level curve: thresholds are cumulative 100, 150, 200…', () => {
  assert.deepEqual(levelForXp(0), { level: 1, intoLevel: 0, neededForNext: 100 });
  assert.deepEqual(levelForXp(99), { level: 1, intoLevel: 99, neededForNext: 100 });
  assert.deepEqual(levelForXp(100), { level: 2, intoLevel: 0, neededForNext: 150 });
  assert.deepEqual(levelForXp(260), { level: 3, intoLevel: 10, neededForNext: 200 });
});

test('xp: playing earns base, winning earns bonus, draws split', () => {
  assert.equal(xpForMatch({ won: false, draw: false, playerCount: 2, streak: 0 }).total, 20);
  assert.equal(xpForMatch({ won: true, draw: false, playerCount: 2, streak: 1 }).total, 60);
  assert.equal(xpForMatch({ won: false, draw: true, playerCount: 2, streak: 0 }).total, 30);
});

test('xp: bigger lobbies and streaks pay more, streak bonus caps', () => {
  assert.equal(xpForMatch({ won: true, draw: false, playerCount: 8, streak: 1 }).total, 90);
  assert.equal(xpForMatch({ won: true, draw: false, playerCount: 2, streak: 3 }).total, 80);
  assert.equal(xpForMatch({ won: true, draw: false, playerCount: 2, streak: 99 }).total, 110);
});

test('xp breakdown lists each reason once and sums to the total', () => {
  const { breakdown, total } = xpForMatch({ won: true, draw: false, playerCount: 4, streak: 2 });
  assert.deepEqual(breakdown.map((b) => b.reason), ['played', 'won', 'big-lobby', 'streak']);
  assert.equal(breakdown.reduce((s, b) => s + b.amount, 0), total);
});

test('addXp bumps the user total and returns it', () => {
  const u = createUser(unique('xp_'), 'hash');
  assert.equal(getXp(u.id), 0);
  const total = addXp(u.id, 60, 'won', null);
  assert.equal(total, 60);
  assert.equal(getXp(u.id), 60);
  assert.equal(addXp(u.id, 15, 'played', null), 75);
});
