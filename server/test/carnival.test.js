import test from 'node:test';
import assert from 'node:assert/strict';
import { getMap, MAPS, listMaps } from '../src/games/kartMaps.js';
import { integrateKart, SIM_DT, surfaceHeight } from '../src/games/kartPhysics.js';

test('carnival exists, is listed, 200x200, theme carnival, 8 spawns', () => {
  const m = getMap('carnival');
  assert.equal(m.id, 'carnival');
  assert.equal(m.theme, 'carnival');
  assert.equal(m.arena.w, 200);
  assert.equal(m.arena.d, 200);
  assert.equal(m.spawns.length, 8);
  assert.ok(listMaps().some((x) => x.id === 'carnival'));
});

test('carnival spawns are side-split: first 4 north (z<0), last 4 south (z>0)', () => {
  const m = MAPS.carnival;
  for (let i = 0; i < 4; i++) assert.ok(m.spawns[i].z < 0, `spawn ${i} north`);
  for (let i = 4; i < 8; i++) assert.ok(m.spawns[i].z > 0, `spawn ${i} south`);
});

test('carnival central stage is a flat plateau (height 5) reachable up the north ramp', () => {
  const m = getMap('carnival');
  assert.equal(surfaceHeight(m, 0, 0), 5);   // plateau top
  assert.equal(surfaceHeight(m, 0, -85), 0); // spawn area is ground
  // drive from just below the north ramp straight up (+z) onto the plateau
  const k = { x: 0, z: -34, heading: 0, vel: 0, y: 0, vy: 0, grounded: true };
  for (let i = 0; i < 220 && k.z < 0; i++) integrateKart(k, { throttle: 1, steer: 0 }, SIM_DT, m);
  assert.ok(k.y >= 4.5, `expected to climb the stage, got y=${k.y}`);
});
