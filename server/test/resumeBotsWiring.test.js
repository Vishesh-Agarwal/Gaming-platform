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
