import { test } from 'node:test';
import assert from 'node:assert/strict';
import { integrateKart, SIM_DT, PHYS } from '../src/games/kartPhysics.js';

const boxMap = { arena: { w: 80, d: 80 }, obstacles: [{ kind: 'box', x: 0, z: 0, w: 10, d: 10 }], boosts: [] };
const cylMap = { arena: { w: 80, d: 80 }, obstacles: [{ kind: 'cyl', x: 0, z: 0, r: 5 }], boosts: [] };

test('no map => unchanged movement (back-compat)', () => {
  const a = { x: 0, z: 0, heading: 0, vel: 0 };
  const b = { x: 0, z: 0, heading: 0, vel: 0 };
  for (let i = 0; i < 20; i++) { integrateKart(a, { throttle: 1, steer: 0 }, SIM_DT); integrateKart(b, { throttle: 1, steer: 0 }, SIM_DT, null); }
  assert.deepEqual(a, b);
});

test('kart cannot end up inside a box obstacle', () => {
  const k = { x: -20, z: 0, heading: Math.PI / 2, vel: 0 }; // heading +x toward the box
  for (let i = 0; i < 300; i++) integrateKart(k, { throttle: 1, steer: 0 }, SIM_DT, boxMap);
  const inside = Math.abs(k.x) < 5 + PHYS.KART_R - 1e-6 && Math.abs(k.z) < 5 + PHYS.KART_R - 1e-6;
  assert.equal(inside, false, 'kart penetrated the box');
});

test('kart cannot end up inside a cyl obstacle', () => {
  const k = { x: 0, z: -20, heading: 0, vel: 0 }; // heading +z toward the cyl
  for (let i = 0; i < 300; i++) integrateKart(k, { throttle: 1, steer: 0 }, SIM_DT, cylMap);
  assert.ok(Math.hypot(k.x, k.z) >= 5 + PHYS.KART_R - 1e-6, 'kart penetrated the cyl');
});

test('boost pad pushes speed above MAX_SPEED', () => {
  const map = { arena: { w: 80, d: 80 }, obstacles: [], boosts: [{ x: 0, z: 5, r: 8, strength: 40 }] };
  const k = { x: 0, z: 0, heading: 0, vel: 0 };
  for (let i = 0; i < 10; i++) integrateKart(k, { throttle: 1, steer: 0 }, SIM_DT, map);
  assert.ok(k.vel >= 40, `expected boosted speed, got ${k.vel}`);
  assert.ok(k.vel > PHYS.MAX_SPEED);
});

test('collision replay is deterministic (reconciliation holds)', () => {
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const inputs = []; for (let i = 0; i < 40; i++) inputs.push({ seq: i + 1, throttle: rnd() * 2 - 1, steer: rnd() * 2 - 1 });
  const full = { x: -8, z: -8, heading: 0.5, vel: 6 };
  for (const inp of inputs) integrateKart(full, inp, SIM_DT, boxMap);
  const K = 25; const anchor = { x: -8, z: -8, heading: 0.5, vel: 6 };
  for (let i = 0; i < K; i++) integrateKart(anchor, inputs[i], SIM_DT, boxMap);
  const ack = inputs[K - 1].seq;
  const client = { ...anchor };
  for (const inp of inputs) if (inp.seq > ack) integrateKart(client, inp, SIM_DT, boxMap);
  for (const key of ['x', 'z', 'heading', 'vel']) assert.ok(Math.abs(client[key] - full[key]) < 1e-9, `${key} mismatch`);
});
