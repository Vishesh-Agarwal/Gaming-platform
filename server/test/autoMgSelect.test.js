import test from 'node:test';
import assert from 'node:assert/strict';
import { mgDamage, nearestTarget } from '../src/games/karts.js';

const openMap = { arena: { w: 80, d: 80 }, obstacles: [], ramps: [] };

// helper: minimal sim of karts at given positions, all alive
function simAt(positions) {
  return {
    karts: positions.map(([x, z], i) => ({ x, z, y: 0, alive: true, gone: false, i })),
  };
}

test('mgDamage falls off linearly from near to far', () => {
  assert.equal(mgDamage(0), 8);
  assert.equal(mgDamage(15), 2.5);
  assert.equal(mgDamage(7.5), 5.25);
  assert.equal(mgDamage(30), 2.5); // clamped beyond range
});

test('nearestTarget picks the closest enemy in range', () => {
  const sim = simAt([[0, 0], [5, 0], [10, 0]]);
  assert.equal(nearestTarget(sim, 0, openMap), 1); // 5 is closer than 10
});

test('nearestTarget returns null when the only enemy is beyond range', () => {
  const sim = simAt([[0, 0], [20, 0]]); // 20 > MG_RANGE(15)
  assert.equal(nearestTarget(sim, 0, openMap), null);
});

test('nearestTarget skips a closer enemy behind a wall and picks a farther visible one', () => {
  // Shooter at (0,0), kart1 at (5,0), kart2 at (8,10)
  // Box at (2.5, 0) with w=1, d=1 blocks the line to kart1
  // Box footprint: x ∈ [2,3], z ∈ [-0.5,0.5]
  // Line (0,0)->(5,0): passes through x-segment [0,5], z=0, hits box
  // Line (0,0)->(8,10): at x=2.5, z = 2.5*10/8 = 3.125, outside box (z > 0.5)
  const sim = simAt([[0, 0], [5, 0], [8, 10]]);
  const blocked = { arena: { w: 80, d: 80 }, obstacles: [{ kind: 'box', x: 2.5, z: 0, w: 1, d: 1 }], ramps: [] };
  assert.equal(nearestTarget(sim, 0, blocked), 2);
});

test('nearestTarget excludes self, dead, and gone karts', () => {
  const sim = simAt([[0, 0], [3, 0], [4, 0]]);
  sim.karts[1].alive = false; // nearest is dead
  assert.equal(nearestTarget(sim, 0, openMap), 2);
  sim.karts[2].gone = true;   // next is gone
  assert.equal(nearestTarget(sim, 0, openMap), null);
});
