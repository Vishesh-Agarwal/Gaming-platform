import test from 'node:test';
import assert from 'node:assert/strict';
import { createUser } from '../src/db.js';
import {
  createRoom, getRoom, exportRooms, importRooms,
  isRealtimeRoom, refreshTurnDeadline,
} from '../src/rooms.js';

function uniq(p) { return `${p}${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 5)}`; }

function twoUsers(prefix) {
  return [createUser(uniq(`${prefix}a`), 'x'), createUser(uniq(`${prefix}b`), 'x')];
}

test('isRealtimeRoom is true for realtime-typed games without a server step (ghostrider)', () => {
  const [a, b] = twoUsers('rt_gr');
  const { room, error } = createRoom('ghostrider', undefined, [a.id, b.id]);
  assert.ok(!error, error);
  assert.equal(isRealtimeRoom(room.id), true);
});

test('exportRooms excludes realtime-typed games without a server step (ghostrider)', () => {
  const [a, b] = twoUsers('exp_gr');
  const { room } = createRoom('ghostrider', undefined, [a.id, b.id]);
  assert.equal(exportRooms().find((r) => r.id === room.id), undefined);
});

test('importRooms stamps a fresh turn deadline instead of the stale snapshot one', () => {
  const [a, b] = twoUsers('ddl');
  const { room } = createRoom('tictactoe', undefined, [a.id, b.id]);
  const mine = exportRooms().find((r) => r.id === room.id);
  assert.ok(mine.turnEndsAt, 'tictactoe rooms are timed');

  const serial = JSON.parse(JSON.stringify(mine));
  serial.id = `rehyd_${room.id}`;
  serial.turnEndsAt = Date.now() - 60_000; // server was down past the deadline
  importRooms([serial]);

  const rebuilt = getRoom(serial.id);
  assert.ok(rebuilt.turnEndsAt > Date.now(), 'deadline must be re-stamped fresh, not expired');
});

test('refreshTurnDeadline restamps timed games and returns null for untimed ones', () => {
  const [a, b] = twoUsers('rfr');
  const { room } = createRoom('tictactoe', undefined, [a.id, b.id]);
  const before = getRoom(room.id).turnEndsAt;
  const fresh = refreshTurnDeadline(room.id);
  assert.ok(fresh >= before, 'deadline moves forward');
  assert.equal(getRoom(room.id).turnEndsAt, fresh);

  const [c, d] = twoUsers('rfu');
  const { room: untimed } = createRoom('connect4', undefined, [c.id, d.id]);
  assert.equal(refreshTurnDeadline(untimed.id), null);
});
