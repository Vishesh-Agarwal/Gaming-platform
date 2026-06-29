import test from 'node:test';
import assert from 'node:assert/strict';
import { listGames } from '../src/games/registry.js';
import { createUser } from '../src/db.js';
import { createRoom } from '../src/rooms.js';

test('every registered game can create a room with its minimum seat count', () => {
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  for (const game of listGames()) {
    const seats = Math.max(2, game.minPlayers || 2);
    const users = Array.from({ length: seats }, (_, i) => createUser(`start_${game.id}_${i}_${suffix}`, 'x'));
    const created = createRoom(game.id, undefined, users.map((u) => u.id));
    assert.equal(created.error, undefined, `${game.id} should start with ${seats} seats`);
    assert.equal(created.room.players.length, seats, `${game.id} seat count`);
  }
});

test('room creation rejects too few seats for fixed larger games', () => {
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const users = Array.from({ length: 2 }, (_, i) => createUser(`too_few_code_${i}_${suffix}`, 'x'));
  const created = createRoom('codenames', undefined, users.map((u) => u.id));
  assert.equal(created.error, 'Need at least 4 players.');
});
