import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSnapshotRows, SNAP_V } from '../src/persistence.js';

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
