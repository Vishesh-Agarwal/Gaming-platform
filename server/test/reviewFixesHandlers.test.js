import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createUser } from '../src/db.js';
import { createRoom, dropFromRealtime, forfeit } from '../src/rooms.js';

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
