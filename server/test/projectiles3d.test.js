import test from 'node:test';
import assert from 'node:assert/strict';
import karts from '../src/games/karts.js';

const flat = { map: 'arena' };

function playSim() {
  const sim = karts.createSim([{ id: 'a' }, { id: 'b' }], 0, flat);
  // fast-forward past countdown
  return sim;
}

test('mg projectile arcs downward over its flight (y decreases)', () => {
  const sim = playSim();
  const now = sim.startAt + 100;
  const shooter = sim.karts[0];
  // arena now has a central mesa (Maps Phase 2); fire from open flat ground instead.
  shooter.x = 20; shooter.z = 20; shooter.y = 0; shooter.heading = 0;
  shooter.weapon = 'mg'; shooter.ammo = 10; shooter.nextShotAt = 0;
  karts.step(sim, { 0: { last: { fire: true }, queue: [] } }, 1 / 30, now);
  const p = sim.projectiles[0];
  assert.ok(p, 'a projectile was fired');
  const y0 = p.y;
  for (let i = 0; i < 5; i++) karts.step(sim, {}, 1 / 30, now + i * 33);
  assert.ok(p.y < y0, `y ${p.y} should drop below ${y0}`);
});

test('projectile dies when it reaches the ground', () => {
  const sim = playSim();
  const now = sim.startAt + 100;
  sim.projectiles.push({ id: 999, type: 'mg', owner: 0, h: 0, x: 0, z: 0, y: 0.1, vx: 0, vz: 0, vy: -10, life: 5 });
  karts.step(sim, {}, 1 / 30, now); // y += vy*d = 0.1 - 0.333 < 0 -> hits ground, removed
  assert.equal(sim.projectiles.find((p) => p.id === 999), undefined);
});

test('vertical gate: no hit when target is far below the projectile', () => {
  const sim = playSim();
  const now = sim.startAt + 100;
  const victim = sim.karts[1];
  victim.x = 0; victim.z = 0; victim.y = 0; victim.alive = true;
  const hp0 = victim.hp;
  // projectile passing directly overhead at high altitude
  sim.projectiles.push({ id: 998, type: 'mg', owner: 0, h: 0, x: 0, z: 0, y: 10, vx: 0, vz: 0, vy: 0, life: 5 });
  karts.step(sim, {}, 1 / 30, now);
  assert.equal(victim.hp, hp0, 'overhead shot should miss a ground target');
});

test('snapshot includes projectile y', () => {
  const sim = playSim();
  sim.projectiles.push({ id: 997, type: 'rocket', owner: 0, h: 0, x: 1, z: 2, y: 3, vx: 0, vz: 0, vy: 0, life: 5 });
  const snap = karts.snapshot(sim, sim.startAt + 100);
  const sp = snap.proj.find((p) => p.id === 997);
  assert.equal(sp.y, 3);
});
