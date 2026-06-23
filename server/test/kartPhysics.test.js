import { test } from 'node:test';
import assert from 'node:assert/strict';
import { integrateKart, PHYS, SIM_DT } from '../src/games/kartPhysics.js';

test('SIM_DT and PHYS are present', () => {
  assert.equal(SIM_DT, 1 / 30);
  assert.equal(PHYS.MAX_SPEED, 28);
  assert.equal(PHYS.ARENA_W, 80);
});

test('integrateKart is deterministic', () => {
  const a = { x: 0, z: 0, heading: 0.2, vel: 5 };
  const b = { x: 0, z: 0, heading: 0.2, vel: 5 };
  integrateKart(a, { throttle: 1, steer: 1 }, SIM_DT);
  integrateKart(b, { throttle: 1, steer: 1 }, SIM_DT);
  assert.deepEqual(a, b);
});

test('throttle accelerates forward (heading 0 -> +z)', () => {
  const k = { x: 0, z: 0, heading: 0, vel: 0 };
  for (let i = 0; i < 30; i++) integrateKart(k, { throttle: 1, steer: 0 }, SIM_DT);
  assert.ok(k.vel > 0);
  assert.ok(k.z > 0.5);
  assert.ok(Math.abs(k.x) < 1e-9);
});

test('wall clamp bounds position', () => {
  const k = { x: 0, z: 0, heading: 0, vel: 28 };
  for (let i = 0; i < 200; i++) integrateKart(k, { throttle: 1, steer: 0 }, SIM_DT);
  assert.ok(k.z <= PHYS.ARENA_D / 2 - PHYS.KART_R + 1e-9);
});
