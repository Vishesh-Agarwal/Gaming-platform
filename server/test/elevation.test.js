import test from 'node:test';
import assert from 'node:assert/strict';
import { integrateKart, SIM_DT, PHYS } from '../src/games/kartPhysics.js';

const flat = { arena: { w: 80, d: 80 }, obstacles: [], ramps: [], boosts: [] };
const mesa = { arena: { w: 80, d: 80 }, obstacles: [{ kind: 'box', x: 0, z: 0, w: 12, d: 12, top: 6 }], ramps: [] };
const noInput = { throttle: 0, steer: 0 };

test('grounded kart on flat ground stays at y=0', () => {
  const k = { x: 0, z: 0, heading: 0, vel: 10, y: 0, vy: 0, grounded: true };
  for (let i = 0; i < 10; i++) integrateKart(k, noInput, SIM_DT, flat);
  assert.equal(k.y, 0);
  assert.equal(k.grounded, true);
});

test('airborne kart falls under gravity and lands at the surface', () => {
  const k = { x: 0, z: 0, heading: 0, vel: 0, y: 10, vy: 0, grounded: false };
  let landed = false;
  for (let i = 0; i < 60 && !landed; i++) { integrateKart(k, noInput, SIM_DT, flat); landed = k.grounded; }
  assert.equal(k.grounded, true);
  assert.equal(k.y, 0);
  assert.equal(k.vy, 0);
});

test('air control: heading turns but throttle does not change vel in air', () => {
  const k = { x: 0, z: 0, heading: 0, vel: 12, y: 20, vy: 0, grounded: false };
  const h0 = k.heading;
  integrateKart(k, { throttle: 1, steer: 1 }, SIM_DT, flat);
  assert.equal(k.vel, 12); // no accel/drag in air
  assert.notEqual(k.heading, h0); // heading still turns
});

test('drives onto a mesa from the air (lands on top, no push-out)', () => {
  // start above the box footprint, falling — should land on top at y=6
  const k = { x: 0, z: 0, heading: 0, vel: 0, y: 12, vy: 0, grounded: false };
  for (let i = 0; i < 60 && !k.grounded; i++) integrateKart(k, noInput, SIM_DT, mesa);
  assert.equal(k.grounded, true);
  assert.equal(k.y, 6);
  assert.equal(k.x, 0); // not shoved out — we are above the top
});

test('box below the top still walls a ground-level kart', () => {
  // ground-level kart driving into the box side is pushed back out
  const k = { x: -10, z: 0, heading: Math.PI / 2, vel: 20, y: 0, vy: 0, grounded: true };
  for (let i = 0; i < 30; i++) integrateKart(k, { throttle: 1, steer: 0 }, SIM_DT, mesa);
  // never penetrates: stays at least KART_R outside the footprint edge (-6)
  assert.ok(k.x <= -6 - PHYS.KART_R + 0.01, `x=${k.x} should be left of the box`);
});

test('driving off a mesa edge starts a fall (does not snap to ground)', () => {
  // sitting on the mesa top near the +x edge, driving outward
  const k = { x: 5, z: 0, heading: Math.PI / 2, vel: 20, y: 6, vy: 0, grounded: true };
  // single step only advances ~0.67 (vel*dt), so step twice to actually cross x=6
  integrateKart(k, { throttle: 1, steer: 0 }, SIM_DT, mesa);
  integrateKart(k, { throttle: 1, steer: 0 }, SIM_DT, mesa); // crosses x=6 edge
  assert.equal(k.grounded, false, 'should be airborne after leaving the edge');
  assert.ok(k.y > 1, `y=${k.y} should not have snapped to ground`);
});
