import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleForfeit, cancelForfeit, hasPending } from '../src/reconnect.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('scheduleForfeit fires the callback after the delay', async () => {
  let fired = false;
  scheduleForfeit('u1', 20, () => { fired = true; });
  assert.equal(hasPending('u1'), true);
  await wait(45);
  assert.equal(fired, true);
  assert.equal(hasPending('u1'), false); // cleared after firing
});

test('cancelForfeit prevents the callback and reports it was pending', async () => {
  let fired = false;
  scheduleForfeit('u2', 30, () => { fired = true; });
  assert.equal(cancelForfeit('u2'), true);
  assert.equal(cancelForfeit('u2'), false); // nothing left to cancel
  await wait(50);
  assert.equal(fired, false);
});

test('re-scheduling replaces the prior timer', async () => {
  let count = 0;
  scheduleForfeit('u3', 20, () => { count += 1; });
  scheduleForfeit('u3', 20, () => { count += 1; }); // replaces the first
  await wait(45);
  assert.equal(count, 1); // only the second timer fires
});

test('separate users have independent timers', async () => {
  const fired = [];
  scheduleForfeit('a', 20, () => fired.push('a'));
  scheduleForfeit('b', 20, () => fired.push('b'));
  cancelForfeit('a');
  await wait(45);
  assert.deepEqual(fired, ['b']);
});
