import test from 'node:test';
import assert from 'node:assert/strict';
import game, { safeSpawnIndex } from '../src/games/karts.js';
import { getMap } from '../src/games/kartMaps.js';

// arena spawns: 0:(22,0) 1:(0,22) 2:(-22,0) 3:(0,-22)
test('picks the spawn farthest from the nearest living other kart', () => {
  const sim = game.createSim([{}, {}, {}], 0, { map: 'arena' });
  Object.assign(sim.karts[1], { x: 22, z: 0, alive: true });   // cluster near spawn 0
  Object.assign(sim.karts[2], { x: 20, z: 2, alive: true });
  assert.equal(safeSpawnIndex(sim, 0, getMap('arena')), 2);    // (-22,0) is farthest
});

test('falls back to own spawnIdx when no living others', () => {
  const sim = game.createSim([{}, {}], 0, { map: 'arena' });
  sim.karts[1].gone = true; sim.karts[1].alive = false;
  assert.equal(safeSpawnIndex(sim, 0, getMap('arena')), sim.karts[0].spawnIdx);
});
