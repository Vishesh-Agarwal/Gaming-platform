import { test } from 'node:test';
import assert from 'node:assert/strict';
import karts from '../src/games/karts.js';
import { getMap } from '../src/games/kartMaps.js';

const { createSim, createInitialState, step } = karts;

test('createInitialState carries the chosen map + arena', () => {
  const st = createInitialState({ map: 'gauntlet' });
  assert.equal(st.mapId, 'gauntlet');
  assert.deepEqual(st.arena, getMap('gauntlet').arena);
});

test('createSim seeds spawns + crate pads from the map', () => {
  const sim = createSim([{}, {}], 0, { map: 'pillars' });
  const m = getMap('pillars');
  assert.equal(sim.mapId, 'pillars');
  assert.equal(sim.crates.length, m.pads.length);
  assert.deepEqual({ x: sim.karts[0].x, z: sim.karts[0].z }, { x: m.spawns[0].x, z: m.spawns[0].z });
});

test('default map (no options) preserves the open arena', () => {
  const sim = createSim([{}, {}], 0);
  assert.equal(sim.mapId, 'arena');
  assert.equal(sim.crates.length, 5);
});

test('hazard zone damages a kart standing in it (server-side)', () => {
  const sim = createSim([{}, {}], 0, { map: 'gauntlet' });
  const now = sim.startAt + 2000; // past spawn protection
  const hz = getMap('gauntlet').hazards[0];
  const k = sim.karts[0];
  k.x = hz.x; k.z = hz.z; k.shieldUntil = 0;
  const before = k.hp;
  step(sim, { 0: { queue: [{ seq: 1, throttle: 0, steer: 0, fire: false }], last: null } }, 0.033, now);
  assert.ok(sim.karts[0].hp < before || !sim.karts[0].alive, 'hazard should reduce hp');
});
