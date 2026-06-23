import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as server from '../src/games/kartPhysics.js';
import * as client from '../../client/src/games/karts/kartPhysics.js';

test('client and server kartPhysics constants match', () => {
  assert.deepEqual(client.PHYS, server.PHYS);
  assert.equal(client.SIM_DT, server.SIM_DT);
});

test('client and server integrateKart produce identical output', () => {
  let seed = 99;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 500; i++) {
    const base = { x: rnd() * 40 - 20, z: rnd() * 40 - 20, heading: rnd() * 7 - 3.5, vel: rnd() * 40 - 12 };
    const input = { throttle: rnd() * 2 - 1, steer: rnd() * 2 - 1 };
    const dt = rnd() * 0.05;
    const a = server.integrateKart({ ...base }, input, dt);
    const b = client.integrateKart({ ...base }, input, dt);
    assert.deepEqual(b, a);
  }
});
