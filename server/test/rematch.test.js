import test from 'node:test';
import assert from 'node:assert/strict';
import { createUser } from '../src/db.js';
import {
  acceptRematch,
  clearRematch,
  createRoom,
  getRematchOffer,
  getRoomIdForUser,
  makeMove,
} from '../src/rooms.js';

test('players can accept a rematch after a normal game over', () => {
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const a = createUser(`rematch_a_${suffix}`, 'x');
  const b = createUser(`rematch_b_${suffix}`, 'x');
  const created = createRoom('tictactoe', undefined, [a.id, b.id]);
  assert.equal(created.error, undefined);

  const roomId = created.room.id;
  makeMove(roomId, a.id, { cell: 0 });
  makeMove(roomId, b.id, { cell: 3 });
  makeMove(roomId, a.id, { cell: 1 });
  makeMove(roomId, b.id, { cell: 4 });
  const ended = makeMove(roomId, a.id, { cell: 2 });

  assert.equal(ended.room.status, 'over');
  assert.equal(getRoomIdForUser(a.id), undefined);
  assert.equal(getRoomIdForUser(b.id), undefined);
  assert.ok(getRematchOffer(roomId));

  assert.equal(acceptRematch(roomId, a.id).error, undefined);
  const { offer, error } = acceptRematch(roomId, b.id);
  assert.equal(error, undefined);
  assert.deepEqual([...offer.accepted].sort(), [a.id, b.id].sort());

  clearRematch(roomId);
  const rerun = createRoom(offer.gameId, offer.options, offer.userIds);
  assert.equal(rerun.error, undefined);
  assert.notEqual(rerun.room.id, roomId);
});
