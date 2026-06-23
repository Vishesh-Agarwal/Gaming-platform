import { test } from 'node:test';
import assert from 'node:assert/strict';
import { integrateKart, SIM_DT } from '../src/games/kartPhysics.js';
import karts from '../src/games/karts.js';

const { createSim, step } = karts;

test('reconciliation replay matches a sequential sim', () => {
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const inputs = [];
  for (let i = 0; i < 50; i++) inputs.push({ seq: i + 1, throttle: rnd() * 2 - 1, steer: rnd() * 2 - 1 });

  const full = { x: 1, z: -2, heading: 0.3, vel: 4 };
  for (const inp of inputs) integrateKart(full, inp, SIM_DT);

  const K = 30;
  const anchor = { x: 1, z: -2, heading: 0.3, vel: 4 };
  for (let i = 0; i < K; i++) integrateKart(anchor, inputs[i], SIM_DT);
  const ack = inputs[K - 1].seq;

  const client = { x: anchor.x, z: anchor.z, heading: anchor.heading, vel: anchor.vel };
  for (const inp of inputs) if (inp.seq > ack) integrateKart(client, inp, SIM_DT);

  for (const key of ['x', 'z', 'heading', 'vel']) {
    assert.ok(Math.abs(client[key] - full[key]) < 1e-9, `${key} mismatch`);
  }
});

test('step draining a queue matches integrateKart per input + sets lastSeq', () => {
  const sim = createSim([{}, {}], 0);
  const now = sim.startAt + 1000;
  const cmds = [
    { seq: 1, throttle: 1, steer: 0.5, fire: false },
    { seq: 2, throttle: 1, steer: -0.5, fire: false },
    { seq: 3, throttle: 0.5, steer: 0, fire: false },
  ];
  const k0 = sim.karts[0];
  const exp = { x: k0.x, z: k0.z, heading: k0.heading, vel: k0.vel };
  for (const c of cmds) integrateKart(exp, c, SIM_DT);

  const inputs = { 0: { queue: cmds.map((c) => ({ ...c })), last: null } };
  step(sim, inputs, 0.033, now);

  for (const key of ['x', 'z', 'heading']) {
    assert.ok(Math.abs(sim.karts[0][key === 'heading' ? 'heading' : key] - exp[key]) < 1e-9, `${key} mismatch`);
  }
  assert.equal(sim.karts[0].lastSeq, 3);
});

test('fire travels through the queue into the sim (regression: fire was dropped)', () => {
  const sim = createSim([{}, {}], 0);
  const now = sim.startAt + 1000;
  sim.karts[0].weapon = 'mg';
  sim.karts[0].ammo = 5;
  sim.karts[0].nextShotAt = 0;
  const inputs = { 0: { queue: [{ seq: 1, throttle: 0, steer: 0, fire: true }], last: null } };
  const before = sim.projectiles.length;
  step(sim, inputs, 0.033, now);
  assert.ok(sim.projectiles.length > before, 'a projectile should have been fired');
});
