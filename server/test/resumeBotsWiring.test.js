import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resumeBots } from '../src/socketHandlers.js';

const index = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');

test('resumeBots is exported and is a no-op for an empty/nonexistent room list', () => {
  assert.equal(typeof resumeBots, 'function');
  const mockIo = { to: () => ({ emit() {} }) };
  assert.doesNotThrow(() => resumeBots(mockIo, []));
  assert.doesNotThrow(() => resumeBots(mockIo, ['no-such-room']));
});

test('index.js rehydrates on boot and snapshots on shutdown', () => {
  assert.match(index, /rehydrate\(\)/);
  assert.match(index, /armTurnClock\(/);
  assert.match(index, /resumeBots\(/);
  assert.match(index, /startSnapshotter\(/);
  assert.match(index, /snapshotNow\(\)/);
  assert.match(index, /stopSnapshotter\(\)/);
});

test('shutdown snapshots synchronously before closing sockets', () => {
  const shutdownSrc = index.slice(index.indexOf('const shutdown'));
  // io.close (not bare server.close) — open websockets keep server.close's
  // callback from ever firing, which used to skip the final snapshot entirely.
  assert.match(shutdownSrc, /io\.close\(/);
  const snapAt = shutdownSrc.indexOf('snapshotNow()');
  const closeAt = shutdownSrc.indexOf('io.close(');
  assert.ok(snapAt !== -1 && snapAt < closeAt, 'snapshot must happen before sockets start closing');
});
