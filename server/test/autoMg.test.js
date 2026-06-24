import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../src/games/karts.js';

// Build a 2+-kart 'arena' sim, started, with karts placed on the +x axis
// (x >= 20, z = 0) — clear of arena's central plateau (x,z in [-8,8]).
function startedSim(positions) {
  const sim = game.createSim(positions.map(() => ({})), 0, { map: 'arena' });
  positions.forEach(([x, z], i) => {
    sim.karts[i].x = x; sim.karts[i].z = z; sim.karts[i].y = 0;
    sim.karts[i].grounded = true; sim.karts[i].vy = 0;
  });
  return sim;
}
const fire = (n, who) => Array.from({ length: n }, (_, i) => (i === who ? { last: { fire: true } } : {}));
const NOW = 5000; // > startAt (countdown 3000), < endsAt

test('MG damages the nearest visible enemy with distance falloff', () => {
  const sim = startedSim([[20, 0], [27.5, 0]]); // dist 7.5 -> mgDamage = 5.25
  sim.karts[0].weapon = 'mg'; sim.karts[0].ammo = 24; sim.karts[0].nextShotAt = 0;
  game.step(sim, fire(2, 0), 1 / 30, NOW);
  assert.equal(sim.karts[1].hp, 100 - 5.25);
  assert.equal(sim.karts[0].ammo, 23);
  assert.equal(sim.projectiles.length, 1);
  assert.equal(sim.projectiles[0].type, 'mg');
});

test('idle fire (no target in range) still spends ammo and spawns a bullet, no damage', () => {
  const sim = startedSim([[20, 0], [39, 0]]); // dist 19 > range 15
  sim.karts[0].weapon = 'mg'; sim.karts[0].ammo = 24; sim.karts[0].nextShotAt = 0;
  game.step(sim, fire(2, 0), 1 / 30, NOW);
  assert.equal(sim.karts[1].hp, 100);   // untouched
  assert.equal(sim.karts[0].ammo, 23);  // still spent
  assert.equal(sim.projectiles.length, 1);
});

test('a shielded nearest target absorbs damage but ammo is still spent', () => {
  const sim = startedSim([[20, 0], [27.5, 0]]);
  sim.karts[0].weapon = 'mg'; sim.karts[0].ammo = 24; sim.karts[0].nextShotAt = 0;
  sim.karts[1].shieldUntil = NOW + 1000;
  game.step(sim, fire(2, 0), 1 / 30, NOW);
  assert.equal(sim.karts[1].hp, 100);
  assert.equal(sim.karts[0].ammo, 23);
});

test('firing the last round clears the weapon (must re-collect a crate)', () => {
  const sim = startedSim([[20, 0], [27.5, 0]]);
  sim.karts[0].weapon = 'mg'; sim.karts[0].ammo = 1; sim.karts[0].nextShotAt = 0;
  game.step(sim, fire(2, 0), 1 / 30, NOW);
  assert.equal(sim.karts[0].ammo, 0);
  assert.equal(sim.karts[0].weapon, null);
});

test('a cosmetic MG bullet deals no damage as it travels', () => {
  const sim = startedSim([[20, 0], [27.5, 0]]);
  // stationary cosmetic bullet sitting on top of kart 1
  sim.projectiles.push({ id: 99, type: 'mg', owner: 0, h: 0, x: 27.5, z: 0, y: 1, vx: 0, vz: 0, vy: 0, life: 1, cosmetic: true });
  game.step(sim, fire(2, 0).map(() => ({})), 1 / 30, NOW); // nobody fires
  assert.equal(sim.karts[1].hp, 100);
});

test('an MG kill credits the shooter', () => {
  const sim = startedSim([[20, 0], [27.5, 0]]);
  sim.karts[0].weapon = 'mg'; sim.karts[0].ammo = 24; sim.karts[0].nextShotAt = 0;
  sim.karts[1].hp = 3; // < mgDamage(7.5)=5.25
  game.step(sim, fire(2, 0), 1 / 30, NOW);
  assert.equal(sim.karts[1].alive, false);
  assert.equal(sim.karts[0].kills, 1);
});
