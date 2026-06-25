import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../src/games/karts.js';

const NOW = 5000;
const KR2 = 2.2 * 2; // PHYS.KART_R * 2

function sim2(aPos, bPos) {
  const sim = game.createSim([{}, {}], 0, { map: 'arena' });
  Object.assign(sim.karts[0], { x: aPos[0], z: aPos[1], y: aPos[2] || 0, grounded: true, vy: 0 });
  Object.assign(sim.karts[1], { x: bPos[0], z: bPos[1], y: bPos[2] || 0, grounded: true, vy: 0 });
  return sim;
}

test('overlapping karts are pushed apart to at least 2*KART_R', () => {
  const sim = sim2([10, 0], [11, 0]); // 1 apart, overlapping
  game.step(sim, [{}, {}], 1 / 30, NOW);
  const d = Math.hypot(sim.karts[1].x - sim.karts[0].x, sim.karts[1].z - sim.karts[0].z);
  assert.ok(d >= KR2 - 1e-6, `expected separation >= ${KR2}, got ${d}`);
});

test('a kart driving into another recoils (velocity reversed/damped)', () => {
  const sim = sim2([10, 0], [13, 0]); // 3 apart, overlapping
  sim.karts[0].heading = Math.PI / 2; sim.karts[0].vel = 10; // moving +x toward b
  sim.karts[1].heading = -Math.PI / 2; sim.karts[1].vel = 10; // moving -x toward a
  game.step(sim, [{}, {}], 1 / 30, NOW);
  assert.ok(sim.karts[0].vel < 0, `kart 0 should recoil, vel=${sim.karts[0].vel}`);
  assert.ok(sim.karts[1].vel < 0, `kart 1 should recoil, vel=${sim.karts[1].vel}`);
});

test('karts at very different heights do not collide', () => {
  const sim = sim2([10, 0, 0], [11, 0, 5]); // overlap in x/z, 5 apart in y
  game.step(sim, [{}, {}], 1 / 30, NOW);
  const d = Math.hypot(sim.karts[1].x - sim.karts[0].x, sim.karts[1].z - sim.karts[0].z);
  assert.ok(d < KR2, `expected NO separation across heights, got ${d}`);
});
