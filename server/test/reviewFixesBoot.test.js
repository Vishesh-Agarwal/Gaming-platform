import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createUser } from '../src/db.js';
import { createRoom } from '../src/rooms.js';
import { createLobby, joinLobby, getLobbyForUser } from '../src/lobbies.js';
import { online, offline } from '../src/presence.js';
import { hasPending, cancelForfeit } from '../src/reconnect.js';
import { scheduleOfflineForfeits, evictOfflineLobbyMembers } from '../src/socketHandlers.js';

function uniq(p) { return `${p}${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 5)}`; }

const fakeIo = { to: () => ({ emit: () => {} }) };

test('rehydrated rooms give every offline human a grace-forfeit timer', () => {
  const a = createUser(uniq('bf_a'), 'x');
  const b = createUser(uniq('bf_b'), 'x');
  const { room, error } = createRoom('checkers', undefined, [a.id, b.id]); // untimed — the zombie case
  assert.ok(!error, error);
  scheduleOfflineForfeits(fakeIo, [room.id]);
  assert.ok(hasPending(a.id), 'offline player a gets a grace timer');
  assert.ok(hasPending(b.id), 'offline player b gets a grace timer');
  cancelForfeit(a.id);
  cancelForfeit(b.id);
});

test('players already back online are not scheduled for forfeit', () => {
  const a = createUser(uniq('bo_a'), 'x');
  const b = createUser(uniq('bo_b'), 'x');
  const { room } = createRoom('checkers', undefined, [a.id, b.id]);
  online(a.id);
  try {
    scheduleOfflineForfeits(fakeIo, [room.id]);
    assert.equal(hasPending(a.id), false, 'online player keeps playing');
    assert.ok(hasPending(b.id), 'offline player still gets the timer');
  } finally {
    offline(a.id);
    cancelForfeit(a.id);
    cancelForfeit(b.id);
  }
});

test('offline lobby members are evicted; online ones keep their seat', () => {
  const a = createUser(uniq('bl_a'), 'x');
  const b = createUser(uniq('bl_b'), 'x');
  const { lobby, error } = createLobby(a, 'checkers');
  assert.ok(!error, error);
  assert.ok(!joinLobby(lobby.id, b).error);
  online(a.id);
  try {
    evictOfflineLobbyMembers(fakeIo);
    assert.equal(getLobbyForUser(b.id), null, 'ghost member swept out');
    assert.ok(getLobbyForUser(a.id), 'online member keeps the lobby');
  } finally {
    offline(a.id);
    const rest = getLobbyForUser(a.id);
    if (rest) evictOfflineLobbyMembers(fakeIo); // clean up the test lobby
  }
});

test('boot wires grace forfeits and delayed lobby eviction after rehydrate', () => {
  const index = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  assert.match(index, /scheduleOfflineForfeits\(io, roomIds\)/);
  assert.match(index, /evictOfflineLobbyMembers\(io\)/);
  assert.match(index, /setTimeout\(\(\) => evictOfflineLobbyMembers\(io\)/, 'eviction waits out the grace window');
});
