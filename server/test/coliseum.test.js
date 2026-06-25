import test from 'node:test';
import assert from 'node:assert/strict';
import { getMap } from '../src/games/kartMaps.js';
import { integrateKart, SIM_DT, surfaceHeight } from '../src/games/kartPhysics.js';

test('coliseum exists with a 110x110 arena and 8 spawns', () => {
  const m = getMap('coliseum');
  assert.equal(m.id, 'coliseum');
  assert.equal(m.arena.w, 110);
  assert.equal(m.arena.d, 110);
  assert.equal(m.spawns.length, 8);
});

test('coliseum spawns are side-split: first 4 north (z<0), last 4 south (z>0)', () => {
  const m = getMap('coliseum');
  for (let i = 0; i < 4; i++) assert.ok(m.spawns[i].z < 0, `spawn ${i} should be north`);
  for (let i = 4; i < 8; i++) assert.ok(m.spawns[i].z > 0, `spawn ${i} should be south`);
});

test('coliseum has a central plateau at height 4 and ground at 0', () => {
  const m = getMap('coliseum');
  assert.equal(surfaceHeight(m, 0, 0), 4);   // plateau top
  assert.equal(surfaceHeight(m, 0, -46), 0); // spawn area is ground
});

test('coliseum central plateau is drive-up reachable via the north ramp', () => {
  const m = getMap('coliseum');
  // start just below the north ramp, drive straight forward (+z) up onto the plateau
  const k = { x: 0, z: -26, heading: 0, vel: 0, y: 0, vy: 0, grounded: true };
  for (let i = 0; i < 200 && k.z < 0; i++) {
    integrateKart(k, { throttle: 1, steer: 0 }, SIM_DT, m);
  }
  assert.ok(k.y >= 3.5, `expected to climb onto the plateau, got y=${k.y}`);
});
