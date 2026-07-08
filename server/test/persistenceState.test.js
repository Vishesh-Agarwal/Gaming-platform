import test from 'node:test';
import assert from 'node:assert/strict';
import { createUser } from '../src/db.js';
import { createRoom, makeMove, getRoom, exportRooms, importRooms } from '../src/rooms.js';
import { createLobby, exportLobbies, importLobbies, getLobby } from '../src/lobbies.js';

function uniq(p) { return `${p}${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 5)}`; }

test('a turn-based room round-trips through export/import with a working game module', () => {
  const a = createUser(uniq('dur_a'), 'x');
  const b = createUser(uniq('dur_b'), 'x');
  const { room } = createRoom('tictactoe', undefined, [a.id, b.id]);
  // seat 0 plays a move so state is non-initial
  const first = makeMove(room.id, room.state.turn === 0 ? a.id : b.id, { cell: 0 });
  assert.ok(!first.error, first.error);

  const exported = exportRooms();
  const mine = exported.find((r) => r.id === room.id);
  assert.ok(mine, 'room should be exported');
  assert.equal(mine.gameId, 'tictactoe');
  assert.equal(mine.status, 'playing');
  assert.equal(mine.players.length, 2);
  assert.ok(mine.players.every((p) => typeof p.index === 'number'));

  // simulate a DB round-trip and rehydrate under a fresh id
  const serial = JSON.parse(JSON.stringify(mine));
  serial.id = `rehyd_${room.id}`;
  const ids = importRooms([serial]);
  assert.deepEqual(ids, [serial.id]);

  const rebuilt = getRoom(serial.id);
  assert.ok(rebuilt, 'rebuilt room should exist');
  assert.deepEqual(rebuilt.state.board, getRoom(room.id).state.board);
  // proves the game module was re-attached: a further move applies without error
  const seat = rebuilt.state.turn;
  const mover = rebuilt.players.find((p) => p.index === seat).id;
  const res = makeMove(serial.id, mover, { cell: 1 });
  assert.ok(!res.error, `move on rehydrated room failed: ${res.error}`);
});

test('realtime rooms are excluded from the export', () => {
  const a = createUser(uniq('dur_rt_a'), 'x');
  const b = createUser(uniq('dur_rt_b'), 'x');
  const { room } = createRoom('karts', undefined, [a.id, b.id]);
  const exported = exportRooms();
  assert.equal(exported.find((r) => r.id === room.id), undefined);
});

test('lobbies round-trip through export/import', () => {
  const u = createUser(uniq('dur_lob'), 'x');
  const { lobby } = createLobby({ id: u.id, username: u.username }, 'ludo', undefined);
  assert.ok(lobby, 'lobby created');
  const exported = exportLobbies();
  const mine = exported.find((l) => l.id === lobby.id);
  assert.ok(mine, 'lobby exported');

  const serial = JSON.parse(JSON.stringify(mine));
  serial.id = `rehyd_${lobby.id}`;
  serial.code = 'ZZZZ';
  importLobbies([serial]);
  assert.ok(getLobby(serial.id), 'rehydrated lobby should exist');
});
