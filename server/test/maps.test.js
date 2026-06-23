import { test } from 'node:test';
import assert from 'node:assert/strict';
import karts from '../src/games/karts.js';
import { getMap, MAPS, listMaps } from '../src/games/kartMaps.js';

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

test('launchpad map exists and is listed', () => {
  assert.ok(MAPS.launchpad, 'launchpad registered');
  assert.ok(listMaps().some((m) => m.id === 'launchpad'));
});

test('every spawn and pad sits on open, drivable ground (not inside a box footprint)', () => {
  for (const id of Object.keys(MAPS)) {
    const m = MAPS[id];
    const insideBox = (x, z) => (m.obstacles || []).some((o) => {
      if (o.kind !== 'box') return false;
      const hw = o.w / 2, hd = o.d / 2;
      return x >= o.x - hw && x <= o.x + hw && z >= o.z - hd && z <= o.z + hd;
    });
    const insideCyl = (x, z) => (m.obstacles || []).some((o) =>
      o.kind === 'cyl' && Math.hypot(x - o.x, z - o.z) < o.r + 2.2);
    for (const s of m.spawns) {
      assert.ok(!insideBox(s.x, s.z), `${id} spawn (${s.x},${s.z}) inside a box`);
      assert.ok(!insideCyl(s.x, s.z), `${id} spawn (${s.x},${s.z}) inside a cyl`);
    }
    for (const [x, z] of m.pads) {
      assert.ok(!insideBox(x, z), `${id} pad (${x},${z}) inside a box`);
      assert.ok(!insideCyl(x, z), `${id} pad (${x},${z}) inside a cyl`);
    }
  }
});

test('elevated maps actually have ramps', () => {
  for (const id of ['gauntlet', 'launchpad']) {
    assert.ok((MAPS[id].ramps || []).length > 0, `${id} should have ramps`);
  }
});
