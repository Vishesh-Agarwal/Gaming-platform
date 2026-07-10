import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSnapshotRows, snapshotNow, SNAP_V } from '../src/persistence.js';
import { createUser } from '../src/db.js';
import { createRoom } from '../src/rooms.js';

function uniq(p) { return `${p}${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 5)}`; }

test('parseSnapshotRows routes rooms and lobbies and skips bad rows', () => {
  const rows = [
    { kind: 'room', id: 'r1', v: SNAP_V, json: JSON.stringify({ id: 'r1', gameId: 'tictactoe' }) },
    { kind: 'lobby', id: 'l1', v: SNAP_V, json: JSON.stringify({ id: 'l1', code: 'ABCD', members: [] }) },
    { kind: 'room', id: 'bad-json', v: SNAP_V, json: '{not valid json' },        // skipped
    { kind: 'room', id: 'old-version', v: SNAP_V + 99, json: JSON.stringify({}) }, // skipped
  ];
  const { rooms, lobbies } = parseSnapshotRows(rows);
  assert.deepEqual(rooms.map((r) => r.id), ['r1']);
  assert.deepEqual(lobbies.map((l) => l.id), ['l1']);
});

test('parseSnapshotRows tolerates an empty/undefined input', () => {
  assert.deepEqual(parseSnapshotRows([]), { rooms: [], lobbies: [] });
  assert.deepEqual(parseSnapshotRows(undefined), { rooms: [], lobbies: [] });
});

test('snapshotNow skips the DB write while nothing changed', () => {
  const a = createUser(uniq('sn_a'), 'x');
  const b = createUser(uniq('sn_b'), 'x');
  const { error } = createRoom('checkers', undefined, [a.id, b.id]);
  assert.ok(!error, error);
  assert.equal(snapshotNow(), true, 'first snapshot writes');
  assert.equal(snapshotNow(), false, 'identical state skips the write');

  const c = createUser(uniq('sn_c'), 'x');
  const d = createUser(uniq('sn_d'), 'x');
  createRoom('checkers', undefined, [c.id, d.id]);
  assert.equal(snapshotNow(), true, 'new state dirties the snapshot again');
});
