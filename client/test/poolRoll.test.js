import assert from 'node:assert/strict';
import test from 'node:test';
import { createRollState, advanceRoll, rollFor } from '../src/games/poolRoll.js';

const R = 13;
const frame = (positions) => positions.map(([id, x, y]) => ({ id, x, y }));

test('a stationary ball accumulates no roll', () => {
  const st = createRollState();
  advanceRoll(st, frame([[1, 100, 100]]), R);
  advanceRoll(st, frame([[1, 100, 100]]), R);
  const roll = rollFor(st, 1);
  assert.ok(!roll || roll.angle === 0);
});

test('rolling one circumference in +x accumulates ~2π with direction (1,0)', () => {
  const st = createRollState();
  const total = 2 * Math.PI * R;
  const steps = 20;
  for (let i = 0; i <= steps; i++) {
    advanceRoll(st, frame([[1, 100 + (total * i) / steps, 100]]), R);
  }
  const roll = rollFor(st, 1);
  assert.ok(Math.abs(roll.angle - 2 * Math.PI) < 1e-6);
  assert.ok(Math.abs(roll.dirX - 1) < 1e-6);
  assert.ok(Math.abs(roll.dirY) < 1e-6);
});

test('direction follows the latest travel vector', () => {
  const st = createRollState();
  advanceRoll(st, frame([[1, 100, 100]]), R);
  advanceRoll(st, frame([[1, 120, 100]]), R);
  advanceRoll(st, frame([[1, 120, 130]]), R);
  const roll = rollFor(st, 1);
  assert.ok(Math.abs(roll.dirX) < 1e-6);
  assert.ok(Math.abs(roll.dirY - 1) < 1e-6);
});

test('unknown ids return null and potted balls do not break the state', () => {
  const st = createRollState();
  advanceRoll(st, frame([[1, 100, 100], [2, 200, 100]]), R);
  advanceRoll(st, frame([[1, 110, 100]]), R); // ball 2 potted
  assert.equal(rollFor(st, 99), null);
  assert.ok(rollFor(st, 1));
});
