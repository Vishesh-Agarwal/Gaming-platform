import test from 'node:test';
import assert from 'node:assert/strict';
import karts, { projectileHitsPillar } from '../src/games/karts.js';
import { MAPS } from '../src/games/kartMaps.js';

// Pillars map: central cylinder r=4 at (0,0). Box obstacles and flat plateaus
// already stop shots via the surfaceHeight check — cylinders were the gap.

test('projectileHitsPillar: inside a cylinder footprint, clear elsewhere', () => {
  const map = MAPS.pillars;
  assert.equal(projectileHitsPillar(map, 0, 0), true);
  assert.equal(projectileHitsPillar(map, 3.5, 0), true);
  assert.equal(projectileHitsPillar(map, 8, 0), false);
  assert.equal(projectileHitsPillar({ obstacles: [] }, 0, 0), false);
});

test('a rocket dies at a pillar and never reaches the kart behind it', () => {
  const sim = karts.createSim([{ id: 'a' }, { id: 'b' }], 0, { map: 'pillars' });
  const now = sim.startAt + 100;
  const victim = sim.karts[1];
  victim.x = 8; victim.z = 0; victim.y = 0; victim.alive = true; victim.shieldUntil = 0;
  const hp0 = victim.hp;
  sim.projectiles.push({ id: 999, type: 'rocket', owner: 0, h: 0, x: -6, z: 0, y: 2, vx: 42, vz: 0, vy: 0, life: 5 });
  for (let i = 0; i < 12; i++) karts.step(sim, {}, 1 / 30, now + i * 33);
  assert.equal(sim.projectiles.find((p) => p.id === 999), undefined, 'rocket should be gone');
  assert.equal(victim.hp, hp0, 'kart behind the pillar must not take damage');
});

test('the same rocket flies free on open ground', () => {
  const sim = karts.createSim([{ id: 'a' }, { id: 'b' }], 0, { map: 'pillars' });
  const now = sim.startAt + 100;
  // open lane along z=10 (clear of all five pillars)
  sim.projectiles.push({ id: 998, type: 'rocket', owner: 0, h: 0, x: -6, z: 10, y: 6, vx: 42, vz: 0, vy: 9, life: 5 });
  for (let i = 0; i < 6; i++) karts.step(sim, {}, 1 / 30, now + i * 33);
  const p = sim.projectiles.find((q) => q.id === 998);
  assert.ok(p, 'rocket should still be in flight');
  assert.ok(p.x > 0, `rocket should have crossed the middle of the lane, x=${p.x}`);
});
