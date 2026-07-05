import test from 'node:test';
import assert from 'node:assert/strict';
import { createUser } from '../src/db.js';
import { createRoom, isBotTurn } from '../src/rooms.js';
import { armTurnClock, setBotNudge, stopTurnClock } from '../src/turnclock.js';

const mockIo = { to: () => ({ emit() {} }) };

test('when a human times out into a bot turn, the turn clock nudges the bot', async () => {
  const suffix = Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  const user = createUser(`nudge_${suffix}`, 'x');
  const created = createRoom('ludo', { bots: 1 }, [user.id]);
  assert.ok(!created.error, created.error);
  const room = created.room;
  assert.equal(room.players.length, 2);
  assert.ok(room.players[1].bot, 'seat 1 should be a bot');

  const nudged = [];
  setBotNudge((roomId) => nudged.push(roomId));
  const realNow = Date.now;
  try {
    // Fast-forward past ludo's 20s turn deadline so the clock fires immediately.
    Date.now = () => realNow() + 21000;
    armTurnClock(mockIo, room.id);
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(isBotTurn(room.id), true, 'timeout should have advanced to the bot');
    assert.deepEqual(nudged, [room.id], 'the bot should have been nudged');
  } finally {
    Date.now = realNow;
    setBotNudge(null);
    stopTurnClock(room.id);
  }
});
