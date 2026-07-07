import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadConfig } from '../src/config.js';

const handlers = readFileSync(new URL('../src/socketHandlers.js', import.meta.url), 'utf8');

test('config exposes a 45s default reconnect grace window', () => {
  assert.equal(loadConfig({}).reconnectGraceMs, 45000);
  assert.equal(loadConfig({ RECONNECT_GRACE_MS: '30000' }).reconnectGraceMs, 30000);
});

test('socketHandlers wires the grace timer and gates it on turn-based rooms', () => {
  assert.match(handlers, /from '\.\/reconnect\.js'/);
  assert.match(handlers, /scheduleForfeit\(/);
  assert.match(handlers, /cancelForfeit\(/);
  // grace only for non-realtime rooms; realtime still drops immediately
  assert.match(handlers, /isRealtimeRoom/);
  assert.match(handlers, /reconnectGraceMs/);
});

test('socketHandlers notifies opponents and resumes on reconnect', () => {
  assert.match(handlers, /'game:peer'/);
  assert.match(handlers, /status: 'left'/);
  assert.match(handlers, /status: 'back'/);
  // resume path re-emits game:start to the reconnecting socket
  assert.match(handlers, /socket\.emit\('game:start'/);
});
