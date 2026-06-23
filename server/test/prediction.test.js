import { test } from 'node:test';
import assert from 'node:assert/strict';
import { integrateKart, SIM_DT, surfaceHeight } from '../src/games/kartPhysics.js';
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

test('inputs queued while dead are discarded (no respawn lurch)', () => {
  const sim = createSim([{}, {}], 0);
  const t0 = sim.startAt + 1000;
  sim.karts[0].alive = false;
  sim.karts[0].respawnAt = t0 + 2000;
  const q = [];
  for (let i = 1; i <= 60; i++) q.push({ seq: i, throttle: 1, steer: 1, fire: false });
  const inputs = { 0: { queue: q, last: null } };
  // tick while still dead: the backlog must be discarded, not retained
  step(sim, inputs, 0.033, t0);
  assert.equal(inputs[0].queue.length, 0, 'dead queue discarded');
  assert.equal(sim.karts[0].lastSeq, 60, 'lastSeq advanced to latest discarded');
  assert.equal(sim.karts[0].alive, false);
  // respawn tick (empty queue): kart placed at spawn with vel 0
  const tR = sim.karts[0].respawnAt + 1;
  step(sim, { 0: { queue: [], last: null } }, 0.033, tR);
  assert.equal(sim.karts[0].alive, true);
  assert.equal(sim.karts[0].vel, 0, 'respawn vel is 0, not flung');
  const sx = sim.karts[0].x, sz = sim.karts[0].z;
  // a follow-up tick with no input must not move the kart (no leftover backlog)
  step(sim, { 0: { queue: [], last: null } }, 0.033, tR + 33);
  assert.ok(Math.abs(sim.karts[0].x - sx) < 1e-9 && Math.abs(sim.karts[0].z - sz) < 1e-9, 'no movement without input');
});

test('reconcile + replay reproduces elevation state exactly', () => {
  const map = {
    arena: { w: 80, d: 80 }, obstacles: [],
    ramps: [{ kind: 'wedge', x: 0, z: 0, w: 8, d: 12, axis: 'z', loY: 0, hiY: 6 }],
  };
  const inputs = [];
  for (let i = 0; i < 40; i++) inputs.push({ seq: i + 1, throttle: 1, steer: 0 });
  // authoritative
  const server = { x: 0, z: -6, heading: 0, vel: 20, y: 0, vy: 0, grounded: true };
  for (const inp of inputs) integrateKart(server, inp, SIM_DT, map);
  // client replays the same inputs from the same start
  const client = { x: 0, z: -6, heading: 0, vel: 20, y: 0, vy: 0, grounded: true };
  for (const inp of inputs) integrateKart(client, inp, SIM_DT, map);
  assert.equal(client.y, server.y);
  assert.equal(client.vy, server.vy);
  assert.equal(client.grounded, server.grounded);
});

test('createSim seeds karts grounded at the spawn surface height', () => {
  const players = [{ id: 'a' }, { id: 'b' }];
  const sim = karts.createSim(players, 1000, { map: 'arena' });
  for (const k of sim.karts) {
    assert.equal(k.vy, 0);
    assert.equal(k.grounded, true);
    assert.equal(typeof k.y, 'number');
  }
});
