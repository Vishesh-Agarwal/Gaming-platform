import test from 'node:test';
import assert from 'node:assert/strict';
import { createBucketLimiter } from '../src/security.js';

test('allows up to capacity then blocks, refills over time', () => {
  // 3 tokens, refills 1/sec
  const lim = createBucketLimiter({ capacity: 3, refillPerSec: 1 });
  const t0 = 1_000_000;
  assert.equal(lim.allow('k', 1, t0), true);
  assert.equal(lim.allow('k', 1, t0), true);
  assert.equal(lim.allow('k', 1, t0), true);
  assert.equal(lim.allow('k', 1, t0), false); // bucket empty
  assert.equal(lim.allow('k', 1, t0 + 1000), true); // +1s => +1 token
  assert.equal(lim.allow('k', 1, t0 + 1000), false);
});

test('separate keys have independent buckets', () => {
  const lim = createBucketLimiter({ capacity: 1, refillPerSec: 1 });
  const t = 5_000_000;
  assert.equal(lim.allow('a', 1, t), true);
  assert.equal(lim.allow('a', 1, t), false);
  assert.equal(lim.allow('b', 1, t), true); // unrelated key unaffected
});

test('refill never exceeds capacity', () => {
  const lim = createBucketLimiter({ capacity: 2, refillPerSec: 1 });
  const t = 9_000_000;
  assert.equal(lim.allow('k', 1, t), true);
  // idle a long time, then two allows should succeed but not three
  assert.equal(lim.allow('k', 1, t + 100_000), true);
  assert.equal(lim.allow('k', 1, t + 100_000), true);
  assert.equal(lim.allow('k', 1, t + 100_000), false);
});

test('game:move sustains a continuous skribble drawing stream', async () => {
  const { allowSocketEvent } = await import('../src/security.js');
  // Skribble flushes a stroke segment every ~70ms while the pen is down
  // (Skribble.jsx STREAM_MS) — a long uninterrupted line must never trip
  // the flood limit and tear holes in the drawing.
  const t0 = 42_000_000;
  for (let i = 0; i < Math.ceil(5000 / 70); i += 1) {
    assert.equal(allowSocketEvent(9911001, 'game:move', t0 + i * 70), true, `segment ${i} dropped`);
  }
});
