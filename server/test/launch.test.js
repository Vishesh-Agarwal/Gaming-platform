import test from 'node:test';
import assert from 'node:assert/strict';
import { integrateKart, SIM_DT } from '../src/games/kartPhysics.js';

// a wedge rising along +z from y=0 to y=6 over z in [-6,6], then flat ground after z>6
const ordinaryRamp = {
  arena: { w: 80, d: 80 }, obstacles: [],
  ramps: [{ kind: 'wedge', x: 0, z: 0, w: 8, d: 12, axis: 'z', loY: 0, hiY: 6 }],
};
const launchRamp = {
  arena: { w: 80, d: 80 }, obstacles: [],
  ramps: [{ kind: 'wedge', x: 0, z: 0, w: 8, d: 12, axis: 'z', loY: 0, hiY: 6, launch: true }],
};

test('fast climb up an explicit launch ramp launches into the air with upward vy', () => {
  // start at the bottom of the ramp moving +z at high speed
  const k = { x: 0, z: -6, heading: 0, vel: 26, y: 0, vy: 0, grounded: true };
  let launched = false;
  for (let i = 0; i < 60 && !launched; i++) {
    integrateKart(k, { throttle: 1, steer: 0 }, SIM_DT, launchRamp);
    if (!k.grounded) launched = true;
  }
  assert.equal(launched, true, 'should leave the ground at the lip');
  assert.ok(k.vy > 0, `vy=${k.vy} should be upward at launch`);
});

test('fast climb up an ordinary ramp does not launch upward at the lip', () => {
  const k = { x: 0, z: -6, heading: 0, vel: 26, y: 0, vy: 0, grounded: true };
  for (let i = 0; i < 60; i++) {
    integrateKart(k, { throttle: 1, steer: 0 }, SIM_DT, ordinaryRamp);
    assert.ok(k.vy <= 0, `ordinary ramp should not launch upward, got vy=${k.vy}`);
  }
});

test('slow crawl up a ramp stays glued (no launch)', () => {
  const k = { x: 0, z: -6, heading: 0, vel: 1.5, y: 0, vy: 0, grounded: true };
  for (let i = 0; i < 200; i++) {
    integrateKart(k, { throttle: 0.15, steer: 0 }, SIM_DT, ordinaryRamp);
    // stop just shy of the wedge's far edge (z=6) — past that the kart steps off
    // the footprint into a sheer cliff (a pre-existing edge-fall case, unrelated
    // to ramp-launch), so checking k.y near the lip avoids that single-step overshoot.
    if (k.y >= 5.5) break;
  }
  assert.equal(k.grounded, true, 'slow climb should never launch');
});

test('flat ground at speed never launches', () => {
  const flat = { arena: { w: 80, d: 80 }, obstacles: [], ramps: [] };
  const k = { x: 0, z: 0, heading: 0, vel: 28, y: 0, vy: 0, grounded: true };
  for (let i = 0; i < 30; i++) integrateKart(k, { throttle: 1, steer: 0 }, SIM_DT, flat);
  assert.equal(k.grounded, true);
  assert.equal(k.y, 0);
});
