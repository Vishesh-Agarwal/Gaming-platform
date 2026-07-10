import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createUser } from '../src/db.js';
import { createRoom, dropFromRealtime, forfeit, getCurrentPlayerId } from '../src/rooms.js';

const handlers = readFileSync(new URL('../src/socketHandlers.js', import.meta.url), 'utf8');

function uniq(p) { return `${p}${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 5)}`; }

test('a sim-less realtime room (ghostrider) is not handled by dropFromRealtime and still forfeits', () => {
  const a = createUser(uniq('gr_a'), 'x');
  const b = createUser(uniq('gr_b'), 'x');
  const { room, error } = createRoom('ghostrider', undefined, [a.id, b.id]);
  assert.ok(!error, error);
  assert.equal(dropFromRealtime(a.id).handled, false); // no server sim
  const res = forfeit(a.id);
  assert.ok(res, 'forfeit must still resolve the room');
  assert.equal(res.room.status, 'over');
  void room;
});

test('handleLeave falls through to forfeit when the realtime drop was not handled', () => {
  assert.match(handlers, /if \(res\.handled\)/);
});

test('getCurrentPlayerId names the mover of a turn-based room', () => {
  const a = createUser(uniq('cur_a'), 'x');
  const b = createUser(uniq('cur_b'), 'x');
  const { room } = createRoom('tictactoe', undefined, [a.id, b.id]);
  const seat = room.state.turn;
  const expected = room.players.find((p) => p.index === seat).id;
  assert.equal(getCurrentPlayerId(room.id), expected);
  assert.equal(getCurrentPlayerId('no-such-room'), null);
});

test('turn clock holds instead of auto-playing a player who is mid-grace', () => {
  const clock = readFileSync(new URL('../src/turnclock.js', import.meta.url), 'utf8');
  assert.match(clock, /from '\.\/reconnect\.js'/);
  assert.match(clock, /hasPending\(/); // fire-time guard, before applyTimeout
});

test('reconnect restarts a held clock with a fresh deadline and re-drives pending peer banners', () => {
  assert.match(handlers, /refreshTurnDeadline\(/);
  assert.match(handlers, /hasPending\(/); // resume re-sends opponents' grace status
});

test('game:start emission is shared by invite/lobby/rematch/resume via one helper', () => {
  assert.match(handlers, /function sendGameStart\(/);
  const uses = handlers.match(/sendGameStart\(io/g) || [];
  assert.ok(uses.length >= 4, `expected 4+ call sites, got ${uses.length}`);
  assert.doesNotMatch(handlers, /status === 'over'\)\s*\{\s*socket\.emit\('game:over'/); // dead resume branch removed
  assert.doesNotMatch(handlers, /function otherHumans/); // replaced by getRoomPlayerIds
});
